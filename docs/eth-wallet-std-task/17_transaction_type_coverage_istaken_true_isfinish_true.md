# Task 17 — Transaction type coverage (legacy / 2930 / 1559)

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** `dapp-bridge-spec.md` §6 Phase 1b bullet 6, §10.1
`eth_sendTransaction`, §10.2 EIP-1559 / EIP-2930.

## Why this matters

Today the adapter silently assumes EIP-1559. Some chains (old L1s,
private testnets) require legacy type-0 txs. Some dApps (niche
gas-relay cases) still build EIP-2930 type-1 txs. Rejecting or
coercing them breaks flows we should accept.

## Scope

- Extend `EvmSendTxPayload`:
  ```ts
  export type EvmSendTxPayload =
    | { type: 0; to: `0x${string}`; value?: bigint; data?: `0x${string}`;
        gas?: bigint; gasPrice?: bigint; nonce?: number; chainId: number }
    | { type: 1; to: `0x${string}`; value?: bigint; data?: `0x${string}`;
        gas?: bigint; gasPrice?: bigint; accessList?: AccessList;
        nonce?: number; chainId: number }
    | { type: 2; to: `0x${string}`; value?: bigint; data?: `0x${string}`;
        gas?: bigint; maxFeePerGas?: bigint; maxPriorityFeePerGas?: bigint;
        accessList?: AccessList; nonce?: number; chainId: number };
  ```
- Normalize at the adapter boundary in `handleRequest`:
  - No `type` + dynamic-fee fields → type 2.
  - No `type` + `gasPrice` + no dynamic-fee fields → type 0.
  - No `type` + `accessList` + `gasPrice` → type 1.
  - `type` present → trust + validate.
  - Chain doesn't support target type → `-32602`.
- `executeApproval` passes through to `viem.sendTransaction` using
  the resolved type.
- `EvmTransactionSheet` shows a "Fee market: legacy / access list /
  dynamic" label under the gas section so power users can sanity check.

## Rules (non-negotiable)

- **Never silently coerce.** If a dApp asks for type 0 on a 1559-only
  chain, reject with `-32602`; do not upgrade to type 2.
- **Chain capability table.** Maintain a small per-chain "supports
  type 0 / 1 / 2" map on the chain store; update via EIP-3085 adds.
- **Zod validates the union at the boundary.** No invalid combinations
  (e.g. type 2 with `gasPrice`) reach `viem`.
- **`nonce` override from the dApp is respected but annotated.**
  If present, inspector adds `info: "dApp-specified nonce"`.

## Acceptance

- [ ] All three type branches round-trip on a chain that supports each.
- [ ] Requesting an unsupported type on a chain returns `-32602`.
- [ ] Sheet displays the resolved fee-market label.
- [ ] Unit tests: normalization, invalid combos rejected, chain
      capability gating.
- [ ] `pnpm check:syntax` passes.

## Out of scope

- EIP-4844 blob tx (P2 per §10.2; reject with clear error).
- EIP-7702 set-code tx (task 27).
