# Task 20 — Seed Arc Testnet `blockchains` + USDC `tokens` Rows

**Status:** Not taken
**Owner:** Backend (takumipay-api)
**Spec reference:** umkm-usdc-payout-spec.md §7.1 Insert 1 + Insert 2, §6.8 items #1+#2, milestone M2

## Why this matters

Arc Testnet must be a live row in the `blockchains` and `tokens` tables before the mobile app's `useBlockchains()` / `useTokens()` hooks can see it. The row carries the Gateway contract coordinates mobile signs against (via the enriched response in task 21). Putting this in `seed.ts` — the same file that today seeds exchange rates (`api/src/scripts/prisma/seed.ts:1133-1141`), blockchains, tokens, and products — means adding a chain is literally "insert two rows," per §7.1's space-docking payoff.

## Scope

1. Update `api/src/scripts/prisma/seed.ts` — add a new upsert block near the existing blockchains/tokens seed. Use `upsert` keyed on natural keys so re-running `pnpm prisma db seed` is idempotent in every environment.
2. Insert 1 — `blockchains` upsert (key: `chain_id = 5042002`):
   - `name: "Arc Testnet"`, `is_evm: true`, `is_testnet: true`, `is_active: true`
   - `rpc_url: "https://rpc.testnet.arc.network"`
   - `explorer_url: "https://testnet.arcscan.app"`
   - `native_currency: "USDC"` (NOT `"ETH"` — Arc's quirk; see §7.1 audit note)
   - `gateway_wallet_contract: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9"`
   - `gateway_minter_contract: "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B"`
   - `paymaster_address: NULL` (Arc has USDC=gas natively)
   - `x402_domain_name: "GatewayWalletBatched"`, `x402_domain_version: "1"`
   - `x402_verifying_contract: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9"` (same as wallet contract on Arc)
   - `x402_facilitator_url: NULL` (fills in once our Arc facilitator deploys in M5)
3. Insert 2 — `tokens` upsert (key: `(contract_address, blockchain_id)`):
   - `symbol: "USDC"`, `name: "USD Coin"`
   - `contract_address: "0x3600000000000000000000000000000000000000"`
   - `decimals: 6` (ERC-20 interface view; 18-decimal native-gas view is never used for transfers)
   - `is_stablecoin: true`, `is_native_currency: true`, `is_active: true`
4. Run `pnpm prisma db seed` locally; confirm idempotent re-run yields identical rows.

## Rules (non-negotiable)

- `upsert`, never `create` — re-running seed must be safe. Memory: `feedback_filter_at_source.md` (config-as-data via the single seed file).
- `decimals: 6` for every mobile-side USDC math path. 18 is the native-gas view only (`estimateGas` on native transfers, which Nanopayments avoids entirely).
- `native_currency: "USDC"`, not `"ETH"`. Any backend code that string-compares against `"ETH"` must be audited per §7.1 (grep sweep is part of task 19's schema audit; fix offenders here if they block the seed).
- No mobile release needed after this — `useBlockchains()` + `useTokens()` pick up the rows on next cache refresh.

## Acceptance

- [ ] `pnpm prisma db seed` runs cleanly on an empty DB and on a DB where Arc already exists (idempotent).
- [ ] Row visible via `SELECT * FROM blockchains WHERE chain_id = 5042002;` with all 7 new columns populated per above.
- [ ] USDC token row references the Arc blockchain row by FK; `is_native_currency = true`.
- [ ] `GET /v1/blockchains` (current endpoint, pre-enrichment) lists Arc Testnet.
- [ ] Mobile app with task 16's `ChainConfig` can switch to Arc and read the live USDC balance via the seeded token row.

## Out of scope

- Exchange-rate (`USDC/IDR`) and channel seed rows — M3 (§6.8 items #3 and #4).
- Enriched `GET /v1/blockchains` serializer emitting `gateway`/`paymaster`/`x402` nested objects — task 21.
- Daily `x402_supported` cache refresh — task 22.
- Mainnet cut-over (flipping `is_testnet`, swapping `chain_id` / `rpc_url` / USDC contract) — task 48.
