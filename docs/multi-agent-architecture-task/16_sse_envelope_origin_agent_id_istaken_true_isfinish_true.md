# Task 16 — Server SSE envelope — `origin_agent_id` + `narrative_handoff*` frames

**Status:** Not taken
**Owner:** Server (agent-api)
**Spec reference:** `multi-agent-architecture-spec.md` §6.4, §10.2, §11.4.

## Why this matters

The transport seam between server and mobile gains exactly two
additions in v1: an optional `origin_agent_id` on tool envelopes, and
the `narrative_handoff` / `narrative_handoff_end` frames that gate
narrative pass-through (§6.4). Both are *optional* so old mobile
clients keep working (§11.4 backwards compat). This task lands the
wire format on the server; Task 17 lands the mobile parse + render.

## Scope

- Edit the SSE protocol schema in `agent-api/src/agentSession/protocol.ts`
  (or wherever the envelope types live — match the existing layout):
  - Add `origin_agent_id?: AgentId` to the `tool_pending` and
    `tool_result` envelope types.
  - Add two new frame kinds (sibling to `tool_pending` /
    `tool_result` / `message`):
    - `narrative_handoff` — `{ kind: "narrative_handoff", origin_agent_id: AgentId }`.
    - `narrative_handoff_end` — `{ kind: "narrative_handoff_end", origin_agent_id: AgentId }`.
- Update the SSE emitter inside the orchestrator (Task 13) to:
  - Set `origin_agent_id` on every `tool_pending` it emits. For
    Wallet tools the value is `"wallet"`; for any future
    non-default specialist, its `AgentId`.
  - For `core_handoff conversational: true` (Task 13), emit
    `narrative_handoff` immediately before the specialist's first
    text delta and `narrative_handoff_end` after the last.
- Backwards-compat omission rule (per §11.4): for Wallet tools, the
  orchestrator MAY omit `origin_agent_id` since `"wallet"` is the
  default narrator. Choose one path consistently — recommended:
  **always emit it explicitly** so the field's presence on the wire
  is uniform and the backwards-compat case is "old mobile ignores it"
  rather than "server sometimes omits".
- Update the mirror schema on the mobile side
  (`services/agentSession/protocol.ts`) to declare the new optional
  field + frame kinds — types only, no behaviour. Behaviour wiring is
  Task 17. (This keeps types in lockstep within one PR; the codegen-
  or hand-mirror convention in `agentSession/` already exists, follow
  it.)
- Add a vitest in `agent-api/` that snapshots an example SSE frame
  sequence for:
  - A Wallet tool round-trip → `tool_pending` with
    `origin_agent_id: "wallet"`, `tool_result` echoes the id.
  - A DeFi stub round-trip → in-process, no SSE tool frames (only the
    final assistant message), per Task 12.
  - A `core_handoff conversational: true` → `narrative_handoff`,
    one or more text deltas under `origin_agent_id: "<specialist>"`,
    `narrative_handoff_end`, final assistant message.

## Rules (non-negotiable)

- **Optional means optional.** Old mobile clients that ignore the new
  field MUST keep working — verified by the backwards-compat e2e test
  in Task 20.
- **`origin_agent_id` is `AgentId`, not free-form.** Validate against
  the manifest at the orchestrator boundary; never echo back a
  malformed id from somewhere upstream.
- **No new SSE event types beyond the two narrative frames.** §10.5
  enumerates the surface; resist adding "for completeness".
- **Frames are content-only.** No timestamps, no request ids, no
  conversation-id — those already live on the channel. Bloating the
  envelope makes the parity check (Task 09 / Task 18) noisier.
- **CLAUDE.md user-facing-error rule:** any error encountered while
  emitting a frame is logged in `__DEV__` and translated to a
  friendly assistant message — never serialised into a frame field.

## Acceptance

- [ ] Envelope types updated on both server and mobile mirrors; both
      compile.
- [ ] Orchestrator emits `origin_agent_id` on every `tool_pending` it
      sends; emits `narrative_handoff` / `narrative_handoff_end`
      around pass-through deltas.
- [ ] Vitest snapshot tests cover the three round-trip cases above.
- [ ] `pnpm --filter agent-api run check:syntax` passes;
      `pnpm check:syntax` (mobile) passes.
- [ ] No regression in existing agent-session integration tests.

## Out of scope

- Mobile UI badge / parse-and-render — Task 17.
- The backwards-compat e2e test — Task 20.
- Any change to the `message` frame shape.
