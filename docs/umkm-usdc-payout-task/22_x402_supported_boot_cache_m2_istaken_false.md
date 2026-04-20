# Task 22 — Cache Circle `/gateway/v1/x402/supported` at Boot + Daily Cron

**Status:** Not taken
**Owner:** Backend (takumipay-api) + Ops
**Spec reference:** umkm-usdc-payout-spec.md §6.5, §13 #2, milestone M2

## Why this matters

Mobile signs EIP-3009 against Circle's `GatewayWallet` EIP-712 domain — `{ name, version, verifyingContract }` per source chain. These values live behind `GET /gateway/v1/x402/supported` and can change when Circle redeploys or adds a network. Hand-maintaining them in seed.ts drifts; hardcoding them in mobile forces a release on every rotation. The right discipline (§13 "At backend boot") is: fetch on boot, refresh daily, write into `blockchains.x402_*` columns, serve through the enriched `GET /v1/blockchains` response (task 21).

## Scope

1. Boot hook in `takumipay-api` startup:
   - On service start, fetch `GET https://gateway-api-testnet.circle.com/gateway/v1/x402/supported` (prod base in prod env).
   - Parse the response per-network.
   - Upsert into `blockchains.x402_domain_name`, `x402_domain_version`, `x402_verifying_contract` for each matching `chain_id`.
   - Log any source-chain entry Circle advertises that we don't have a `blockchains` row for — do NOT auto-create rows.
2. Daily cron (whatever scheduler the repo uses — BullMQ repeatable job, `node-cron`, or external scheduler) running the same refresh routine. 24 h cadence is fine; Circle doesn't rotate often.
3. Error handling: on fetch failure, keep the last-known DB values (do NOT null them). Emit a metric / log; the existing settle path continues to work off stale-but-valid values.
4. Reactive refresh: when `POST /gateway/v1/x402/settle` returns a domain-related `errorReason` (`unsupported_scheme`, `invalid_payload`, `address_mismatch` when the address is a Gateway one), trigger an out-of-cycle refresh before the next settle attempt.
5. Feature-flag the boot fetch behind `CIRCLE_X402_SUPPORTED_REFRESH_ENABLED` (server env) so local dev can opt out and rely on hand-seeded values.

## Rules (non-negotiable)

- Never write to mobile-visible columns from untrusted upstream unchecked — validate `verifyingContract` is a 20-byte hex; log and skip if malformed.
- Circle API requires no auth key (`security: []` in the OpenAPI); do not stub a key placeholder. §6.5 rationale applies.
- The refresh job writes server-side only; mobile learns about changes via the enriched `GET /v1/blockchains` (task 21) on next cache refresh — no push, no WebSocket. Memory: `feedback_filter_at_source.md`.
- Failure to refresh is non-fatal; do NOT crash the service. Memory: `feedback_role_separation.md` (server keeps thinking even when an upstream is flaky; mobile-side execution doesn't depend on this call succeeding).

## Acceptance

- [ ] Boot hook runs and populates `x402_*` columns for every `blockchains` row Circle advertises.
- [ ] Daily cron scheduled and observed to fire once in staging.
- [ ] Reactive refresh triggered on matching `errorReason` classes in the settle path.
- [ ] Circle fetch failure leaves last-known values intact; error logged.
- [ ] Unit tests cover: parse happy path, malformed payload skipped, fetch timeout handled.
- [ ] `pnpm run test` clean; `pnpm run test:e2e` clean.

## Out of scope

- Adding new `blockchains` rows automatically — humans add chains via seed.ts (task 20 pattern) + migration.
- Paymaster / Bundler refresh — separate concerns; paymaster is static per deployment, bundler stays in env.
- Mainnet migration — task 48.
- Monitoring dashboards / alerts on refresh failures — task 50 ops credentials + observability scope.
