# Task 24 — Adapter error-code contract

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** `dapp-bridge-spec.md` §10.3 error codes, §10.4
invariant 1.

## Why this matters

Provider RPC errors carry meaning for dApps (`4902` → "call
`wallet_addEthereumChain` first", `-32002` → "we're already waiting on
another request, stop retrying"). A wallet that bubbles random
`Error("string")` values to the dApp looks amateur and breaks dApp
error recovery paths. This task unifies the error contract and tests
it per method.

## Scope

- Build a tiny helper `services/chains/evm/errors.ts`:
  ```ts
  export class ProviderRpcError extends Error {
    constructor(public code: number, message: string, public data?: unknown) {...}
  }
  export const PROVIDER_ERRORS = {
    userRejected: () => new ProviderRpcError(4001, "User rejected the request"),
    unauthorized: () => new ProviderRpcError(4100, "Unauthorized"),
    unsupportedMethod: (m: string) => new ProviderRpcError(4200, `Method ${m} not supported`),
    disconnected: () => new ProviderRpcError(4900, "Disconnected"),
    chainNotConnected: () => new ProviderRpcError(4901, "Chain not connected"),
    chainNotAdded: (id: number) => new ProviderRpcError(4902, `Chain ${id} not added`),
    resourceUnavailable: () => new ProviderRpcError(-32002, "Resource unavailable"),
    invalidParams: (detail: string) => new ProviderRpcError(-32602, `Invalid params: ${detail}`),
    internalError: (detail: string) => new ProviderRpcError(-32603, `Internal error: ${detail}`),
  } as const;
  ```
- Audit every branch in `EvmAdapter.handleRequest` and
  `executeApproval` to use `PROVIDER_ERRORS.*` exclusively. Grep-able.
- Map codes on the bridge→WebView boundary: the injected provider
  already emits `{code, message, data}` on rejection; confirm the
  shape matches EIP-1193.
- `DappBridge.dispatch` wraps unhandled exceptions with
  `PROVIDER_ERRORS.internalError(e.message)` — never bubbles raw
  stack traces to dApps.
- Add an adapter-level unit test matrix, one row per EIP-1193 /
  EIP-1474 code, asserting the right method-branch produces the
  right code.

## Rules (non-negotiable)

- **Every error leaving the adapter is a `ProviderRpcError`.** No
  plain `Error`, no string rejections.
- **Codes per §10.3.** Don't invent new codes. If a new case appears,
  map to the closest existing code and add `data` for context.
- **Unit-tested per method.** A single regression test file asserts
  the contract.
- **Rejection from the user is always `4001`.** Not `-32603`, not
  `1`, not `"user canceled"`. This is load-bearing for dApp recovery.

## Acceptance

- [ ] `services/chains/evm/errors.ts` exists and every adapter branch
      uses it.
- [ ] `rg "new Error\(" services/chains/evm/` returns zero matches.
- [ ] Test matrix covers: 4001, 4100, 4200, 4900, 4901, 4902, -32002,
      -32602, -32603 — at least one method path per code.
- [ ] Unhandled exceptions inside `executeApproval` surface as
      `-32603` with redacted detail, not the raw message.
- [ ] `pnpm check:syntax` passes.

## Phase 1b exit criteria (entire phase)

Once this ships, §10.5 GA checklist rows for error codes are covered,
and all P1b method rows should be complete. Smoke-test against the
list in §10.5 before marking the full phase done.

## Out of scope

- JSON-RPC batch error framing (not used by our provider).
- i18n of the error messages — keep them in English; dApps surface
  their own strings to users.
