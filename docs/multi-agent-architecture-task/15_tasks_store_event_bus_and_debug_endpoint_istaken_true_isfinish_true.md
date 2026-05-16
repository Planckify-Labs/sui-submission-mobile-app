# Task 15 — `agents/tasks/{store,eventBus}.ts` + conversation-detail task transcripts

**Status:** Not taken
**Owner:** Server (agent-api)
**Spec reference:** `multi-agent-architecture-spec.md` §6.3, §8, §14.1 row 7.

## Why this matters

The orchestrator (Task 13) writes task lifecycle + peer-message audit
through a tiny store interface. The conversation-detail endpoint
needs to surface those transcripts in **debug-mode UI only** so a
developer can replay a turn after the fact. This task lands all three
pieces (store, in-process event bus, debug endpoint) because they
share the same data shape and decoupling them serves no purpose at v1.

## Scope

- `agent-api/src/agents/tasks/store.ts`:
  - `createTask({ conversationId, ownerAgent, parentTaskId?, brief, input }): Promise<AgentTaskRow>` — inserts with status `"pending"`.
  - `transitionTask(taskId, nextStatus, output?): Promise<void>` —
    moves `pending` → `working` → `completed` | `failed`. Reject
    illegal transitions in a single switch.
  - `appendPeerMessage({ taskId, from, to, kind, body, attachments? }): Promise<AgentPeerMessageRow>`.
  - `listTasksForConversation(conversationId): Promise<AgentTaskRow[]>` —
    `createdAt` ascending; includes peer messages via Prisma `include`.
  - All methods accept the Prisma client as a constructor arg so
    tests can inject an in-memory fake.
- `agent-api/src/agents/tasks/eventBus.ts`:
  - In-process peer-message bus (NestJS `EventEmitter2` is fine).
  - `emitPeerMessage(msg: AgentPeerMessage): void`.
  - `onPeerMessage(taskId: string, listener: (msg) => void): Unsubscribe`.
  - **No network.** §6.3 explicitly says peer-message transport is an
    in-process event bus for v1.
  - Orchestrator (Task 13) subscribes per task; specialists emit via
    this bus; store mirror-writes the row.
- `agent-api/src/conversations/conversations.controller.ts` (or
  wherever conversation-detail lives) — extend the existing detail
  endpoint:
  - When the caller is in *debug mode* (env flag
    `EXPOSE_AGENT_TASK_TRANSCRIPTS=true` **or** the request includes
    a verified internal-staff header — choose the existing convention
    in the codebase), the response includes a `agent_tasks` array
    with `{ id, ownerAgent, brief, status, createdAt, peerMessages[] }`.
  - In production / for end users, the response is unchanged. No new
    field, no `null`, no empty array — the field simply isn't there.

## Rules (non-negotiable)

- **Debug-only surface.** §14.1 row 7 is explicit. The transcript
  field never leaks to end users — gate it at the controller, not at
  the React Native client. Even a `null` field is a leak (it tells
  the world the feature exists).
- **No PII / no raw errors stored.** `brief` and `body` are short
  summaries. Raw RPC payloads, request bodies, stack traces — those
  go to `__DEV__` logs only (CLAUDE.md user-facing-error rule applies
  even to internal audit; raw payloads in DB rows become an exfil
  risk later).
- **Store is the only writer to the new tables.** The orchestrator
  doesn't touch Prisma directly; the event bus doesn't either.
  Keeping a single writer makes it trivial to layer policy later
  (e.g. redact a field, throttle writes).
- **Event bus is best-effort.** Listeners that throw must not block
  the orchestrator. Wrap each listener invocation in a try/catch and
  log in `__DEV__`.
- **Backwards compatibility.** The conversation-detail response shape
  is identical to today's when the debug flag is off. Mobile MUST
  still parse the response with no changes — this task does not
  touch mobile.

## Acceptance

- [ ] `store.ts`, `eventBus.ts` exist with the API above.
- [ ] Conversation-detail endpoint returns `agent_tasks` only when the
      debug flag is set; the prod response shape is unchanged.
- [ ] Vitest — happy path: orchestrator (mocked) calls `createTask`,
      `transitionTask("working")`, `appendPeerMessage`,
      `transitionTask("completed")`; `listTasksForConversation`
      returns the full transcript.
- [ ] Vitest — illegal transitions throw structured errors (not
      generic Error).
- [ ] Vitest — debug endpoint hidden when flag off, visible when on.
- [ ] `pnpm --filter agent-api run check:syntax` passes; existing
      tests still pass.

## Out of scope

- A separate debug UI in the mobile app — mobile remains untouched.
- A web admin dashboard that visualises transcripts — future work.
- The Prisma schema itself — Task 14.
