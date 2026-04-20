# Task 31 — Receipt Screen + Live Status Invalidation

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** umkm-usdc-payout-spec.md §2 step 9, §6.3, milestone M3

## Why this matters
After the user signs and the `/nanopay` proxy returns 200, the mobile app needs to show a receipt that feels instant — "the merchant sees PAID in <500 ms" is the load-bearing M3 UX promise. TanStack Query invalidation on the submit mutation gives us an immediate optimistic flip to `SETTLED`, while the polling query (task 25 contract) keeps refreshing until `PAID_OUT` lands.

## Scope
1. Build the receipt screen (likely `app/pay-merchant/receipt.tsx` or the `/pay-merchant` route's success branch).
2. Display: merchant name (from `intent.merchant.displayName`), amount in IDR (from `intent.fiat`), USDC debited (from `intent.usdc`), Circle attestation UUID collapsed under "Details" (from the settle response UUID surfaced on the intent), intent id `pi_…` copyable for support.
3. Clipboard discipline: intent id is copyable; merchant tokens / JWS fragments are NOT (per `docs/clipboard-policy.md` and §9 "Clipboard hygiene").
4. Wire TanStack Query invalidation on `POST /nanopay` 200 OK — `queryClient.invalidateQueries({ queryKey: ["payment-intent", intentId] })` so the polling query from task 25 refreshes instantly and the badge flips from `SETTLED` to `PAID_OUT` when the webhook fires.
5. Polling stale time: 3 seconds, per §6.2 comment ("not shorter — Circle attestation is <500 ms so one poll after POST is usually enough").
6. Add a skeleton state for `SETTLED → PAID_OUT` transition: "Sending rupiah to {merchantName}…" with a subtle spinner, switching to the final receipt chrome on `PAID_OUT`.

## Rules (non-negotiable)
- Three-role separation: mobile never displays Circle attestation internals beyond the opaque UUID. No Xendit ids, no webhook payloads, no `XENDIT_*` env references in the UI.
- Chain-extension discipline: receipt renders from the `PaymentIntent` shape, which is namespace-agnostic. Do not branch on `intent.nanopay.kind` for the receipt layout — SVM (M6) renders the same screen.
- Filter-at-source: the query hook for the intent exposes the poll itself; do not post-filter or client-side mutate intent state. Source of truth is the server.

## Acceptance
- [ ] Receipt renders all four fields (merchant name, IDR, USDC, attestation UUID) plus a copyable intent id.
- [ ] Invalidation fires on mutation success; verified with a TanStack devtools trace in dev.
- [ ] Polling query observes `SETTLED → PAID_OUT` within one poll window after task 30's webhook flips the status.
- [ ] Skeleton state shown between `SETTLED` and `PAID_OUT`; final chrome on `PAID_OUT`.
- [ ] No regressions on existing `/pay-merchant` flow.
- [ ] `pnpm check:syntax` and `pnpm biome:check` clean.

## Out of scope
- Push-notification deep-link handling when app is backgrounded (task 32).
- Merchant payout history screen (deferred per §6.1 comment).
- Agent-mode `<PaymentIntentCard>` renderer (task 46).
