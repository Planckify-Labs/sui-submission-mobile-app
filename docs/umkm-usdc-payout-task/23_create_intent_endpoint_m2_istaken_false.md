# Task 23 — `POST /v1/pay/intents` Endpoint (Quote + Nanopay Payload Build)

**Status:** Not taken
**Owner:** Backend (takumipay-api)
**Spec reference:** umkm-usdc-payout-spec.md §6.2, §6.5, §6.6, §8.5 #3, milestone M2

## Why this matters

This is the backend's central handler for the scan-to-pay flow. It snapshots the FX rate (60-s freeze), generates the 32-byte Nanopay nonce, builds the EIP-3009 payload with the Circle-provided EIP-712 domain, and returns a self-contained `PaymentIntent` mobile renders without further fetches. The idempotency rule (§8.5 #3) is also load-bearing for future agent-mode integration — retries must not double-create intents.

## Scope

1. Implement `POST /v1/pay/intents` per §6.2 `CreateIntentRequest` → `PaymentIntent`.
2. Merchant resolution:
   - If `merchant.merchantId` present → lookup in `merchants` table.
   - If `merchant.rawPayload` present → parse QRIS/EMVCo, resolve PAN to `merchants.qris_pan`.
   - Unknown merchant → 404 `MERCHANT_NOT_ONBOARDED` (surfaces §9.1 invite copy on mobile).
3. FX snapshot — read the live row from `exchange_rates` for `fromCurrency="USDC"`, `toCurrency="IDR"`, `region="ID"` via `api/endpoints/exchange-rates.ts:exchangeRateApi.getLatestExchangeRate` (type `api/types/exchange-rate.ts:TExchangeRate`). Snapshot these onto `payment_intents`:
   - `exchange_rate_id` (FK, audit trail)
   - `fx_rate_snapshot`, `fx_markup_snapshot`, `fx_from_currency`, `fx_to_currency`, `fx_provider`, `fx_quoted_at`
   - 60-s freeze → `expires_at = now + 60s`.
4. Build `NanopayPayload` (EVM variant in v1):
   - `usdc` + `sourceChainId` + `requirements.asset` from `blockchains` + `tokens` rows for the source chain.
   - `domain.{name, version, verifyingContract}` pulled from the cached `x402_*` columns (task 22).
   - `to: PLATFORM_TREASURY_ADDRESS_EVM` (server env; single platform EOA per §7).
   - `valueMicros` derived from `amountMinor / fx_rate_snapshot × (1 + markup)` + fees.
   - `validAfter: 0`, `validBefore: now + 3 days + small buffer` (Circle rejects `< now + 259_200` with `authorization_validity_too_short`).
   - `nonce`: 32-byte crypto-random, stored in `payment_intents.nanopay_nonce` (`BYTEA UNIQUE`).
   - `submitTo`: our proxy URL (`<base>/v1/pay/intents/<id>/nanopay`) — never Circle.
   - `requirements`: mirrors Circle's `PaymentRequirements` shape for zero-transform forwarding.
5. Idempotency (§8.5 #3): `(userId, merchantId, amountMinor, currency)` within a 30-s window returns the existing intent id instead of creating a new one. Use whatever idempotency helper the repo already has; don't invent a new scheme.
6. Path selection (§5.6): default to `path: "nanopay"`. If `sourceHint` indicates a chain without Gateway coverage AND the user has USDC on Arc, optionally downgrade to `"direct_arc"` — simpler default is to always quote `"nanopay"` in M2; direct-Arc fallback ships in M4 (tasks 34–38).
7. Fees: snapshot `channels.xendit_fee_idr` into `fees_xendit_idr`; `fees_platform_bps` from config; `fees_network_usd_micros = 0` for Path B (gasless).
8. Response: return the full `PaymentIntent` shape from §6.2 — mobile consumes `nanopay`, `fiat`, `usdc`, `merchant.displayName`, `gasless.requiresDeposit` directly.

## Rules (non-negotiable)

- Server computes the USDC amount; mobile displays IDR. User approves IDR; USDC is derived. §9 FX-manipulation rule.
- `submitTo` always points at the takumipay-api proxy — never the raw Circle URL. Memory: `feedback_role_separation.md`.
- `validBefore` MUST be ≥ `now + 259_200` (3 days). Gateway rejects shorter windows.
- EIP-712 domain comes from the cached `/gateway/v1/x402/supported` response (task 22) — do NOT hardcode. If the `x402_*` columns for the chosen source chain are null, the endpoint returns a typed error and the mobile app surfaces "chain not supported" — no silent fallback to the USDC contract domain.
- FX snapshot uses existing `exchange_rates` table + `TExchangeRate`; no new FX table (§6.6 "FX prerequisites").
- Idempotency key is server-computed from the request tuple — don't rely on clients to send an `Idempotency-Key` header for this endpoint. Memory: `feedback_filter_at_source.md` (the server is the source of truth).

## Acceptance

- [ ] `POST /v1/pay/intents` returns a complete `PaymentIntent` matching the §6.2 shape.
- [ ] FX row snapshotted onto `payment_intents`; `exchange_rate_id` FK populated.
- [ ] 32-byte `nanopay_nonce` generated, persisted, returned in `nanopay.nonce`.
- [ ] `validBefore ≥ now + 259_200` enforced; unit test covers the guard.
- [ ] `nanopay.domain` populated from `blockchains.x402_*` columns (task 22 dependency).
- [ ] Idempotency test: two identical requests within 30 s return the same `intentId`; the 31st second returns a new id.
- [ ] Unknown merchant → 404 with `MERCHANT_NOT_ONBOARDED` code.
- [ ] `pnpm run test` clean; `pnpm run test:e2e` covers the happy path and the idempotency window.

## Out of scope

- `POST /v1/pay/intents/:id/nanopay` submit-proxy handler — separate sibling task in M2 backend scope (close companion; may land in same PR).
- `GET /v1/pay/intents/:id` status poll endpoint — trivial read; same PR or sibling.
- `POST /v1/pay/intents/:id/deposit-receipt` onboarding handler — M3 tasks 24–33.
- SVM NanopayPayload variant — M6 (tasks 42–43).
- Xendit payout kick-off from the settle callback — handled by the nanopay submit endpoint, not this one.
- FX refresh cron — explicitly out of v1 scope per §6.6; `markup: 1.5` absorbs drift.
