# Task 26 — ERC-4337 UserOperation execution path

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** `dapp-bridge-spec.md` §6 Phase 1c bullet 2, §8
open question 2 (bundler choice), §10.2 ERC-4337.

## Why this matters

EIP-5792 (task 16) is the wallet-facing API; ERC-4337 is the
on-chain execution mechanism for smart accounts. When `activeWallet.type
=== "Smart4337"`, sending a single tx or a batch must go through a
bundler as a UserOperation, not `eth_sendTransaction`. Atomic batching
falls out of this for free.

## Scope

- Add a bundler client layer — `services/chains/evm/bundler.ts`:
  - Per-chain config: `bundlerUrl`, supported entry points.
  - Use `viem/account-abstraction` (already a peer; confirm version).
  - `buildUserOperation(smartWallet, calls): Promise<UserOp>` —
    nonce, callData, gas fields filled.
  - `submitUserOperation(userOp): Promise<userOpHash>`.
  - `waitForUserOpReceipt(hash): Promise<{txHash, success, logs}>`.
- `EvmAdapter.executeApproval` for `sendTransaction` and `sendCalls`:
  - If `isSmartAccount(activeWallet)`:
    - Single call → wrap as a 1-element batch UserOp.
    - Multi-call → one UserOp with atomic semantics.
  - Wait for receipt, return tx hash (EIP-5792 `sendCalls` returns
    bundle id; the bundle record stores the userOpHash alongside).
- `wallet_getCapabilities` (task 16) updates: for Smart4337
  addresses, return `atomicBatch.supported: true`,
  `auxiliaryFunds.supported: false` (until paymaster).
- Sheets pick up smart-account-specific copy:
  - `EvmTransactionSheet` adds "Smart wallet · Executed as a
    UserOperation" footer line.
  - `EvmBatchCallsSheet` (task 16) shows "Atomic batch" badge when
    signer is a smart account.
- **Fallback**: if bundler/RPC is unreachable, reject with
  `-32603` + clear user-facing error; never degrade silently to EOA
  direct-send. Annotation `warn` explains the state.

## Rules (non-negotiable)

- **Entry-point version is pinned per wallet.** Changing it is a
  migration, not a transparent switch.
- **Nonce management for smart accounts goes through the
  EntryPoint's `getNonce(sender, key)`**, not the EOA nonce tracker
  (task 19). Separate nonce namespace.
- **Bundler picked at compile time for Phase 1c.** §8 open question
  2 resolves later — ship one (e.g. Pimlico) with room to swap via
  app config.
- **UserOp gas is estimated on the bundler**, not via
  `eth_estimateGas`. Show the estimate in the sheet the same way as
  task 18 does for EOA.
- **No paymaster yet** — this task fills `paymasterAndData: "0x"`.
  Task 28 adds paymaster.

## Acceptance

- [ ] A `sendCalls` batch against a Smart4337 wallet executes as one
      UserOp; all calls land atomically on Base Sepolia.
- [ ] A single `sendTransaction` against a Smart4337 wallet also goes
      through the bundler.
- [ ] `wallet_getCapabilities` reports `atomicBatch.supported: true`
      for the smart wallet.
- [ ] Bundler unreachable → user-facing error, no silent fallback.
- [ ] Unit tests for UserOp construction, nonce handling, receipt
      polling.
- [ ] `pnpm check:syntax` passes.

## Out of scope

- Paymaster / sponsored gas (task 28).
- Social recovery / guardians (gated per §6 Phase 1c last bullet;
  no bridge-side signing for recovery).
