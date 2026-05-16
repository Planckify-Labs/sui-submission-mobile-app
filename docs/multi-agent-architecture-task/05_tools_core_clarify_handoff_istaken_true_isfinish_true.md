# Task 05 — `tools/core/{clarify,handoff}.ts` — orchestration affordances

**Status:** Not taken
**Owner:** Server (agent-api)
**Spec reference:** `multi-agent-architecture-spec.md` §4.1, §6.1, §6.4.

## Why this matters

Core's tool surface is **finite and finite forever** (§4.1): only
`core_clarify` (ask the user a question) and `core_handoff` (let a
specialist take the narrative for one turn). Both are in-process —
they do not hit mobile and they do not reach the network. Landing them
now seeds Core's prompt and unblocks Task 13 (the orchestrator), which
needs `core_handoff`'s schema to dispatch narrative pass-through.

## Scope

- `agent-api/src/tools/core/clarify.ts`:
  - Tool name: `core_clarify`.
  - Input schema (zod): `{ question: string; reason?: string }`.
  - Output schema: `{ question: string }` — orchestrator surfaces this
    verbatim to the user as the assistant message of this turn (Core
    paraphrases on the next turn if needed).
  - Handler is **in-process** — it does **not** emit a mobile
    `tool_pending`. Orchestrator (Task 13) detects this tool and short-
    circuits.
- `agent-api/src/tools/core/handoff.ts`:
  - Tool name: `core_handoff`.
  - Input schema (zod):
    `{ to: AgentId; brief: string; conversational?: boolean }`.
    - `conversational: true` triggers the narrative-pass-through path
      (§6.4): Core emits a `narrative_handoff` SSE frame and the
      specialist streams text deltas under its `origin_agent_id` until
      `narrative_handoff_end`.
    - `conversational: false` (default) delegates a structured task —
      Core resumes the narrative after the specialist returns.
  - Output schema: `{ task_id: string }` — the `AgentTask` row created
    by the orchestrator.
- `agent-api/src/tools/core/index.ts` — barrel exporting both tools and
  wiring them through `composeAgentTools("core", …)` from Task 04 so
  the prefix invariant is enforced locally.
- Register the core bucket in `agent-api/src/tools/registry.ts` so the
  flat registry now includes both `core_clarify` and `core_handoff`.

## Rules (non-negotiable)

- **No external capability under `core_`.** §4.1 invariant. These two
  tools never:
  - issue a `tool_pending` event to mobile,
  - import from `services/walletKit/`, `services/chains/`,
    `services/defi/`, or any other capability module on the server,
  - call out to RPCs / HTTP / chain providers.
  If you find yourself reaching for one of those, the affordance you
  want belongs on a specialist, not on Core.
- **Schemas are LLM-friendly.** Field names are short, lower_snake_case,
  and the zod descriptions are written for the Kimi K2 prompt — keep
  each description ≤ 12 words; this is what surfaces in the LLM's tool
  definition payload.
- **`core_handoff.to` must be a valid `AgentId`.** Validate against the
  manifest at runtime (use Task 03's `getAgentCard`) — invalid agent
  ids produce a structured error the orchestrator translates to
  friendly Core copy (CLAUDE.md user-facing-error rule).
- **No user copy in this file.** "Something went wrong" / "DeFi is
  coming soon" lives in Core's prompts (Task 10) and the orchestrator
  (Task 13). These tool files are protocol only.
- **`AgentId` is the type from Task 01.** Do not re-declare.

## Acceptance

- [ ] `clarify.ts`, `handoff.ts`, `index.ts` exist; both tools register
      in the flat registry.
- [ ] `composeAgentTools("core", …)` validates the `core_` prefix is
      respected (covered by Task 04's helper test, or extend it).
- [ ] Vitest covers: zod schema accepts valid input, rejects missing
      `question` / `to` / `brief`, `core_handoff.to = "nonexistent"`
      yields a validation error.
- [ ] Grep `import.*core_` confirms no other tool file imports from
      `tools/core/`. Core is consumed by the orchestrator only.
- [ ] `pnpm --filter agent-api run check:syntax` passes.

## Out of scope

- The Core agent's *card* and *handler* — Task 10.
- The orchestrator's short-circuit handling of these tools — Task 13.
- The mobile-side rendering of `core_clarify` answers — none needed
  (the orchestrator surfaces the question as a normal assistant turn).
