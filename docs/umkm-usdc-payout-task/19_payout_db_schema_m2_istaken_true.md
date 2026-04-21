# Task 19 — Backend DB Schema: Payout Tables + `blockchains` Extension

**Status:** Not taken
**Owner:** Backend (takumipay-api)
**Spec reference:** umkm-usdc-payout-spec.md §6.6, §7.1, milestone M2

## Why this matters

Every primitive in §6 — merchant signup, payment intents, Nanopay proxy, Xendit payout, Gateway deposit tracking, channel picker — persists through these tables. Without the schema, the backend handlers that mobile (tasks 15–18) calls into have nowhere to write. The `blockchains` extension is what makes the enriched `GET /v1/blockchains` response (task 21) possible — Circle contract coordinates live as columns so adding a chain or rotating a contract is a SQL update with zero mobile release.

## Scope

1. Prisma migration creating 6 new tables per §6.6:
   - `merchants` (onboarded UMKM profile; encrypt `xendit_account_number` at rest)
   - `payment_intents` (every scan-to-pay attempt; `nanopay_nonce BYTEA UNIQUE`)
   - `nanopay_submissions` (signed authorization audit; Circle attestation arrival)
   - `xendit_payouts` (one row per `POST /v2/payouts`; encrypt `account_number_encrypted` at rest)
   - `gateway_deposits` (one-time deposit per user per source chain)
   - `channels` (ops-managed Xendit channel catalog)
   - `merchant_qris_claims` (dispute audit trail)
2. Extend existing `blockchains` table with 7 new nullable columns per §7.1:
   - `gateway_wallet_contract TEXT NULL`
   - `gateway_minter_contract TEXT NULL`
   - `paymaster_address TEXT NULL`
   - `x402_domain_name TEXT NULL`
   - `x402_domain_version TEXT NULL`
   - `x402_verifying_contract TEXT NULL`
   - `x402_facilitator_url TEXT NULL`
3. Create every index listed in §6.6 "Indexes" block verbatim — including the partial unique `merchants(qris_pan) WHERE qris_pan IS NOT NULL` and `xendit_payouts(xendit_payout_id) WHERE NOT NULL`.
4. Wire encryption at rest for `merchants.xendit_account_number` and `xendit_payouts.account_number_encrypted` using whichever envelope (`pgcrypto`, KMS, app-level) the repo already uses for existing secrets — do not invent a new scheme.
5. FK constraints: `payment_intents.exchange_rate_id → exchange_rates.id` (audit trail for FX snapshot per §6.6 FX prerequisites).
6. Run through existing Prisma flow — `pnpm prisma migrate dev` — no new tooling.

## Rules (non-negotiable)

- No `is_merchant` boolean on `users`; presence of a `merchants.user_id = users.id` row is the source of truth (§6.6 "What's not in the schema").
- No `treasury_contracts` table — v1 treasury is a single platform EOA from env vars.
- JWS signatures and tx hashes stay plaintext; only the two listed account-number columns are encrypted.
- Column names and types mirror §6.6 exactly — these are the canonical names the API layer references.
- Seed data (`blockchains` Arc row, `tokens` USDC row, channels, exchange rate) is out of scope here — task 20 handles seed population.

## Acceptance

- [ ] Prisma migration applies cleanly on empty DB and on dev DB with existing data.
- [ ] `prisma generate` produces typed clients for all 7 new tables + extended `blockchains`.
- [ ] All indexes from §6.6 present (`\d+` inspection matches the spec list).
- [ ] Encrypted columns round-trip through whatever envelope helper the repo uses.
- [ ] Existing unit/e2e tests still pass (`pnpm run test`, `pnpm run test:e2e`).
- [ ] Migration rollback path verified (`prisma migrate resolve`).

## Out of scope

- Seed data — task 20 (Arc blockchain row, USDC token, exchange rate, channels).
- Endpoint handlers (`POST /v1/pay/intents`, `/nanopay`, merchant signup, etc.) — task 23 handles `createIntent`; merchant endpoints live in M1 (tasks 01–14).
- Enriched `GET /v1/blockchains` serialization — task 21.
- x402 supported boot-cache job that populates the new `x402_*` columns — task 22.
