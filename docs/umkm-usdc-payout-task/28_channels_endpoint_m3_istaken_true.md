# Task 28 — Channels Endpoint (GET /v1/merchants/channels)

**Status:** Not taken
**Owner:** Backend (takumipay-api)
**Spec reference:** umkm-usdc-payout-spec.md §6.0, §6.1, §6.6, milestone M3

## Why this matters
Mobile's `merchant/signup-form.tsx` channel picker renders directly from this endpoint's response — order and all. Filter-at-source is the contract: the DB is the source of truth for which channels exist, what order they appear, and which are active. Adding / renaming / disabling a channel is a single SQL update + seed re-run, not a mobile release (§6.6).

## Scope
1. Implement `GET /v1/merchants/channels?country=ID` → 200 `ChannelDescriptor[]` per §6.0 shape.
2. Filter: `country = ?` AND `is_active = true`. Reject missing `country` param with 400; only `"ID"` accepted in v1.
3. Order by `priority ASC`, then stable tiebreaker by `channel_code`.
4. Response shape: `{ channelCode, label, kind, accountFormat, priority }[]` — camelCase on wire, matches §6.0 type.
5. Cache: short TTL (30-60 s) acceptable; ops wants newly-flipped `is_active` to propagate within a minute. No hard SLA.
6. Consumed by mobile `merchant/signup-form.tsx` channel picker (M3 mobile-side UI).

## Rules (non-negotiable)
- Three-role separation: endpoint is authenticated (SIWE session) — no public exposure of which payment rails we operate. No mutation endpoint — ops updates via SQL / seed re-run only.
- Chain-extension discipline: channel rows are `country`-keyed; future PH/TH/MY/VN expansion (§12 Q3) adds rows, not code. Do NOT branch on `country` in the handler.
- Filter-at-source: ordering lives in the `priority` column. Mobile renders in array order — no client-side sort. This is the "filter-at-source" rule from memory `feedback_filter_at_source.md`.

## Acceptance
- [ ] `GET /v1/merchants/channels?country=ID` returns 8 rows seeded by task 26, sorted by priority (10, 11, 12, 13, 20, 21, 22, 23).
- [ ] Flipping `is_active = false` on one row in SQL removes it from the response within the cache TTL.
- [ ] Response matches the Zod schema colocated with `api/types/payouts.ts::ChannelDescriptor`.
- [ ] 400 on missing / unsupported `country` param.
- [ ] `pnpm run test -- --testPathPattern=channels` green.
- [ ] `pnpm check:syntax` and `pnpm biome:check` clean.

## Out of scope
- Mobile-side channel picker UI (lives in the merchant signup form, tracked separately).
- Channel-row mutation endpoints — ops-only via SQL.
- Seeding the initial 8 rows (task 26).
