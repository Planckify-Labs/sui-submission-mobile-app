# Task 26 — FX + Channels Seed (exchange_rates + channels)

**Status:** Not taken
**Owner:** Backend (takumipay-api)
**Spec reference:** umkm-usdc-payout-spec.md §6.6, §6.8, milestone M3

## Why this matters
M3 quote pipeline reads `USDC → IDR` from the existing `exchange_rates` table and per-channel fees from the new `channels` table. Both tables are config-as-data: ops updates the seed array and re-runs `pnpm prisma db seed` to apply fee/rate changes. Without these rows, `POST /v1/pay/intents` cannot snapshot FX and the `channels` picker on `merchant/signup-form.tsx` renders empty.

## Scope
1. Update `api/src/scripts/prisma/seed.ts` with two upsert blocks alongside the existing exchange_rates seed at `api/src/scripts/prisma/seed.ts:1133-1141`.
2. **exchange_rates row:** `{ fromCurrency: "USDC", toCurrency: "IDR", rate: 16234.50, region: "ID", markup: 1.5 }`. Upsert keyed on `(fromCurrency, toCurrency, region)`. Matches `TExchangeRate` at `api/types/exchange-rate.ts`.
3. **channels rows (8):** per §6.6 sample block — GOPAY/OVO/DANA/SHOPEEPAY (`kind: "ewallet"`, `account_format: "phone_id"`, priorities 10-13, fee 2500) and BCA/MANDIRI/BNI/BRI (`kind: "bank"`, `account_format: "digits:10|13|10|15"`, priorities 20-23, fee 5000). Upsert keyed on `(channel_code, country)`.
4. Cross-reference each `channel_code` against Xendit test-mode by dry-running `POST /v2/payouts` — unknown codes return 400, which is the right-sized smoke test.
5. Use `upsert` (not `create`) so re-running seed is idempotent — same seed file doubles as ops update path.

## Rules (non-negotiable)
- Three-role separation: FX rate and channel fees are server data only; mobile consumes `exchange_rates` through the existing `exchangeRateApi.getLatestExchangeRate` endpoint and `channels` through `GET /v1/merchants/channels` (task 28). Do not bake values into mobile.
- Chain-extension discipline: channels table is country-keyed (`CHAR(2)`), not namespace- or chain-keyed. A future MY/TH/VN expansion (§12 Q3) adds rows with `country = "MY"` etc., no code changes.
- Filter-at-source: priority ordering lives in the DB column, consumed by task 28's endpoint. Mobile does NOT sort client-side.
- **No rate-refresh cron in v1** per §12 Q10. `markup: 1.5` absorbs drift; ops re-runs seed to tune.

## Acceptance
- [ ] `pnpm prisma db seed` runs idempotently — second run is a no-op on data rows.
- [ ] `SELECT * FROM exchange_rates WHERE from_currency='USDC' AND to_currency='IDR' AND region='ID'` returns exactly one row.
- [ ] `SELECT count(*) FROM channels WHERE country='ID' AND is_active=true` returns 8.
- [ ] Each channel's `channel_code` verified against Xendit test-mode dry-run (return 200 or validation error but NOT `INVALID_CHANNEL_CODE`).
- [ ] `pnpm check:syntax` and `pnpm biome:check` clean.

## Out of scope
- Live FX cron (§12 Q10 — explicit non-scope for v1).
- Channel picker UI on mobile — lives on the merchant signup form.
- `GET /v1/merchants/channels` endpoint (task 28).
