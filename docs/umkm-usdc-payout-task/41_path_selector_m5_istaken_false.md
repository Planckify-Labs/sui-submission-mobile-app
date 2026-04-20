# Task 41 — Path Selector (presence-of-method dispatch)

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** umkm-usdc-payout-spec.md §5.6 Path Selector, `services/walletKit/types.ts:66`, milestone M5

## Why this matters

The path selector is the single decision point that routes every `/pay-merchant` tap to the correct execution path. It must honor the chain-extension discipline memory — no `if (namespace === "X")` branches, no per-chain special cases — so that adding a new x402 scheme or a new rail is an adapter-method addition, not a selector-code edit. Without a disciplined selector, every new chain leaks conditional logic into the hottest screen in the app.

## Scope

1. Create `components/payment/pathSelector.ts` (or inline into `app/pay-merchant.tsx` only if simpler — prefer the standalone module for testability).
2. Export one function: `selectPath({ intent, kit, wallet, arcUsdcBalance }): PaymentPath | "needs_onboarding" | "needs_switch_wallet" | "needs_topup"`.
3. Dispatch rules, in this order (per §5.6):
   - User has NOT completed Gateway deposit (`intent.gasless.requiresDeposit === true`) → `needs_onboarding` (route to task 34).
   - `intent.channel.kind === "merchant"`:
     - EVM wallet (`kit.signTransferWithAuthorization != null`) → Path B-EVM (Nanopayments, task 15 + 17).
     - Solana wallet with `kit.signX402SvmPayment != null` → Path B-SVM (task 42).
     - Solana wallet without SVM support → `needs_switch_wallet` ("Switch to supported wallet" sheet).
   - `intent.channel.kind === "x402"` → Path C (task 39).
   - User holds USDC on Arc ≥ `intent.usdc.amount` → Path A (task 40).
   - Otherwise → `needs_topup` ("Top up USDC" CTA).
4. Unit-test `pathSelector.test.ts` covering every branch with fixture intents + mock kits.
5. Consumer: `app/pay-merchant.tsx` calls `selectPath(...)` once on render, switches on the result for UI, and delegates execution to the matching path helper.

## Rules (non-negotiable)

- **Presence-of-method dispatch only.** `kit.signTransferWithAuthorization != null` → EVM; `kit.signX402SvmPayment != null` → SVM. No `if (namespace === "eip155" || namespace === "solana")` anywhere in this file. New chain = new adapter method = selector picks it up with zero edits. Memory: `feedback_chain_extension_discipline.md`.
- Balance check for Path A comes from a dedicated hook (`useUsdcArcBalance` or equivalent); selector takes the number as an arg. Do not fetch inside the selector. Memory: `feedback_filter_at_source.md`.
- Selector is pure — no side effects, no navigation calls. It returns a discriminated result; the consumer screen handles routing. Keeps testing cheap.
- Three-role separation holds downstream: selector picks the path; adapter signs; backend relays. Memory: `feedback_role_separation.md`.

## Acceptance

- [ ] `selectPath` exported from `components/payment/pathSelector.ts`.
- [ ] Every §5.6 branch has a passing unit-test case.
- [ ] Zero `if (namespace === …)` occurrences in the selector file (grep-clean).
- [ ] `app/pay-merchant.tsx` consumes the selector and dispatches to Path A / B-EVM / B-SVM / C helpers (or renders the onboarding / switch / topup sheets).
- [ ] `pnpm check:syntax` clean.
- [ ] `pnpm biome:check` clean.

## Out of scope

- Path A / B-EVM / B-SVM / C execution bodies — tasks 40, 15+17, 42, 39 respectively.
- Onboarding screen — task 34.
- Top-up CTA implementation — out of scope for this backlog (deferred).
- Agent-mode integration of the selector — task 46.
