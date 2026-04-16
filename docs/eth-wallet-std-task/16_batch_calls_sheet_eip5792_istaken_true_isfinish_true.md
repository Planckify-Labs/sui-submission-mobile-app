# Task 16 — `EvmBatchCallsSheet` (EIP-5792) + `wallet_getCapabilities`

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** `dapp-bridge-spec.md` §6 Phase 1b bullet 5, §10.1
`wallet_sendCalls` / `wallet_getCallsStatus` / `wallet_showCallsStatus`
/ `wallet_getCapabilities`, §10.2 EIP-5792.

## Why this matters

EIP-5792 is the front door for both EOA sequential batching and
smart-account atomic batching. It's now standard across Uniswap,
Rainbow, Coinbase Wallet. Without it we look dated on GA and task
25–27 (smart accounts) can't plug in.

## Scope

- New `ApprovalKind: "sendCalls"` + payload:
  ```ts
  export type EvmBatchCallsPayload = {
    version: "1.0";
    chainId: number;
    from: `0x${string}`;
    calls: Array<{
      to: `0x${string}`;
      value?: bigint;
      data?: `0x${string}`;
      gas?: bigint;
    }>;
    capabilities?: Record<string, unknown>;
  };
  ```
- `EvmAdapter.handleRequest` branches:
  - `wallet_sendCalls` → builds `ApprovalIntent<EvmBatchCallsPayload>`.
  - `wallet_getCallsStatus` → reads from a bundle status store
    (see below); returns `{status, receipts[]}` per spec.
  - `wallet_showCallsStatus` → resolves `{ bundleId }`, posts a
    message to the screen to open the internal tx-history screen
    filtered to that bundle, returns `null`.
  - `wallet_getCapabilities` → returns `{ [hexAddress]: { [hexChainId]:
    { atomicBatch: { supported: isSmartAccount }, paymasterService: {
    supported: false (today) } } } }`. Task 28 flips paymasterService.
- `EvmAdapter.executeApproval` for `sendCalls`:
  - EOA path: sequentially `eth_sendTransaction` with auto-increment
    nonce (task 19); on any failure, stop and return the partial
    receipts in the bundle status.
  - Smart-account path (task 26 wires 4337): one UserOp with all
    calls; atomic.
  - Generate a stable `bundleId` (uuid v4) and persist a
    `bundleStatus` record with `calls`, `receipts[]`, `status`
    (`PENDING` | `CONFIRMED` | `FAILED`).
- Bundle status store: `services/bridge/bundleStatus.ts` — Zustand
  + SecureStore.
- `EvmBatchCallsSheet.tsx`:
  - `<ApprovalShell>`.
  - Each call rendered as a step with: `to`, value, decoded function
    summary (decoders land in task 22), raw data collapsible.
  - "Atomic batch" badge when the active wallet is a smart account;
    "Sequential" badge otherwise.
  - Approve / reject.

## Rules (non-negotiable)

- **Sequential batch is not atomic.** The sheet must say so clearly.
  If call 3/5 reverts, calls 1–2 already landed. Name the warning:
  "Sequential: if one step fails, earlier steps will still be on-chain."
- **`bundleId` is stable across app relaunches.** Status survives
  kill + relaunch.
- **`from` must equal `activeWallet.address`.** Otherwise reject with
  `-32602`.
- **`chainId` must equal `activeChainId`.** Otherwise reject with
  `4901` (§10.4 invariant 6).
- **No paymaster selection today** — task 28 adds it. The `capabilities`
  field in the request is parsed but sponsored-gas is rejected with a
  clear `warn` annotation until task 28.

## Acceptance

- [ ] Against an EOA wallet, `wallet_sendCalls` with N>1 calls prompts
      once and executes sequentially, returning receipts in order.
- [ ] `wallet_getCapabilities` returns correct shape for all wallet
      types in-scope today (EOA = `{atomicBatch: false}`). Smart
      accounts update in task 25/26.
- [ ] `wallet_getCallsStatus(bundleId)` reflects real-time status;
      persists across relaunch.
- [ ] `wallet_showCallsStatus` opens the tx-history screen filtered.
- [ ] Unit tests for bundle lifecycle (pending → confirmed, partial
      failure).
- [ ] `pnpm check:syntax` passes.

## Out of scope

- Smart-account atomic execution (task 26).
- Paymaster-sponsored gas (task 28).
- `wallet_grantPermissions` / ERC-7715 (P2 per §10.1).
