# Task 14 — Refactor `app/send.tsx` to kit dispatch (zero namespace branches)

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** `solana-chain-support-spec.md` §7.7, §6.2.

## Why this matters

`send.tsx` is the single biggest consumer of EVM-specific viem APIs.
Refactoring it to call `kit.getNativeBalance` /
`kit.sendNativeTransfer` / `kit.parseNativeAmount` /
`kit.formatNativeAmount` / `kit.validateAddress` uniformly is the
architectural proof that the docking-port pattern holds — EVM and
Solana paths look identical at this layer, and adding Sui later is a
new kit, not a new branch.

## Scope

Refactor `app/send.tsx` per §7.7:

- Resolve `const kit = getActiveWalletKit()` once at the top of the
  screen.
- `fetchBalance`: call `kit.getNativeBalance(activeWallet.address, activeChain)`.
- `handleMaxAmount`: call `kit.estimateMaxTransferable({ balance, chain, from, to })`,
  then `kit.formatNativeAmount(max, activeChain)` (strip the symbol for
  the input field).
- `validateInputs`: `kit.validateAddress(recipient)` + `kit.parseNativeAmount(amount, activeChain)`
  bounded against `balance`.
- `handlePinConfirm`: `kit.parseNativeAmount` + `kit.sendNativeTransfer({ wallet, to, amount, chain })`
  returning a signature/hash `string`.
- JSX display (balance pill, MAX button, symbol chips) reads from
  `kit.formatNativeAmount(balance, activeChain)`.

History recording (§7.7 tail) is the **only** remaining place `send.tsx`
mentions a namespace — and it's bounded by `if (activeChain.namespace === "eip155")`
because the backend `createTransaction` API only knows EVM shape today.
Wrap the existing call in that gate. Document the Solana branch as
deferred (§12 Q4, F1).

## Rules (non-negotiable)

- **Zero `if (namespace === "solana")` branches outside the history-
  recording block.** Grep the diff — any match outside that one
  condition fails review.
- **No direct `@solana/kit` / `viem` imports in `send.tsx`.** Everything
  chain-specific goes through the kit.
- **MAX estimator output never exceeds balance.** Assert in the manual
  devnet verification.
- **Keep the PIN-confirm + busy-state UX identical.** Visual diff vs.
  the pre-refactor screen should be zero for EVM.

## Acceptance

- [ ] `git diff app/send.tsx` shows zero inline `"solana"` namespace
      checks except the history-recording guard.
- [ ] Sending 0.01 SOL on devnet from `send.tsx` lands on Solana
      Explorer within 10s (step 5 of §9.3).
- [ ] Sending ETH on the same screen is byte-identical behavior to
      pre-refactor (screenshot + snapshot test).
- [ ] MAX on Solana yields `balance - 895_880` lamports, never exceeds.
- [ ] `pnpm check:syntax` passes; manual verification (§9.3 steps 5, 6)
      recorded in PR.

## Out of scope

- `wallet.tsx` / display components (Task 15).
- `ChainSelector` grouping (Task 16).
- SPL-token transfers (F6 / future).
