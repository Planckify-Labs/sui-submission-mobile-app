# Task 40 — Path A: Direct-on-Arc Fallback

**Status:** Not taken
**Owner:** Mobile + Backend
**Spec reference:** umkm-usdc-payout-spec.md §5.1, §5.6 selector, §6.6 `payment_intents.nanopay_nonce`, milestone M5

## Why this matters

Path A is the same-chain immediate-settlement fallback for users who already hold USDC on Arc and want to skip Circle's batched-settlement latency (useful for large transfers where the <500 ms Nanopayments attestation is fine but the eventual on-chain settle is delayed). It's also our escape hatch when Circle's Gateway is degraded. Because USDC on Arc is both the asset and the gas token, Path A is a single ERC-20 `transfer` — no Paymaster, no UserOp, no signer dance.

## Scope

**Mobile:**

1. Implement `components/payment/pathA.ts` with one export: `payDirectOnArc({ intent, kit, wallet })`.
2. Call `kit.sendTokenTransfer({ token: USDC_ARC, to: PLATFORM_TREASURY_ADDRESS_EVM, amount: intent.usdc.amount })` — single ERC-20 `transfer` on Arc. `PLATFORM_TREASURY_ADDRESS_EVM` comes from `intent.usdc.treasury` (§6.2) — never env, never hardcoded.
3. Amount math: use the **6-decimal ERC-20 interface view** exposed at `0x3600…0000` on Arc — **not** the 18-decimal native view. `EvmWalletKit` already picks the interface view per §5.1; this task just confirms the behavior is load-bearing and adds a test asserting the decimals seen by the transfer match `intent.usdc.decimals === 6`.
4. The path selector (task 41) only dispatches here when `userArcUSDCBalance >= intent.usdc.amount` — Path A is not a primary; it's an explicit fallback when Nanopay isn't available.

**Backend:**

5. Add a Path A watcher on `takumipay-api` that subscribes to `Transfer(to=PLATFORM_TREASURY_ADDRESS_EVM, value, …)` events on Arc.
6. Match each observed `Transfer` to a pending `payment_intents` row by `(value, nanopay_nonce)` — the nonce from the intent is the correlation key, emitted by the mobile client as a companion data-log entry per §5.1's last sentence. On match, mark intent `SETTLED` and fire the Xendit payout branch (§6.4).
7. Path B does **not** need this watcher — Circle's settle response is the trigger there. This code path is Path A only.

## Rules (non-negotiable)

- `PLATFORM_TREASURY_ADDRESS_EVM` comes from `intent.usdc.treasury` returned by `POST /v1/pay/intents`. Never env var on mobile. Server holds the canonical treasury per §10.
- No `if (namespace === "eip155")` in the selector — Path A routes via presence of `kit.sendTokenTransfer` + a balance check. Memory: `feedback_chain_extension_discipline.md`.
- Mobile triggers the on-chain transfer; backend reconciles via event. The mobile client does **not** POST a "I paid Path A" notification — the correlation is on-chain. Memory: `feedback_role_separation.md`.
- Balance check feeds the path selector (task 41); do it via a dedicated hook (e.g. `useUsdcArcBalance()`) — do not lift balance logic into the selector component. Memory: `feedback_filter_at_source.md`.
- Nonce is the correlation key; do **not** correlate on `from` address (a shared-custody wallet could create collisions).

## Acceptance

- [ ] Mobile `payDirectOnArc` helper ships and uses the 6-decimal ERC-20 interface amount.
- [ ] Backend watcher matches `(value, nonce)` pairs and flips intent to `SETTLED` → `PAID_OUT`.
- [ ] E2E test: mobile sends Path A → backend observes `Transfer` → Xendit payout fires.
- [ ] Path selector (task 41) dispatches Path A only when the Arc USDC balance covers the quote.
- [ ] `pnpm check:syntax` clean.
- [ ] `pnpm biome:check` clean.

## Out of scope

- Path selector logic itself — task 41.
- Solana analogue (no "direct on Arc" for Solana; holders without USDC on Arc go through Path B-SVM) — task 42.
- Refund runbook when a Path A transfer lands but Xendit fails — task 49.
