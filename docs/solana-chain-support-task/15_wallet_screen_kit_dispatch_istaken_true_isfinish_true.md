# Task 15 — `app/wallet.tsx` + `WalletDetails` + `WalletCard` kit dispatch

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** `solana-chain-support-spec.md` §6.2.

## Why this matters

The wallet overview reads balances, formats amounts, and renders the
native symbol — all EVM-shaped today. Same refactor as `send.tsx`: read
`kit.getNativeBalance`, display `kit.formatNativeAmount(balance, activeChain)`.
After this, a Solana wallet shows its SOL balance side by side with
EVM wallets without any namespace branching in the presentation layer.

## Scope

- `app/wallet.tsx`:
  - Balance fetch flows through `kit.getNativeBalance(address, activeChain)`.
  - Symbol/formatting via `kit.formatNativeAmount(balance, activeChain)`.
  - Remove any `publicClient.getBalance({ address })` call — that's EVM
    kit internals now.
- `components/wallet/WalletDetails.tsx`:
  - Accept `kit` (or resolve via `useWallet.getActiveWalletKit()`).
  - All balance + amount formatting via the kit.
- `components/wallet/WalletCard.tsx`:
  - Same treatment for the per-card balance pill.
  - Truncated address via `kit.truncateAddress(address)` so Solana
    base58 renders cleanly.
- `components/wallet/*` anywhere else that reads native balance —
  grep for `publicClient.getBalance` and route through the kit.

Note: grouped-token balance (`useGroupedTokenBalances`) stays EVM-only
this spec (N1). Solana wallets render a "Transaction history and tokens
coming soon" placeholder — acceptable per §11 R7.

## Rules (non-negotiable)

- **Zero `if (namespace === "solana")` in the display layer.**
- **No direct viem reads in `components/wallet/*`.** If existing code
  reaches for `publicClient`, route it through the kit.
- **Address truncation through the kit.** Solana base58 strings are
  longer than EVM hex — hard-coded `(0, 6)…(-4)` slices look wrong on
  Solana.
- **Format output is symbol-aware.** `kit.formatNativeAmount` returns
  the symbol so the presentation layer never hard-codes "ETH" or "SOL".

## Acceptance

- [ ] Switching active wallet between an EVM row and a Solana row
      updates the balance + symbol without any flicker or stale value.
- [ ] The Solana balance refreshes on pull-to-refresh.
- [ ] EVM behavior is byte-identical to pre-refactor (screenshot /
      snapshot).
- [ ] Grep confirms no `publicClient.getBalance` calls outside
      `services/walletKit/evm/`.
- [ ] `pnpm check:syntax` passes; manual §9.3 steps 2, 4 recorded.

## Out of scope

- Token / history display for Solana (F1, F6).
- `ChainSelector` (Task 16).
- `deposit.tsx` QR generation — address is already opaque-string, so
  no changes expected.
