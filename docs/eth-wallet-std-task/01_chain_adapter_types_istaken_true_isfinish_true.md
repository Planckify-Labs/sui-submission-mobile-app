# Task 01 — `ChainAdapter` types and registry

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** `dapp-bridge-spec.md` §4.1, §5 (file layout)

## Why this matters

The current `dapps-browser.tsx` owns a ~110-line `handleEthereumRequest`
switch that assumes EVM everywhere. The `ChainAdapter` interface is the
docking port that lets EVM / Solana / Sui / Bitcoin all present the same
shape to `DappBridge`. This task only defines the *types and registry* —
no adapter implementations. It unblocks tasks 05 (`DappBridge` router)
and 08 (`EvmAdapter` extraction).

## Scope

Create:

- `services/chains/types.ts` exporting `Namespace`, `ChainRequest`,
  `ChainResult`, `AdapterContext`, `ChainAdapter` exactly as written in
  §4.1.
- `services/chains/registry.ts` exporting a `ChainAdapterRegistry`
  singleton: `register(adapter)`, `get(namespace): ChainAdapter | null`,
  `list(): ChainAdapter[]`. Registry is module-local state; there is one
  per process.

## Rules (non-negotiable)

- **`Namespace` is a string-literal union** — `"eip155" | "solana" | "sui"`.
  No runtime enum. Adding a chain later extends the union at the type
  level.
- **`ChainResult` is a discriminated union on `status`.** Adapters never
  throw to signal user rejection — they return `{status: "error", code,
  message}` using EIP-1193 codes.
- **No React imports.** `services/chains/*` must be importable from a
  node-only test harness.
- **No `viem` imports.** This module is chain-agnostic. `viem` lives in
  `services/chains/evm/*` only.

## Acceptance

- [ ] `services/chains/types.ts` and `services/chains/registry.ts` exist
      with the exported surfaces above.
- [ ] A node-only unit test (`services/chains/registry.test.ts`) covers
      `register` + `get` + duplicate-register behavior.
- [ ] Grep shows no imports of `react`, `react-native`, or `viem` in
      `services/chains/types.ts` or `registry.ts`.
- [ ] `pnpm check:syntax` passes.

## Out of scope

- Implementing `EvmAdapter` (task 08).
- Wiring the registry into `DappBridge` (task 05).
