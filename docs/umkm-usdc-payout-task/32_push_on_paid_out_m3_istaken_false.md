# Task 32 — Push Notification on PAID_OUT

**Status:** Not taken
**Owner:** Mobile + Backend
**Spec reference:** umkm-usdc-payout-spec.md §6.3, §8.3, milestone M3

## Why this matters
The Xendit webhook is the ONLY trigger that confirms the merchant actually received IDR — without a push, the payer can't close the loop if they've backgrounded the app. §6.3 is explicit: "For push-style UX (notification banner when Xendit payout finishes and the merchant says OK thanks), takumipay-api emits FCM / APNs to the payer." The deep-link payload matches the one agent mode will use post-v1 (§8.3), so we pay down the integration cost now.

## Scope
**Backend (`takumipay-api`):**
1. On `payment_intents.status` transition to `PAID_OUT` (from task 30's webhook handler), dispatch FCM / APNs to the `payer_user_id`'s registered device tokens.
2. Payload: `{ intentId, merchantDisplayName, fiatAmountMinor, fiatCurrency }`. Notification title / body localized by `country` (v1 baseline English).
3. Reuse any existing FCM/APNs infrastructure in `takumipay-api`. Device-token registration assumed to exist or be orthogonal to this task.
4. Deep-link URL in the notification data: `takumipay://pay-merchant?intentId=${intentId}` — same scheme agent mode uses (§8.3 `AgentPaymentCard.deepLink`).

**Mobile (`mobile-app`):**
5. Handle the incoming push: tapping the notification navigates via Expo Router to `/pay-merchant?intentId=…`, landing on the receipt view from task 31.
6. Foreground push: show an in-app banner (non-intrusive toast) that taps to the same route.
7. Linking config: confirm `app/_layout.tsx` / Expo Router linking already accepts `takumipay://pay-merchant?intentId=…` — if not, add it. This is also called out in §8.5 as a v1 requirement.

## Rules (non-negotiable)
- Three-role separation: notification payload carries no Xendit / Circle internals. Only `intentId` + user-facing display fields.
- Chain-extension discipline: deep-link scheme is namespace-agnostic. `intentId` is all mobile needs — the `/pay-merchant` route re-fetches the intent shape which carries the correct namespace/chain discriminator.
- Filter-at-source: payer resolution is a DB join on `payment_intents.payer_user_id` → device tokens. Do not maintain a parallel notification queue.

## Acceptance
- [ ] Webhook flip to `PAID_OUT` triggers FCM / APNs dispatch within the same DB transaction boundary.
- [ ] Notification payload shape matches spec exactly: `{ intentId, merchantDisplayName, fiatAmountMinor, fiatCurrency }`.
- [ ] Tapping notification (cold start) deep-links to `/pay-merchant?intentId=…` showing the task 31 receipt.
- [ ] Foreground toast for same-session push, with tap → same deep link.
- [ ] Linking config at `app/_layout.tsx` confirmed or added.
- [ ] Manual test: send a staged webhook → observe push on a real device → tap → receipt screen renders with `PAID_OUT` badge.
- [ ] `pnpm check:syntax` and `pnpm biome:check` clean.

## Out of scope
- Push on `FAILED` status (task 44 error matrix, with `XENDIT_PAYOUT_DECLINED` copy per §9.1).
- Device-token registration endpoint (assumed orthogonal / existing).
- Agent mode `<PaymentIntentCard>` deep-link rendering (task 46).
