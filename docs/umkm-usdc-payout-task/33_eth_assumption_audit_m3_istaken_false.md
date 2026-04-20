# Task 33 — ETH Assumption Audit (takumipay-api)

**Status:** Not taken
**Owner:** Backend (takumipay-api) + Ops (code review)
**Spec reference:** umkm-usdc-payout-spec.md §7.1 "Audit" block, milestone M3

## Why this matters
Arc's defining quirk is `native_currency = 'USDC'`, not `'ETH'`. Any `takumipay-api` code that branches on a hardcoded `'ETH'` string, assumes `decimals: 18` for the native view, or tags analytics with `chain_family = "ethereum"` will silently misbehave on Arc. §7.1 is explicit: "If the backend currently assumes every EVM row has `native_currency = 'ETH'` in any code path, that code misbehaves on Arc." Space-docking discipline — chain metadata in the DB, not hardcoded — is undone by a single unaudited constant.

## Scope
1. Run the greps from §7.1 across `takumipay-api/src/`:
   - `grep -r "'ETH'" takumipay-api/src/`
   - `grep -r '"ETH"' takumipay-api/src/`
   - `grep -r "nativeCurrency" takumipay-api/src/`
   - `grep -rE "native.*ETH" takumipay-api/src/`
2. Triage each hit into three buckets: (a) **safe** — comment / log / migration artifact, (b) **refactor required** — actively branches on the string and needs to read from the `blockchains` row instead, (c) **false positive** — e.g. symbol `"ETH"` used in a hardcoded token list for Ethereum mainnet which is correct.
3. Common offender categories (per §7.1):
   - Gas-price fetch helpers that hardcode an Ethereum-style fee structure.
   - Analytics event tagging (`chain_family = "ethereum"`).
   - Balance-formatting utilities hardcoding `decimals: 18` for EVM natives (Arc USDC uses decimals 6 for the ERC-20 interface view).
4. Fix any (b) hits by reading the row value (`native_currency`, `decimals`) from the `blockchains` / `tokens` tables served to mobile via §6.7 — never via a hardcoded constant.
5. Re-run the grep post-fix to confirm zero (b)-bucket hits remain.
6. Deliverable: a diff PR plus a checklist of every location audited, with a one-line disposition per hit (safe / refactored / false positive).

## Rules (non-negotiable)
- Three-role separation: audit touches only server code; mobile is unaffected (it reads chain metadata through `useBlockchains()` which already consumes the DB row per §6.7).
- Chain-extension discipline: fixes must remove hardcoded strings in favor of row reads. NO `if (chainId === 5042002)` Arc-specific branches — that would reintroduce the space-docking debt the DB-served metadata exists to prevent (memory `feedback_chain_extension_discipline.md`).
- Filter-at-source: consumers of `native_currency` / `decimals` receive the value from a shared helper backed by the `blockchains` / `tokens` rows — do not cache in local module state.

## Acceptance
- [ ] Audit report committed listing every grep hit with disposition (safe / refactored / false positive).
- [ ] Zero `(b)` bucket hits remain after fix — re-run greps to confirm.
- [ ] Any refactored code path reads `native_currency` / `decimals` from the DB row, not a constant.
- [ ] Smoke test: create an intent on Arc Testnet (chainId 5042002) with `native_currency = 'USDC'`; no helper throws or mis-formats.
- [ ] Ops review: sign-off from another backend engineer on the PR diff.
- [ ] `pnpm run test` (all suites) green.
- [ ] `pnpm check:syntax` and `pnpm biome:check` clean.

## Out of scope
- Mobile-side audit — mobile already reads through `useBlockchains()` (§6.7 contract).
- Mainnet Arc cut-over (task 48).
- Agent-api audit — separate codebase, separate task if needed.
