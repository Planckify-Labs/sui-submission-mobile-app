# `api/` Zerion free-tier client

**Phase 1 — MVP**

Refer to `../defi-strategies-spec.md` §9.2.
Implement `external/zerion.client.ts` with Bearer-auth for the portfolio summary card and cross-chain position rollup.
Track request count in Valkey under a 24h sliding window. Implement short-circuit to cached data when `DEFI_ZERION_DAILY_BUDGET_REQUESTS` is hit to respect the 1k/day free-tier limit.