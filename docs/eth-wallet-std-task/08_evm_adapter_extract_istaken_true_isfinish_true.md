# Task 08 — Extract `EvmAdapter` from `ethereumProvider.ts`

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** `dapp-bridge-spec.md` §3 audit, §4.1, §6 Phase 1a
item 3.

## Why this matters

`services/ethereumProvider.ts` and the switch inside
`handleEthereumRequest` in `app/dapps-browser.tsx` together implement
the whole EVM provider today — but they are tangled with WebView
lifecycle, `global as any`, and modal resolves. Pulling just the
*adapter* into a React-free, `viem`-only module is what lets
`DappBridge` (task 05) drive the approval flow.

## Scope

Create `services/chains/evm/EvmAdapter.ts` implementing `ChainAdapter`
with `namespace: "eip155"`:

- `handleRequest(req, ctx)` — big method-dispatch, but flat and
  testable. Each branch returns one of:
  - `{status: "resolved", value}` for read-only methods
    (`eth_chainId`, `eth_blockNumber`, `eth_getBalance`, `eth_call`,
    `eth_getCode`, `eth_getStorageAt`, `eth_getLogs`,
    `eth_getTransactionByHash`, `eth_getTransactionReceipt`,
    `eth_estimateGas`, `eth_gasPrice`, `eth_maxPriorityFeePerGas`,
    `eth_feeHistory`, `eth_getBlockBy*`, `eth_getTransactionCount`,
    `net_version`).
  - `{status: "needs-approval", intent}` for `eth_requestAccounts`,
    `personal_sign`, `eth_sign`, `eth_signTypedData_v3/v4`,
    `eth_sendTransaction`. Builds the correct `ApprovalIntent<...>`.
  - `{status: "error", code, message}` for unsupported / malformed.
- `executeApproval(intent, decision, ctx)` — runs the approved action
  using `viem` wallet client:
  - `connect` → mark origin connected (stub today; EIP-2255 lands in
    task 12), return `[address]`.
  - `signMessage` → `viem.signMessage`.
  - `signTypedData` → `viem.signTypedData`.
  - `sendTransaction` → `viem.sendTransaction`, return tx hash.
- Reject all `global as any._pendingTransactionResolve` usage in
  `app/dapps-browser.tsx`; route everything through `DappBridge`.
- Register in `ChainAdapterRegistry` at bridge boot.

Other P1a methods (`wallet_addEthereumChain`, `wallet_sendCalls`,
etc.) are added in Phase 1b tasks. For this task, respond with
`4200` for them.

## Rules (non-negotiable)

- **No React imports.** `EvmAdapter.ts` must import only `viem`,
  types from `services/chains/*`, and `services/bridge/approval.ts`.
- **All reads use the adapter's own viem `publicClient`** keyed to
  `ctx.activeWallet.chainId`. No reaching into app-level singletons.
- **Param validation is Zod at the adapter boundary.** Malformed →
  `-32602`. Invalid address → `-32602`, never a throw. Task 24
  formalizes the full error code contract.
- **Feature parity with current behavior.** Every method the
  existing `handleEthereumRequest` supports must keep working.

## Acceptance

- [ ] `services/chains/evm/EvmAdapter.ts` implements `ChainAdapter`.
- [ ] `services/ethereumProvider.ts` is either deleted or contains
      only the injected-script builder (extracted in task 09).
- [ ] Grep `global as any` in `app/dapps-browser.tsx` returns zero
      matches.
- [ ] Unit tests per method branch covering the return shape.
- [ ] Manual QA: connect, `personal_sign`, `eth_signTypedData_v4`,
      `eth_sendTransaction`, reject, mid-session wallet switch all
      work on iOS + Android against a known test dApp.
- [ ] `pnpm check:syntax` passes.

## Out of scope

- EIP-3085/3326/747/2255/5792 methods (tasks 12–16).
- Smart accounts (tasks 25–28).
- Injected script relocation (task 09).
