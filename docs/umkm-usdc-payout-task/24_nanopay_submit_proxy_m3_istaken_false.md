# Task 24 — Nanopay Submit Proxy (Circle Gateway x402 settle)

**Status:** Not taken
**Owner:** Backend (takumipay-api)
**Spec reference:** umkm-usdc-payout-spec.md §6.2, §6.4, §6.5, milestone M3

## Why this matters
The mobile app never talks to Circle directly — it POSTs a signed EIP-3009 authorization to `takumipay-api`, which proxies to Circle Gateway's `POST /gateway/v1/x402/settle`. This is the single synchronous hop that turns a user's signature into a "PAID" attestation, after which the backend fires the Xendit payout. Uniform server-side pipeline gives us an audit trail before Circle even returns and keeps mobile key hygiene intact.

## Scope
1. Implement `POST /v1/pay/intents/:id/nanopay` per §6.2 `NanopaySubmitRequest` / `NanopaySubmitResponse`.
2. Validate the submitted `payload` against the stored intent — reject mismatches as `SIGNATURE_INVALID` before calling Circle.
3. Forward `{ paymentPayload, paymentRequirements }` to `POST /gateway/v1/x402/settle` at `CIRCLE_GATEWAY_API` (no API key — `security: []`).
4. On 200 OK: persist settle response `transaction` UUID on `nanopay_submissions.circle_settle_tx_uuid`, set `circle_settle_network`, `circle_settle_response_received_at`; flip `payment_intents.status` to `SETTLED`.
5. Synchronously invoke the `PayoutProvider` (task 29) to dispatch Xendit — do not defer to a queue in v1.
6. Map Circle `errorReason` enum to `NanopayFailureCode` per §6.5 last paragraph: `insufficient_balance` → `INSUFFICIENT_GATEWAY_BALANCE`; `nonce_already_used` → `NONCE_REUSED`; `authorization_not_yet_valid` / `authorization_expired` / `authorization_validity_too_short` → `QUOTE_EXPIRED` / `AUTHORIZATION_EXPIRED`; `invalid_signature` / `address_mismatch` / `amount_mismatch` / `invalid_payload` / `unsupported_*` → `SIGNATURE_INVALID`; `self_transfer` / `unsupported_domain` / `wallet_not_found` → `CIRCLE_UPSTREAM_ERROR`.
7. Persist raw `errorReason` string on `nanopay_submissions.failure_message` for debugging.

## Rules (non-negotiable)
- Three-role separation: mobile never sees the Circle base URL; no `EXPO_PUBLIC_CIRCLE_*` env leak. Server never signs on behalf of the user — only forwards the signature the user produced.
- Chain-extension discipline: do not branch on `sourceChainId` or `namespace` in the handler — the `NanopayPayload` discriminated union carries every field the proxy forwards. SVM rows flow through the same handler once M6 lands.
- Filter-at-source: validation lives in the controller (Zod schema on `NanopaySubmitRequest`), not in consumers downstream.
- Circle settle is permissionless — proxy is discipline, not credential. Do not add `Authorization` headers to the forwarded request.

## Acceptance
- [ ] Controller + service unit-tested with mocked Circle 200 / 4xx / 5xx responses covering every `errorReason` branch.
- [ ] Integration test: full round-trip against Circle testnet (`gateway-api-testnet.circle.com`) with a seeded intent.
- [ ] `nanopay_submissions` row created with `circle_settle_tx_uuid` populated on success.
- [ ] `payment_intents.status` transitions `SIGNED → SETTLED` atomically with submission row; Xendit call fires before HTTP response returns.
- [ ] `pnpm run test -- --testPathPattern=nanopay` green.
- [ ] `pnpm check:syntax` and `pnpm biome:check` clean.

## Out of scope
- Xendit disbursement implementation (task 29 `XenditPayoutProvider`).
- Xendit webhook handling (task 30).
- Mobile-side receipt invalidation on 200 OK (task 31).
