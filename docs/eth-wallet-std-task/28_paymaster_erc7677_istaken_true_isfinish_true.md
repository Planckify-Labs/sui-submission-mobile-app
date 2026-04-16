# Task 28 — Paymaster selection + ERC-7677 wiring

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** `dapp-bridge-spec.md` §6 Phase 1c bullet 4, §8
open question 2 (paymaster provider), §10.2 ERC-7677.

## Why this matters

Paymaster-sponsored gas (or pay-in-USDC) is the single most-talked-about
UX win for smart wallets. A dApp can request sponsorship via EIP-5792
`capabilities.paymasterService`; the wallet picks a paymaster that
matches and includes its data in the UserOp.

## Scope

- Add `services/chains/evm/paymaster.ts`:
  - Per-chain paymaster client config (URL + optional API key in
    env).
  - `getPaymasterStubData(userOp, context)`:
    `pm_getPaymasterStubData` RPC call → returns stubbed
    `paymasterAndData` for accurate gas estimation.
  - `getPaymasterData(userOp, context)`:
    `pm_getPaymasterData` → returns the real data post-estimation.
  - Supports the standard ERC-7677 shape.
- Extend `EvmSendTxPayload` + `EvmBatchCallsPayload` with a
  `feeSource: "native" | "sponsored" | { erc20: `0x${string}` }`
  field resolved at sheet approval time.
- Sheets render a fee-source selector (new component
  `FeeSourceSelector`):
  - Options: "Pay with ETH" (default), "Sponsored" (visible only
    when the app's paymaster supports this origin+chain),
    "Pay with USDC" / "Pay with USDT" (when the paymaster supports
    ERC-20 gas).
  - Selected option drives which paymaster call the adapter makes.
- `wallet_getCapabilities` now reports:
  ```ts
  paymasterService: { supported: boolean, url?: string }
  ```
  - Smart4337 + any EOA with a valid 7702 auth to a delegator that
    supports paymaster calls → `supported: true`.
  - The reported URL is the wallet's app-level paymaster URL (not
    user-editable in Phase 1c).
- EOAs on 7702 (task 27) can consume the paymaster when the
  delegator contract has a paymaster-aware call path.

## Rules (non-negotiable)

- **Paymaster provider is chosen at compile time** in Phase 1c. §8
  open question 2 resolves later.
- **Sponsored/ERC-20 gas never silently falls back to native** — if
  the paymaster rejects, show an error and let the user switch
  source.
- **Paymaster cost is displayed in the same currency the user
  pays in.** Don't show "gas: 0.001 ETH" when the user pays in
  USDC — convert.
- **Never submit paymaster data you didn't retrieve fresh.** Each
  UserOp gets its own `pm_getPaymasterData` call post-estimation.
- **Sponsorship policy** (who pays, caps) is dictated by the
  paymaster service response; the wallet just reports what it
  got back.

## Acceptance

- [ ] A sponsored `sendCalls` from a supported dApp executes without
      the user paying gas (end-to-end on Base Sepolia).
- [ ] Paying gas in USDC works end-to-end (smart account with an
      ERC-20-aware paymaster).
- [ ] `wallet_getCapabilities` reports the right `paymasterService`
      value for all wallet types.
- [ ] Paymaster rejection surfaces a clear error; user can switch
      to native and retry.
- [ ] Unit tests for stub/data flow, feeSource selection.
- [ ] `pnpm check:syntax` passes.

## Phase 1c exit criteria (entire phase)

Once this ships, §6 Phase 1c exit criteria are met:
- 5792 batch against 4337 smart wallet executes atomically.
- Same batch against a regular EOA executes sequentially.
- Same batch against an EOA with 7702 auth executes atomically.
- Paymaster-sponsored tx works end-to-end on one chain.
- `wallet_getCapabilities` correct for all three wallet types.

## Out of scope

- Per-origin sponsorship policy editor.
- User-provided paymaster URL (advanced settings, later).
