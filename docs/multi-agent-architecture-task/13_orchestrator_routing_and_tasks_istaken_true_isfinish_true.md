# Task 13 — Orchestrator — prefix routing, `AgentTask` lifecycle, `wallet_context` propagation

**Status:** Not taken
**Owner:** Server (agent-api)
**Spec reference:** `multi-agent-architecture-spec.md` §6.1–§6.4, §9, §11.2.

## Why this matters

The orchestrator is the heart of the redesign — it's what makes Core's
emitted tool calls land in the right specialist, what carries
`wallet_context` through unchanged, what spawns `AgentTask` rows for
audit, and what gates the narrative pass-through. Everything before
this task is plumbing; this is where the plumbing carries water.

## Scope

- `agent-api/src/agents/orchestrator.ts`:
  - `orchestrate({ conversation_id, user_message, wallet_context, sse_sink })`:
    1. **Set `wallet_context` once per turn** (§9). All forwarded
       envelopes use this exact object — no re-resolution.
    2. Call `handleCoreTurn(...)` (Task 10).
    3. For each tool call in Core's plan:
       - Resolve owning agent via `getAgentForTool(toolName)`
         (longest-prefix-wins from Task 03).
       - Open an `AgentTask` row via `tasks/store.ts` (Task 15) —
         status `pending` → `working`.
       - Dispatch to the specialist handler:
         - Core tools (`core_clarify`, `core_handoff`) → in-process.
         - Wallet tools → `handleWalletTask` (Task 11) — emits
           `tool_pending` to mobile via `sse_sink` with
           `origin_agent_id: "wallet"` and the forwarded
           `wallet_context`. Awaits mobile's `tool_result`.
         - DeFi tools → `handleDefiTask` (Task 12) — in-process,
           canned response.
       - Close the `AgentTask` (status `completed` / `failed`).
    4. After every specialist returns, re-enter Core for one more
       turn (Core summarises specialist output → user-visible
       message).
    5. Emit final assistant message frame to `sse_sink`.
  - **`core_handoff` handling** (§6.1):
    - `conversational: false` (default) — delegate task to `to`;
      Core resumes the narrative.
    - `conversational: true` — emit `narrative_handoff` SSE frame with
      `origin_agent_id` (Task 16); pipe specialist text deltas
      verbatim; emit `narrative_handoff_end` when the specialist
      finishes; Core does not re-enter for narration this turn.
  - **Peer messages** (§6.3):
    - `kind: "ask_user"` from a specialist → Core decides next turn
      (the orchestrator does not surface it to mobile directly).
    - `kind: "info"` / `"result"` → recorded in the `AgentTask`
      transcript via `tasks/store.ts`.
- `agent-api/src/agents/tools/dispatch.ts` (or sibling) — thin
  registry-aware dispatcher the orchestrator uses to look up the
  agent for a tool name, to keep `orchestrator.ts` readable.
- Wire the orchestrator into the existing agent-session SSE endpoint
  in place of the current single-agent turn handler. The legacy
  handler stays only as a fallback path off a feature flag —
  **actually scratch that**: §14 says "ships as one feature, no flag"
  — delete the legacy path in the same PR.

## Rules (non-negotiable)

- **`wallet_context` is set once and forwarded verbatim** (§9,
  CLAUDE.md dApp bridge isolation + payment JWT binding). The
  orchestrator never edits, never re-resolves, never picks up
  `activeWallet` from mobile state. Each `tool_pending` envelope
  carries the same `wallet_context` Core received at the top of the
  turn.
- **Static prefix routing is the hot path** (§6.1). The orchestrator
  does not ask the LLM "which agent owns this?" — that's already
  encoded in the manifest. `core_handoff` is the only LLM-driven
  routing decision.
- **Specialists never reach mobile directly** (§4). Every
  `tool_pending` goes through `sse_sink` keyed on `tool_call_id`; the
  orchestrator dispatches the matching `tool_result` back to the
  specialist that asked for it.
- **No specialist-to-specialist delegation in v1** (§15 Q3). If a
  specialist needs another's capability, it returns a result the
  orchestrator re-routes via Core. This is enforced by the lint in
  Task 18.
- **Errors are friendly at the seam.** Specialist errors are caught,
  logged with raw detail in `__DEV__`, and translated to a structured
  error Core paraphrases for the user. Never let a raw RPC / DB / LLM
  error bubble into a user-visible frame (CLAUDE.md).
- **Backwards-compatible envelopes.** If `origin_agent_id` would be
  `"wallet"` and no other change applies, the orchestrator MAY omit
  the field — that's the §11.4 backwards-compat guarantee for old
  mobile clients. Task 16 covers the field on the wire; Task 17
  covers the mobile-side rendering.

## Acceptance

- [ ] `orchestrator.ts` and `tools/dispatch.ts` exist and the SSE
      endpoint routes through them.
- [ ] Legacy single-agent turn handler is removed in the same PR.
- [ ] Vitest — happy path: a "transfer 1 USDC" message produces one
      `tool_pending` for `transfer_erc20` with
      `origin_agent_id: "wallet"` and the forwarded `wallet_context`;
      mobile's mocked `tool_result` returns; Core re-enters and emits
      the final user-visible message.
- [ ] Vitest — DeFi stub: a "deposit 50 USDC into Aave" message
      produces a `defi_deposit` tool call; DeFi stub returns
      `status: "stubbed"`; Core's final message paraphrases per §12
      and Appendix A. The raw stub `message` does not appear in the
      assistant frame.
- [ ] Vitest — `wallet_context` integrity: a forged inner edit
      attempt (a specialist returns a `tool_pending` with a different
      `wallet_context`) is rejected by the orchestrator. The lint in
      Task 18 catches the *static* case; this is the runtime check.
- [ ] Vitest — `core_handoff conversational: true` emits
      `narrative_handoff` + `narrative_handoff_end` frames around the
      specialist's text deltas.
- [ ] `pnpm --filter agent-api run check:syntax` passes.

## Out of scope

- Prisma row persistence — Task 14 (the orchestrator uses Task 15's
  in-memory store until 14 lands; design the interface so swapping is
  trivial).
- SSE wire-format frames for `origin_agent_id` / `narrative_handoff*`
  — Task 16.
- Mobile rendering — Task 17.
- The `pnpm check:agents` lint — Task 18.
