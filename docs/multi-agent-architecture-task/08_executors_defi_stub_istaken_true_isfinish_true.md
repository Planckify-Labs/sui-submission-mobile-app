# Task 08 — `services/agent-executors/defi/stub.ts`

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** `multi-agent-architecture-spec.md` §7.2, §12; cross-ref `defi-strategies-spec.md` §11.

## Why this matters

Per §12 the DeFi agent ships as a stub: server schemas land in Task 06,
but the mobile executor map still needs a handler for each tool name
that returns the canned `ToolResult` so the SSE round-trip closes
cleanly. Without this, every `defi_*` tool call would crash mobile's
parity check.

## Scope

- Create `services/agent-executors/defi/stub.ts`.
- Export executors keyed by each `defi_*` tool name landed in Task 06:
  - `defi_list_opportunities` → returns the fixed three-row sample
    matching the output schema from Task 06 (`opportunities` array).
    Use realistic but obviously-fake values (e.g. `protocol_slug:
    "stub-pool-1"`).
  - `defi_list_positions` → returns `{ positions: [] }`.
  - `defi_deposit`, `defi_withdraw`, `defi_rebalance` → return
    `{ status: "stubbed", message: "DeFi agent is not yet wired up." }`.
- Compose them via `composeAgentExecutors("defi", …)` from Task 07.
- Register in `services/agent-executors/index.ts` so they appear in
  the flat `EXECUTORS` map under their `defi_*` keys.
- Add a `services/agent-executors/defi/stub.test.ts` (node:test, fits
  the existing `_test-resolver.mjs` harness — see CLAUDE.md) covering:
  - Each tool returns a `ToolResult` matching the server schema.
  - No executor performs a chain RPC (assert via a fail-loud mock that
    explodes if `walletKitRegistry.get(...)` is called from within the
    stub).

## Rules (non-negotiable)

- **Never issue chain RPCs.** Stub executors are pure functions of
  their input. No `walletKitRegistry`, no `viem`, no `@solana/kit`, no
  HTTP. The whole point of the stub is to validate topology before
  DeFi exists.
- **`message: "DeFi agent is not yet wired up."` is a sentinel, NOT
  user copy.** It is consumed by Core (Task 10) and paraphrased into
  the friendly "DeFi Strategies are coming soon …" reply. Mobile UI
  never renders this string directly (CLAUDE.md user-facing-error
  rule).
- **Dev-only logs.** Any `console.warn` inside the stub guards on
  `__DEV__`. Stubs are not allowed to noise up release builds.
- **No UI cards registered.** Per §12, no `components/agent/cards/`
  entries for DeFi tools in this redesign — Core narrates the result.
  Resist the temptation to "just add a placeholder card".
- **Output shape matches Task 06 exactly.** A drift here breaks the
  stub→real flip promise (§12). Snapshot-test against the canonical
  payloads if drift becomes a worry.

## Acceptance

- [ ] `defi/stub.ts` exists with executors for all five `defi_*` tool
      names.
- [ ] `services/agent-executors/index.ts` includes the defi bucket;
      flat `EXECUTORS` map now has keys for all five.
- [ ] `pnpm test` passes including `defi/stub.test.ts`.
- [ ] Grep confirms no `walletKitRegistry`, `viem`, `@solana/kit`,
      `fetch`, or `XMLHttpRequest` reference inside `defi/`.
- [ ] `pnpm check:syntax` passes.

## Out of scope

- Real DeFi executors — deferred per §14.2 until
  `defi-strategies-spec.md` is implemented.
- DeFi UI cards / generative-UI integration — same deferral.
- Parity-check extension (prefix→agent) — Task 09.
