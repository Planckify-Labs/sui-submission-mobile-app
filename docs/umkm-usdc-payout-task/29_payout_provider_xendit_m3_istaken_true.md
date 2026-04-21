# Task 29 — PayoutProvider Interface + XenditPayoutProvider

**Status:** Not taken
**Owner:** Backend (takumipay-api)
**Spec reference:** umkm-usdc-payout-spec.md §6.4, milestone M3

## Why this matters
The Xendit call in §6.4 lives behind a `PayoutProvider` interface — same space-docking pattern as mobile's `WalletKitAdapter`. One port, many adapters. v1 ships a single `XenditPayoutProvider`, but the interface keeps us honest: when Flip / Paymongo / dLocal / a BI-licensed acquirer relationship lands, the intent-settlement core does not change. Mobile never learns the provider name — it reads only `intent.status` and `intent.fiat`.

## Scope
1. Define `PayoutProvider` interface in `takumipay-api` (e.g. `src/payouts/provider.port.ts`): single method `disburse(intent: PaymentIntent, merchant: MerchantProfile): Promise<PayoutDispatchResult>`. Return type carries `{ providerPayoutId, status, requestedAt, rawResponse }`.
2. Implement `XenditPayoutProvider` against `POST https://api.xendit.co/v2/payouts` per §6.4 body shape: `{ reference_id: intent.intentId, channel_code, channel_properties: { account_number, account_holder_name }, amount, currency, description }`.
3. Set `Idempotency-key: intent.intentId` header so retries do not double-disburse.
4. Auth: `Authorization: Basic ${base64(XENDIT_SECRET_KEY + ":")}` — empty password per Xendit HTTP Basic convention.
5. Persist `xendit_payouts` row: `{ intent_id, xendit_payout_id, reference_id, channel_code, account_number_encrypted, amount, currency, status: "PENDING", requested_at, xendit_response_body }`. `xendit_response_body` is full JSONB for dispute debugging.
6. Provider selection: read `merchants.payout_provider` (default `"xendit"` per §6.6 `merchants` schema). Resolver lives in a factory, keyed on the string — new providers slot in without touching the resolver's callers.
7. Consumed synchronously by task 24's `/nanopay` handler on settle 200 OK.

## Rules (non-negotiable)
- Three-role separation: mobile NEVER calls Xendit. Mobile NEVER sees `XENDIT_*` env values. Mobile NEVER sees the provider name — `intent.status` and `intent.fiat` are the only payout-visible fields.
- Chain-extension discipline: `PayoutProvider` is the port (same pattern as `WalletKitAdapter`). A new provider is a new adapter file implementing the port. No `if (provider === "xendit")` branches leak into `nanopay` handler or intent creation.
- Filter-at-source: provider selection keyed on `merchants.payout_provider` column, not a hardcoded default in the factory caller.

## Acceptance
- [ ] `PayoutProvider` interface exported; `XenditPayoutProvider` implements it.
- [ ] Factory resolves `"xendit"` → `XenditPayoutProvider`; unknown values throw a typed error surfaced in logs.
- [ ] Unit tests mock Xendit 200 / 400 / 5xx; idempotency-key set to `intent.intentId` on every retry.
- [ ] `xendit_payouts` row persisted before returning to the `nanopay` controller — audit trail survives caller crashes.
- [ ] `account_number_encrypted` uses the same at-rest encryption helper as `merchants.xendit_account_number` (§6.6).
- [ ] `pnpm run test -- --testPathPattern=payouts` green.
- [ ] `pnpm check:syntax` and `pnpm biome:check` clean.

## Out of scope
- Xendit webhook handler (task 30).
- Refund runbook for `XENDIT_PAYOUT_DECLINED` (task 49).
- Flip / Paymongo adapters — slot-in work, not v1 scope.
