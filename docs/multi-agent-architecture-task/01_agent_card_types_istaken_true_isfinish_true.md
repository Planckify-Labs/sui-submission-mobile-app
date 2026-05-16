# Task 01 — `AgentCard` + agent types

**Status:** Not taken
**Owner:** Server (agent-api)
**Spec reference:** `multi-agent-architecture-spec.md` §5, §8.2.

## Why this matters

The whole redesign hangs off three primitives borrowed from A2A —
`AgentCard`, `AgentTask`, peer messages (§3). Landing the type
definitions first means subsequent tasks (registry, orchestrator,
handlers, Prisma models) can all import a shared, frozen shape rather
than each inventing its own. If these types drift between server
modules, the prefix-routing invariants in §5 become unenforceable.

## Scope

- Create `agent-api/src/agents/types.ts`:
  - `export type AgentId = "core" | "wallet" | "defi" | (string & {});`
  - `AgentCard` per §5 (every field):
    - `id`, `version` (semver), `display_name`, `description`,
      `tool_prefixes: string[]`, `capabilities: string[]`,
      `requires_wallet_context: boolean`, `requires_jwt: boolean`,
      `default_system_prompt_ref: string`,
      `status: "ready" | "stub" | "disabled"`.
  - `AgentTaskStatus = "pending" | "working" | "completed" | "failed"`.
  - `AgentTask` (in-memory shape — distinct from the Prisma row in
    Task 14): `{ id, conversation_id, owner_agent: AgentId,
    parent_task_id?: string, brief: string, input: unknown,
    status: AgentTaskStatus, output?: unknown, created_at, updated_at }`.
  - `AgentPeerMessage`: `{ from: AgentId, to: AgentId,
    kind: "ask_user" | "info" | "result", body: string,
    attachments?: unknown }`.
  - `WalletContext` (re-exported / re-typed from
    `services/agentSession/protocol.ts` shape if not already shared):
    `{ address, namespace, chain_id, jwt }`.
- No runtime code in this file — pure type module. `export type`
  everywhere.
- Add a barrel `agent-api/src/agents/index.ts` re-exporting from
  `types.ts` so callers stabilise on a single import path.

## Rules (non-negotiable)

- **Type-only.** No `class`, no `const`, no Prisma imports. This file
  must be safely importable from anywhere on either runtime (server or
  shared lib) without pulling Prisma's client.
- **`AgentId` is open-ended.** The `(string & {})` tail lets new agents
  register without TS-narrowing breaking. Do not collapse to a closed
  union — §13 promises adding a future agent is a six-step checklist.
- **`tool_prefixes` is an array, not a single string.** Wallet alone
  owns nine prefixes per §5 table — never special-case a single-prefix
  agent.
- **No on-the-wire A2A schema yet.** We borrow A2A *semantics*, not its
  JSON shape (§3). Keep field names snake_case to match the existing
  agent-session protocol; do not chase A2A's camelCase wire format.
- **`AgentTask.input` / `output` are `unknown`.** Specialist handlers
  narrow with zod schemas at their own boundary; the orchestrator
  treats payloads as opaque.

## Acceptance

- [ ] `agent-api/src/agents/types.ts` and `index.ts` exist and pass
      `pnpm --filter agent-api run check:syntax` (or repo equivalent).
- [ ] `grep -R "import.*from.*agents/types" agent-api/src` returns
      nothing yet (this task introduces the types — consumers land in
      Tasks 03+).
- [ ] No runtime side-effects on import (verified by reading the diff —
      file contains only `export type` statements + comments).
- [ ] CLAUDE.md user-facing-error rule is not violated: types do not
      embed any user-rendered strings.

## Out of scope

- `agents/registry.ts` and the boot invariants — Task 03.
- The Prisma `AgentTask` / `AgentPeerMessage` row models — Task 14.
- Specialist-specific input/output schemas — Tasks 10–12.
