# Task 14 — Prisma migration — `AgentTask` + `AgentPeerMessage`

**Status:** Not taken
**Owner:** Server (agent-api)
**Spec reference:** `multi-agent-architecture-spec.md` §8.2, §14.1 row 7.

## Why this matters

Today `agent-api/` persists `Conversation` and `Message`. The redesign
adds two audit tables — `AgentTask` and `AgentPeerMessage` — so we can
replay or debug a turn after the fact. This task lands only the
schema + migration; the store wrapper and orchestrator integration
come in Task 15.

## Scope

- Edit `agent-api/prisma/schema.prisma` to add (exact shape per §8.2):
  ```prisma
  model AgentTask {
    id              String   @id @default(cuid())
    conversationId  String
    ownerAgent      String           // AgentId
    parentTaskId    String?          // for nested delegations
    brief           String
    inputJson       Json
    status          String           // pending | working | completed | failed
    outputJson      Json?
    createdAt       DateTime @default(now())
    updatedAt       DateTime @updatedAt
    conversation    Conversation @relation(fields: [conversationId], references: [id])

    @@index([conversationId])
  }

  model AgentPeerMessage {
    id          String   @id @default(cuid())
    taskId      String
    fromAgent   String
    toAgent     String
    kind        String           // "ask_user" | "info" | "result"
    body        String
    attachments Json?
    createdAt   DateTime @default(now())
    task        AgentTask @relation(fields: [taskId], references: [id])

    @@index([taskId])
  }
  ```
- Add the inverse relation on `Conversation` (`agentTasks AgentTask[]`)
  if not already present.
- Generate the migration via the standard Prisma flow
  (`pnpm --filter agent-api prisma migrate dev --name add_agent_tasks`)
  and commit both the SQL and the updated client.
- Update any seed scripts if they currently rely on `Conversation`'s
  shape — they should still work without touching the new tables
  (foreign-key cascade is fine to leave default).

## Rules (non-negotiable)

- **Match the spec field-for-field.** §8.2 names and types are
  exact — `inputJson` / `outputJson` (not `input` / `output`),
  `ownerAgent` (not `owner_agent`), `parentTaskId` (not
  `parent_task_id`). Drift breaks the store wrapper in Task 15.
- **JSON columns are unconstrained at the Prisma layer.** Schema is
  enforced by zod inside specialist handlers (Tasks 11, 12).
- **`status` is a plain `String`.** No native enum — Postgres enums
  cost more migration friction than they save here; the type union is
  enforced at the application boundary (`AgentTaskStatus` from Task
  01).
- **Indexes are minimal.** `@@index([conversationId])` and
  `@@index([taskId])` are enough for v1 access patterns (list a
  conversation's tasks; list a task's peer messages). Don't speculate
  with composite indexes — add them when telemetry says so.
- **No PII in `brief` / `body`.** The orchestrator (Task 13) writes
  these; keep them short summaries, never raw tool inputs or LLM
  prompts (and CLAUDE.md's friendly-error rule applies — any raw
  error detail goes to logs, not into `body`).

## Acceptance

- [ ] `prisma/schema.prisma` includes both models with the §8.2 shape.
- [ ] Migration SQL committed under
      `agent-api/prisma/migrations/<timestamp>_add_agent_tasks/`.
- [ ] `pnpm --filter agent-api prisma generate` produces a client that
      exposes `prisma.agentTask` and `prisma.agentPeerMessage`.
- [ ] Existing integration tests still pass against the new schema.
- [ ] CI applies the migration cleanly on a fresh database (manual
      check in staging if CI doesn't run migrations).

## Out of scope

- The `tasks/store.ts` Prisma wrapper — Task 15.
- The conversation-detail debug endpoint — also Task 15.
- The orchestrator's task-lifecycle writes — already designed in Task
  13, integration happens via Task 15's store.
