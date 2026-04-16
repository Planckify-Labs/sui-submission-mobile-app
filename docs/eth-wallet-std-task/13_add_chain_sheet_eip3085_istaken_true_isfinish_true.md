# Task 13 — `AddChainSheet` (EIP-3085)

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** `dapp-bridge-spec.md` §10.1 `wallet_addEthereumChain`,
§10.2 EIP-3085, §8 open question 5 (chain list source).

## Why this matters

Today the mobile app ships a fixed chain list baked in. Production
dApps routinely `wallet_addEthereumChain` their preferred network
(Base, Arb, a rollup, a testnet), and without support users have to
add chains manually via a hidden settings flow. EIP-3085 is table
stakes.

## Scope

- New `ApprovalKind: "addChain"` + payload type in
  `services/chains/evm/payloads.ts`:
  ```ts
  export type EvmAddChainPayload = {
    chainId: number;
    chainName: string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
    rpcUrls: string[];
    blockExplorerUrls?: string[];
    iconUrls?: string[];
  };
  ```
- `EvmAdapter.handleRequest` branch for `wallet_addEthereumChain`:
  - Validate with Zod. Malformed → `-32602`.
  - If chain already exists in the user's chain list, return `null`
    immediately without prompt (per EIP-3085).
  - Otherwise emit an `ApprovalIntent<EvmAddChainPayload>`.
- `EvmAdapter.executeApproval` for `addChain`:
  - `eth_chainId` health check against `rpcUrls[0]` with a 5s
    timeout before persisting.
  - Append to user chain list (Zustand + SecureStore-backed — extend
    the existing chain store, don't create a new one).
  - Return `null` (EIP-3085 success shape).
- `components/dapps-browser/approvals/AddChainSheet.tsx`:
  - Wrap in `<ApprovalShell>`.
  - Show: chain name, chain id, currency symbol, RPC url host,
    explorer url host. Mismatch warnings if RPC domain differs from
    explorer domain (`warn` annotation, built-in heuristic
    inspector).
  - Approve / reject.
- Register in `renderers.ts`.

## Rules (non-negotiable)

- **RPC reachability validated before persisting.** If the health
  check fails, sheet shows an error state and blocks approve. Never
  persist an unreachable chain.
- **Chain id uniqueness.** A second add for an existing chain id is a
  no-op, not an error, per EIP-3085.
- **RPC URL scheme must be `https://`** unless the app is in dev mode
  (builtin heuristic annotation adds `warn` for `http://`).
- **Explorer URL is optional** but if present must be `https://`.
- **Never auto-switch to the newly added chain.** `wallet_switchEthereumChain`
  (task 14) is a separate request.

## Acceptance

- [ ] Spec-shape Zod validation with `-32602` on malformed.
- [ ] Adding Base from a dApp that calls `wallet_addEthereumChain`
      works end-to-end; chain appears in the wallet chain picker.
- [ ] Re-adding an existing chain is a silent success.
- [ ] Unreachable RPC blocks approve.
- [ ] Unit + integration tests for validation, duplicate id, RPC
      failure.
- [ ] `pnpm check:syntax` passes.

## Out of scope

- Merging with a curated default list from chainlist.org (§8 open
  question 5).
- Editing previously added chains (separate settings flow).
