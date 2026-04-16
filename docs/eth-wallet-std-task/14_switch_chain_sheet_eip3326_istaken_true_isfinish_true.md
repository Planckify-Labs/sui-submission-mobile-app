# Task 14 — `SwitchChainSheet` (EIP-3326)

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** `dapp-bridge-spec.md` §10.1
`wallet_switchEthereumChain`, §10.2 EIP-3326, §10.3 error codes (4902),
§10.4 invariant 6.

## Why this matters

Today the adapter has no way for a dApp to ask the wallet to switch
chains. dApps that span multiple networks (Uniswap, OpenSea, bridge
apps) fail silently or bail out. EIP-3326 makes chain switching a
first-class RPC.

## Scope

- New `ApprovalKind: "switchChain"` + payload type:
  ```ts
  export type EvmSwitchChainPayload = { chainId: number };
  ```
- `EvmAdapter.handleRequest` branch for `wallet_switchEthereumChain`:
  - Validate params. Malformed → `-32602`.
  - If chain is not in user chain list → return error `4902` (chain
    not added) per EIP-3326.
  - If chain is already active → return `null` immediately (no
    prompt).
  - Otherwise emit `ApprovalIntent<EvmSwitchChainPayload>`.
- `EvmAdapter.executeApproval`:
  - Call `useWallet.setActiveChain(chainId)`.
  - Emit `chainChanged` via `adapter.onStateChange` → injected JS
    dispatches `chainChanged` on `window.ethereum`.
  - Return `null`.
- `SwitchChainSheet.tsx`:
  - Wrap `<ApprovalShell>`.
  - Show target chain name + id + explorer + native currency.
  - Show current chain below with an arrow.
  - Approve / reject.
- Register in `renderers.ts`.

Also: chain mismatch guard (§10.4 invariant 6) — if a pending
`sendTransaction` intent has `chainId !== activeChainId`, `DappBridge`
already auto-rejects with `4901` (implemented in task 05). Confirm
that path still works after this lands.

## Rules (non-negotiable)

- **`4902` is emitted before any UI.** Unknown chains never prompt —
  the dApp's canonical recovery is to call `wallet_addEthereumChain`
  first.
- **`chainChanged` event is dispatched after the switch persists**,
  not during. Downstream dApp code reads `window.ethereum.chainId`
  immediately on that event.
- **Hex chain id contract.** The event payload uses `0x`-prefixed
  hex; the adapter uses decimal internally. Conversion lives in the
  adapter.
- **No cross-namespace switch.** Switch only applies to `eip155`.
  Non-EVM chains get their own switch flow later.

## Acceptance

- [ ] Switching from a dApp to an already-added chain works on iOS +
      Android; `chainChanged` fires in the WebView.
- [ ] Switching to an unknown chain returns `4902`.
- [ ] Reject path returns `4001`.
- [ ] A pending `sendTransaction` on the wrong chain auto-rejects
      with `4901` (invariant 6 regression test).
- [ ] Unit tests for error-code branches.
- [ ] `pnpm check:syntax` passes.

## Out of scope

- Non-EVM chain switching (Phase 3).
- UX to prompt "add this chain first" when returning `4902` — dApps
  handle the recovery themselves.
