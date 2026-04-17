# Task 13 — `useWallet` kit accessors + `changeActiveChainInternal` namespace branch

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** `solana-chain-support-spec.md` §7.5, §6.2.

## Why this matters

Screens resolve a kit via `useWallet`; without accessors, every screen
would have to know about `walletKitRegistry` directly. `useWallet` also
owns the one allowed namespace `if` in this layer — the data-shape
translation from backend `Blockchain` rows to the `ChainConfig`
discriminated union. That's data mapping, not behavior dispatch, so the
spec allows it here.

## Scope

- `hooks/useWallet.ts`:
  - Import `walletKitRegistry` + `WalletKitAdapter`.
  - Add `getActiveWalletKit = useCallback((): WalletKitAdapter => walletKitRegistry.get(activeWallet.namespace), [activeWallet.namespace])`.
  - Add `getKitForWallet = useCallback((w: TWallet) => walletKitRegistry.get(w.namespace), [])`.
  - Expose both in the hook's return value.
  - Keep `getClientForActiveWallet` / `getPublicClientForActiveChain`
    for legacy viem-typed callers; both guard with
    `if (activeChain.namespace !== "eip155") return null` per §7.5.
  - `changeActiveChainInternal`: branch on `blockchain.namespace` to
    build the correct `ChainConfig` variant per §7.5 snippet. Solana
    builds a `{ namespace: "solana", cluster, rpcUrl, iconUrl, isTestnet }`
    config with cluster inferred from `blockchain.name` (`devnet` if it
    contains "devnet", else `mainnet-beta`).
- Unit tests (extend `useWallet` test where applicable) — mock the
  registry and confirm:
  - `getActiveWalletKit()` returns the kit for the active namespace.
  - `getKitForWallet(w)` returns the right kit per wallet.
  - `getPublicClientForActiveChain` returns `null` when active chain is
    Solana.

## Rules (non-negotiable)

- **`getActiveWalletKit` is the only kit entry for screens.** No
  screen should import `walletKitRegistry` directly (Tasks 14–16
  enforce).
- **Legacy viem helpers do not throw on Solana — they return `null`.**
  A thrown error would break any EVM-only screen that still calls them;
  `null` lets those screens gracefully no-op when the active chain is
  non-EVM.
- **`changeActiveChainInternal` keeps the existing agent-busy gate.**
  The namespace branch is only for `ChainConfig` shape; the persistence
  + gating logic is unchanged.
- **Narrowing, not casts.** Use `if (blockchain.namespace === "solana")`
  to drive both branches of the ternary.

## Acceptance

- [ ] `useWallet` exposes `getActiveWalletKit` and `getKitForWallet`.
- [ ] `changeActiveChainInternal` produces a valid Solana `ChainConfig`
      when the backend returns a Solana `Blockchain` row.
- [ ] Legacy viem accessors early-return `null` on Solana.
- [ ] Switching chain between EVM and Solana during an active agent
      turn still triggers the existing "Cancel task & switch" gate.
- [ ] `pnpm check:syntax` passes; `pnpm run test` passes.

## Out of scope

- Screen refactors (Tasks 14, 15).
- `ChainSelector` grouping (Task 16).
