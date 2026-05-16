# Task 12 — DeFi agent stub — card, handler, prompt

**Status:** Not taken
**Owner:** Server (agent-api)
**Spec reference:** `multi-agent-architecture-spec.md` §5, §12, §14.1 row 6, §14.2; cross-ref `defi-strategies-spec.md` §11.

## Why this matters

DeFi is the redesign's load-bearing test of "add a new specialist": if
the topology is right, shipping DeFi as a card + canned handler
*before* the DeFi backend exists should change nothing about Core,
Wallet, the orchestrator, or the SSE protocol. When the real backend
lands per `defi-strategies-spec.md`, only this file flips. That
promise (§14.2) only holds if the stub matches every shape it'll have
at flip time.

## Scope

- `agent-api/src/agents/defi/card.ts`:
  ```ts
  export const defiCard: AgentCard = {
    id: "defi",
    version: "0.1.0",
    display_name: "DeFi",
    description: "Yield strategies and position management. Coming soon — currently stubbed.",
    tool_prefixes: ["defi_"],
    capabilities: ["yield_discovery", "position_read", "deposit_withdraw_rebalance"],
    requires_wallet_context: true,
    requires_jwt: true,
    default_system_prompt_ref: "defi.v1",
    status: "stub",       // §12 — flips to "ready" at real-backend landing
  };
  ```
- `agent-api/src/agents/defi/handler.ts`:
  - `handleDefiTask({ task })` — pure function of `task.input`.
  - Branches on `task.input.tool_name` (or the `task.brief` if you
    prefer — keep it consistent across stub responses):
    - `defi_list_opportunities` → returns the three-row sample from
      Task 06's output schema (use the same fixtures Task 08 returns
      on mobile, so server and mobile narrate the same thing).
    - `defi_list_positions` → `{ positions: [] }`.
    - `defi_deposit` / `defi_withdraw` / `defi_rebalance` →
      `{ status: "stubbed", message: "DeFi agent is not yet wired up." }`.
  - **No LLM call.** §11.3.
  - **No tool dispatch to mobile.** The stub does not emit
    `tool_pending` — it resolves the `AgentTask` in-process.
- `agent-api/src/agents/defi/prompts.ts`:
  - Export `defi.v1` under `PROMPTS`. v1 prompt is a placeholder used
    only when the card flips to `ready` and reasoning is needed; mark
    with `TODO(v2)`.
- Wire `defiCard` into `agents/registry.ts` at boot.

## Rules (non-negotiable)

- **`status: "stub"` is load-bearing.** Core's prompt (Task 10) reads
  it and narrates the "coming soon" reply. Flipping to `"ready"`
  before the real backend lands breaks Core's contract.
- **No real DeFi calls.** Same rule as Task 06: no Web3 clients, no
  HTTP, no chain RPCs inside `agents/defi/` until the backend lands.
- **Stub fixtures live in one place.** If Task 08's mobile stub and
  this server stub disagree on the three sample opportunities, the
  agent's narration drifts from what mobile believes. Extract the
  fixture into a shared file or document it in both — pick one and
  comment cross-reference.
- **`message` is a sentinel.** Core paraphrases it; mobile never
  renders it (CLAUDE.md user-facing-error rule). Translation
  responsibility lives in Core's prompt, not here.
- **Flip path is a no-op rename.** When DeFi ships per
  `defi-strategies-spec.md`, this file's handler swaps to the real
  implementation, the card's `status` flips to `"ready"`, and the
  stub fixtures are deleted. **No other file** in this redesign
  should change at flip time (§14.2). If you find yourself needing
  to edit another file, push back — the seam isn't doing its job.

## Acceptance

- [ ] `defi/card.ts`, `defi/handler.ts`, `defi/prompts.ts` exist and
      register at boot.
- [ ] `assertRegistryInvariants` passes — DeFi owns exactly the
      `defi_*` prefix; all five tools (Task 06) resolve to it.
- [ ] Vitest covers: each of the five tool inputs returns the canned
      payload; no LLM call; no `tool_pending` emitted.
- [ ] Vitest covers: stub fixtures match Task 08's mobile fixtures
      (shared file or cross-asserted in test).
- [ ] Grep confirms no Web3 / chain-client / HTTP import inside
      `agents/defi/`.
- [ ] `pnpm --filter agent-api run check:syntax` passes.

## Out of scope

- The real DeFi backend integration — per `defi-strategies-spec.md`,
  deferred until the redesign ships.
- DeFi UI cards / generative-UI — same deferral.
- Orchestrator routing — Task 13.
