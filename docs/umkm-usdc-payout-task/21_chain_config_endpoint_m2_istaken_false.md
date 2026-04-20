# Task 21 — Enrich `GET /v1/blockchains` Response (Gateway / Paymaster / x402)

**Status:** Not taken
**Owner:** Backend (takumipay-api)
**Spec reference:** umkm-usdc-payout-spec.md §6.7, milestone M2

## Why this matters

Config-as-data is the v1 doctrine — every per-chain coordinate the mobile app needs (RPC, Gateway contracts, Paymaster, x402 domain for EIP-3009 signing) rides on `GET /v1/blockchains` instead of mobile env vars (§10 reduces mobile env to three bootstrap variables). Without the enriched payload, mobile can't build the EIP-712 typed-data correctly for Nanopay — and hardcoding contract addresses on-device would force an app release every time Circle rotates a contract or we add a chain.

## Scope

1. Extend `TBlockchain` in `api/types/blockchain.ts` with three nested-nullable objects per §6.7:
   - `gateway: { walletContract, minterContract } | null`
   - `paymaster: { address } | null`
   - `x402: { domainName, domainVersion, verifyingContract, facilitatorUrl } | null`
2. Update the `GET /v1/blockchains` serializer to map the 7 new `blockchains` columns (task 19) into the nested objects. Null-coalesce: if all gateway columns are null, emit `gateway: null` (not an object of nulls).
3. Additive rollout — existing clients that don't read the new fields stay functional; new mobile clients need them. Do NOT version-bump the endpoint path.
4. Ensure the enriched shape flows through whatever DTO layer the repo uses (don't leak Prisma types directly — match the existing `TBlockchain` contract discipline).
5. Update API tests for `/v1/blockchains` to assert the new fields render for the Arc Testnet row and render `null` for rows without Gateway/Paymaster/x402 coverage.

## Rules (non-negotiable)

- Config-as-data: addresses live in DB columns, never in mobile env. §10 locks mobile down to `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_AI_API_URL`, `EXPO_PUBLIC_TAKUMIPAY_QR_PUBKEY_JWK` only.
- Additive only — no breaking changes to existing `TBlockchain` consumers. Memory: `feedback_filter_at_source.md` (server exposes the filter/field; clients don't post-process).
- Nested-nullable objects (not flat nullable strings on the wire) — matches the shape mobile consumes via `useBlockchains()` and feeds directly into `PaymentIntent.nanopay.domain`.
- Bundler URLs stay server-side env (`BUNDLER_URL_<chainId>`); NEVER serialize into `/v1/blockchains`. Memory: `feedback_role_separation.md` (server holds the bundler key; mobile submits signed UserOps through `/v1/userop/submit`, not directly).

## Acceptance

- [ ] `TBlockchain` type in `api/types/blockchain.ts` updated with the three new nullable objects.
- [ ] `GET /v1/blockchains` returns the Arc Testnet row with populated `gateway`, `paymaster: null`, `x402` objects.
- [ ] Rows without Gateway coverage serialize `gateway: null`, not `gateway: { walletContract: null, … }`.
- [ ] Existing API tests still pass; new tests cover the nested-nullable serialization.
- [ ] Mobile `useBlockchains()` hook (no changes needed) picks up the new fields on next cache refresh.

## Out of scope

- Populating the `x402_*` columns via `/gateway/v1/x402/supported` boot + cron — task 22.
- `POST /v1/userop/submit` proxy endpoint — M3 onboarding-deposit scope (tasks 24–33).
- Mobile consumer changes — no mobile work required; fields are additive.
- Mainnet row — task 48 handles Arc mainnet cut-over.
