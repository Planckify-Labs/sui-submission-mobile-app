# Task 34 — Onboarding Gateway Deposit Screen (`/onboarding/nanopay-deposit`)

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** umkm-usdc-payout-spec.md §5.2 "One-time setup per user", §5.4 gasless summary, §9.1 `REQUIRES_DEPOSIT` / `DEPOSIT_PENDING_ATTESTATION` / `DEPOSIT_FAILED`, milestone M4

## Why this matters

Every user's very first scan-to-pay hits `gasless.requiresDeposit: true` on the intent response — Circle Nanopayments needs a funded `GatewayWallet` position before it can batch any authorization. This screen is the one-time on-chain moment in the whole product, after which every subsequent payment is signing-only. Without it, the first-payment path is a dead-end; the path selector (task 41) routes here before it routes anywhere else.

## Scope

1. Create `app/onboarding/nanopay-deposit.tsx`. Presents a source-chain picker (rendered from `useBlockchains()` filtered where `row.gateway != null`) + amount field + Pay button.
2. Pull the set of supported source chains from the enriched `GET /v1/blockchains` + `POST /v1/balances` — never hardcode the Gateway domain enum (§5.2 step 1 has the testnet list, but the DB is the source of truth).
3. Entrypoints: (a) `REQUIRES_DEPOSIT` error from any `/v1/pay/intents` that set `gasless.requiresDeposit: true`; (b) a standalone CTA on the home screen "Set up gasless payments."
4. On submit, delegate to `services/nanopay/gatewayDeposit.ts` (task 36). Paymaster vs plain `sendTransaction` is decided inside that service by the chain-config row — the screen is transport-agnostic.
5. Post-submit: `POST /v1/pay/intents/:id/deposit-receipt` (task 38) then poll `GET /v1/pay/intents/:id` until `gasless.requiresDeposit: false`. Show `DEPOSIT_PENDING_ATTESTATION` skeleton spinner during poll (§9.1); map `DEPOSIT_FAILED` to the retry CTA.
6. Copy rule: this screen is **payer-facing** (§1.1 user role), so USDC/chains/gas terms are fine. The merchant-side rule from §1.1 does not apply here.

## Rules (non-negotiable)

- Chain list comes from the API hook, not env, not hardcoded. Filter at the hook level if possible (memory: `feedback_filter_at_source.md`) — do not fetch all chains and `.filter()` in the component.
- No `if (namespace === "eip155")` branches. Screen asks the kit via `kit.sendUserOpWithUsdcPaymaster != null` to decide gasless vs plain. Solana kit absence is handled by the path selector, not here. Memory: `feedback_chain_extension_discipline.md`.
- Adapter signs only (task 35). This screen never calls bundler URLs directly — submit always goes through `takumipay-api /v1/userop/submit` (task 37). Memory: `feedback_role_separation.md`.
- Private key stays in `expo-secure-store`. No raw-key export to `permissionless` / viem — `WalletKitAdapter` is the only seam.

## Acceptance

- [ ] Screen renders at `/onboarding/nanopay-deposit` via Expo Router.
- [ ] Source-chain picker lists only chains where `blockchain.gateway != null`, via a hook-level filter.
- [ ] `REQUIRES_DEPOSIT` from `/v1/pay/intents` navigates here with the pending intent id in params; post-deposit returns to `/pay-merchant` with that intent.
- [ ] Polling surfaces `DEPOSIT_PENDING_ATTESTATION` and `DEPOSIT_FAILED` UX states.
- [ ] `pnpm check:syntax` clean.
- [ ] `pnpm biome:check` clean.

## Out of scope

- UserOp build + Paymaster wiring — task 35 (`sendUserOpWithUsdcPaymaster`) and task 36 (`gatewayDeposit.ts`).
- `/v1/userop/submit` proxy — task 37.
- `/v1/pay/intents/:id/deposit-receipt` endpoint — task 38.
- Path selector dispatch — task 41.
