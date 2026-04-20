# Task 30 — Xendit Webhook Handler (POST /webhooks/xendit)

**Status:** Not taken
**Owner:** Backend (takumipay-api)
**Spec reference:** umkm-usdc-payout-spec.md §6.3, §6.4, §13 #1, milestone M3

## Why this matters
Xendit calls back asynchronously when a disbursement completes. The webhook is the only trigger that flips a `SETTLED` intent to `PAID_OUT` (or `FAILED`) and fires the payer-facing push notification. Without this handler, the UMKM sees IDR land in their wallet but the TakumiPay user sees a stuck "processing" screen — which is the exact failure mode the spec's three-role separation is designed to prevent.

## Scope
1. Implement `POST /webhooks/xendit` handler at `takumipay-api`.
2. Verify the `x-callback-token` header against `XENDIT_WEBHOOK_TOKEN` from `takumipay-api/.env` (stashed per §13 #1 during Xendit dashboard setup). 401 on mismatch.
3. Parse Xendit's callback body — match on `reference_id` (= `intent.intentId`) to locate the `xendit_payouts` row.
4. On event = `PAID` (or equivalent success status): set `xendit_payouts.status = "COMPLETED"`, `completed_at = now()`, `webhook_received_at = now()`. Flip `payment_intents.status` to `PAID_OUT`. Emit FCM/APNs push to `payer_user_id` (wired in task 32).
5. On event = `FAILED`: set `xendit_payouts.status = "FAILED"`, `webhook_received_at = now()`. Flip `payment_intents.status` to `FAILED`. Link the ops runbook comment to task 49 (refund runbook) in the error log emitted.
6. Stash the full callback body in `xendit_payouts.xendit_response_body` (JSONB) — Xendit returns nested error shapes that are painful to normalize up-front (§6.6 comment).
7. Handler is idempotent on `reference_id` — Xendit retries webhooks; duplicate deliveries must be no-ops.

## Rules (non-negotiable)
- Three-role separation: webhook token lives only in `takumipay-api/.env`. Never on mobile, never in git. Mobile only observes the intent status transition via polling (task 25).
- Chain-extension discipline: handler does not branch on source chain or namespace — the `intent_id` correlation is chain-agnostic.
- Filter-at-source: idempotency lookup is a single `xendit_payouts` query on `reference_id`. Do not cache webhook state in memory.

## Acceptance
- [ ] `x-callback-token` mismatch → 401; match → 200 with body-parse.
- [ ] `PAID` callback flips intent to `PAID_OUT` and persists `completed_at`.
- [ ] `FAILED` callback flips intent to `FAILED` and logs a reference to task 49 (refund runbook).
- [ ] Duplicate deliveries are idempotent — second `PAID` on same `reference_id` is a no-op (no double-push, no status reset).
- [ ] `xendit_response_body` JSONB populated with full callback payload.
- [ ] FCM/APNs push fires on `PAID_OUT` transition (integration with task 32).
- [ ] `pnpm run test -- --testPathPattern=xendit-webhook` green with mocked payloads covering PAID / FAILED / duplicate.
- [ ] `pnpm check:syntax` and `pnpm biome:check` clean.

## Out of scope
- FCM/APNs push wiring + mobile deep-link handling (task 32).
- Refund runbook when `XENDIT_PAYOUT_DECLINED` (task 49).
- Channel-cap (`XENDIT_PAYOUT_LIMIT_EXCEEDED`) merchant-notification flow (§9.1 — follow-up UX polish).
