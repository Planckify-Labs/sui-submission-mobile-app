# Task 18 — Gas re-estimation + dApp-vs-wallet side-by-side

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** `dapp-bridge-spec.md` §6 Phase 1b bullet 7.

## Why this matters

DApps routinely omit or lowball gas — some to make the tx look cheaper
than it is, some because their estimator is stale. A wallet that
trusts dApp numbers blindly either fails on-chain (underpriced) or
prices users out. Users deserve to see the wallet's own estimate next
to the dApp's and pick.

## Scope

- In `EvmAdapter.handleRequest` for `eth_sendTransaction`:
  - Always call `eth_estimateGas` and `eth_feeHistory` against the
    target chain, regardless of whether the dApp supplied values.
  - Build a `gasEstimate` object attached to the payload (as a
    non-security field, so the inspector pipeline's patch restriction
    in §4.6 allows it):
    ```ts
    gasEstimate: {
      dApp: { gas?: bigint; maxFeePerGas?: bigint; maxPriorityFeePerGas?: bigint; gasPrice?: bigint };
      wallet: { gas: bigint; maxFeePerGas?: bigint; maxPriorityFeePerGas?: bigint; gasPrice?: bigint };
      recommended: "wallet" | "dApp";
      rationale: string;  // e.g. "dApp underestimated gas by 30%"
    }
    ```
  - `recommended` is `"wallet"` when the dApp's fields are missing,
    or when the dApp's estimate differs from wallet's by >10%.
- `EvmTransactionSheet` renders a compact two-column toggle:
  *dApp suggested* vs *Wallet estimate*. Default to `recommended`.
  Tapping the unselected column switches.
- `executeApproval` uses whichever the user confirmed.

## Rules (non-negotiable)

- **Never send a tx with wallet estimate below on-chain `eth_estimateGas`.**
  Estimator is authoritative.
- **Base-fee buffer on 1559 chains.** `maxFeePerGas = base_fee * 2 +
  priorityFee` (standard viem buffer). Don't under-buffer.
- **Show absolute numbers in the UI.** `0.0003 ETH (~$1.15)` — not
  just gwei. Use the existing price-feed hook for USD.
- **If the wallet estimator itself fails** (RPC hiccup), show a
  `warn` annotation and let the user either use dApp values or retry
  estimation.

## Acceptance

- [ ] Sending a tx with a dApp that omits gas fields: sheet displays
      only wallet estimate, executes correctly.
- [ ] Sending a tx where dApp lowballs gas by 40%: sheet defaults to
      wallet estimate, shows rationale, user can toggle to dApp.
- [ ] Sending with dApp estimate within 10% of wallet: sheet defaults
      to dApp, both visible.
- [ ] Gas numbers display in both native units (gwei / chainCurrency)
      and USD.
- [ ] Unit tests for the `recommended` decision.
- [ ] `pnpm check:syntax` passes.

## Out of scope

- Custom priority-fee slider (power-user feature; add later).
- Historical gas charts in the sheet.
