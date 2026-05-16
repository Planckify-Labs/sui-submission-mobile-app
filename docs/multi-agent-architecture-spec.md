# Multi-Agent Architecture — Engineering Spec

> **Status:** Draft v0.1 · Owner: Agent · Last updated: 2026-05-15
> **Scope:** Replace the single monolithic Takumi Agent with a small
> orchestrator (**Core agent**) that delegates to specialist sub-agents
> (**Wallet agent**, **DeFi agent**, future agents) using an A2A-style
> peer protocol internally, while each sub-agent continues to expose
> its own tools through the existing mobile executor registry
> (MCP-equivalent surface).
> **Intent reference:** [A2A protocol](https://a2a-protocol.org/latest/),
> [a2a-js](https://github.com/a2aproject/a2a-js).
> This spec rebases A2A's "agents discover each other, negotiate, share
> tasks, exchange context" model onto our existing SSE tool-call protocol
> so we don't rebuild primitives we already own (executor registry,
> permission grants, conversation persistence, wallet_context isolation).

## Table of contents

1. [Goal & non-goals](#1-goal--non-goals)
2. [Background — what we have today](#2-background--what-we-have-today)
3. [A2A vs MCP — what each protocol owns here](#3-a2a-vs-mcp--what-each-protocol-owns-here)
4. [Agent topology](#4-agent-topology)
5. [Agent Card — capability discovery](#5-agent-card--capability-discovery)
6. [Routing & orchestration](#6-routing--orchestration)
7. [Tool-registry partitioning](#7-tool-registry-partitioning)
8. [Conversation & state model](#8-conversation--state-model)
9. [Wallet-context isolation (CLAUDE.md rule, applied here)](#9-wallet-context-isolation-claudemd-rule-applied-here)
10. [Mobile changes](#10-mobile-changes)
11. [`agent-api/` changes](#11-agent-api-changes)
12. [DeFi agent — dummy first cut](#12-defi-agent--dummy-first-cut)
13. [Adding a new sub-agent — the checklist](#13-adding-a-new-sub-agent--the-checklist)
14. [Rollout](#14-rollout)
15. [Open questions](#15-open-questions)
16. [Appendix A — Worked example: "Deposit 50 USDC into Aave"](#appendix-a--worked-example-deposit-50-usdc-into-aave)

---

## 1. Goal & non-goals

### Goal

Replace the single Takumi Agent with a **specialist-team** model:

- **Core agent** — the only agent the user talks to. Routes intent,
  holds conversation state, summarises specialist results back to the
  user. Owns no domain tools beyond chit-chat / clarification.
- **Wallet agent** — owns balances, transfers, approvals, address
  book, gas estimation, points. Anything where the device is the
  signer.
- **DeFi agent** — owns yield strategies, opportunity discovery,
  rebalances, position reads (per
  [`docs/defi-strategies-spec.md`](./defi-strategies-spec.md)).
  Ships v1 as a **stub** that returns dummy responses; the topology
  is finalised before the DeFi backend lands.
- **Extensible by design.** Adding a future agent (Identity, NFT,
  Payments-Concierge, …) means dropping a manifest + handler in
  `agent-api/`, registering its tool executors in mobile, and the
  Core orchestrator picks it up automatically.

### Non-goals

- **No new transport.** SSE + the existing `tool_pending` /
  `tool_result` envelope stays. Sub-agents are addressed inside the
  same channel; we are not opening a second long-lived socket.
- **No public A2A server endpoint.** Sub-agents live in `agent-api/`
  and are reachable only by Core. We borrow A2A's *semantics*
  (Agent Card, task delegation, peer messages) but the wire format
  is internal.
- **No multi-process agent runtime.** All sub-agents run inside the
  same `agent-api/` NestJS process for v1; nothing in the design
  prevents extraction later.
- **No new LLM provider.** Core and specialists share the
  `@ai-sdk` Kimi K2 adapter already wired up. Different specialists
  may use different *system prompts* / *model parameters* but the
  same provider.
- **No change to the executor signature on mobile.**
  `MobileToolExecutor(input, context) → Promise<ToolResult>` stays.
  Routing is purely server-side metadata.

---

## 2. Background — what we have today

(Findings from a fresh scan; cite line numbers so this stays
checkable.)

**Mobile**

- UI: `components/home/TakumiAgent/AgentMode.tsx` (~1.1k lines of
  logic), wires a single SSE session via `services/agentSession/`.
- Tool executor registry: `services/agent-executors/index.ts:50`
  exposes a flat `EXECUTORS` map keyed by tool name. 19 files, 29
  tools spanning reads, simulate, writes, points, Solana, Sui,
  address book. Executor signature lives at
  `services/agent-executors/types.ts:104-107`.
- Conversation persistence: per-wallet MMKV cache + TanStack Query
  (`AgentMode.tsx:718-985`). Server is the source of truth via
  `api/endpoints/conversationsApi.ts`.
- No agent-role or persona handling client-side. The system prompt
  is server-only. `wallet_context` is the only contract field that
  shapes server behaviour (`services/agentSession/protocol.ts:31-49`).

**Server (`agent-api/`)**

- NestJS + Fastify, Prisma (Conversation + Message only), Kimi K2 via
  `@ai-sdk/openai` adapter, SSE bidirectional tool protocol with
  mobile. Tool *schemas* live here; mobile only implements executors.
- One LLM call per turn; tools are looked up by name from a flat
  server-side registry (`agent-api/src/tools/registry.ts`, mirrored
  by mobile's `EXECUTORS`).

**Zero references** to `a2a`, `subagent`, `delegation` (in agent
context), or `agent2agent` anywhere in the repo. This is a greenfield
introduction.

---

## 3. A2A vs MCP — what each protocol owns here

We are not adopting A2A or MCP as on-the-wire standards in v1. We are
adopting their **separation of concerns** because they map cleanly onto
the seam we want to introduce:

| Protocol | Domain | Where it lives in our system |
|---|---|---|
| **A2A (Agent2Agent)** | Agent ↔ Agent. Discovery via Agent Cards, task delegation, peer messages, shared context. | Server-only. Core ↔ {Wallet, DeFi, …} use an A2A-shaped envelope **inside `agent-api/`**. Not exposed to mobile, not exposed to the public internet. |
| **MCP (Model Context Protocol)** | Agent ↔ Tool. Structured input/output, stateless capability invocation. | Already in place, conceptually. Our `tool_pending` SSE event + `EXECUTORS[name]` is MCP-shaped (server describes the tool, client executes it, structured `ToolResult` comes back). We keep this and rename mentally — the executor registry is our "MCP surface" on mobile. |

So: **A2A is how Core finds and talks to Wallet/DeFi inside the server.
MCP-style tool-calls are how every agent reaches out of its sandbox to
the device or external APIs.** This is the same pattern the A2A docs
describe with the auto-repair-shop example — manager ↔ mechanic over
A2A, mechanic ↔ scanner over MCP.

We adopt three primitives from A2A:

1. **Agent Card** — JSON descriptor of an agent's role, capabilities
   (tool prefixes), and routing hints. Core uses these for routing.
2. **Task** — a unit of work delegated by Core to a specialist. Has
   an ID, input, status (`pending` / `working` / `completed` /
   `failed`), and a transcript of peer messages.
3. **Peer message** — Core ↔ specialist exchange inside a task. Lets
   a specialist ask clarifying questions back to Core (which then
   surfaces them to the user) without losing the task context.

Anything in A2A beyond these three (push notifications, agent
authentication, public Agent Card hosting, multi-org federation) is
out of scope.

---

## 4. Agent topology

```
                ┌────────────────────────────────────────────────┐
                │                  MOBILE                         │
                │  AgentMode.tsx  ──SSE──►  one chat session      │
                │   ↑                                              │
                │   │  tool_pending / tool_result                  │
                │   │                                              │
                │  EXECUTORS (flat map, partitioned by prefix      │
                │             into core_/wallet_/defi_ groups)     │
                └───────────────────────────────┬─────────────────┘
                                                │  (single SSE channel,
                                                │   agent-tagged events)
                                                ▼
       ┌────────────────────────────────────────────────────────────┐
       │                       agent-api/                            │
       │                                                             │
       │   ┌─────────────┐   A2A envelope    ┌────────────────┐      │
       │   │  Core       │ ◄──tasks/msgs──► │  Wallet agent  │      │
       │   │  agent      │                   └────────────────┘      │
       │   │  (router)   │                   ┌────────────────┐      │
       │   │             │ ◄──tasks/msgs──► │  DeFi agent    │      │
       │   │             │                   │   (stub v1)    │      │
       │   │             │                   └────────────────┘      │
       │   │             │ ◄──tasks/msgs──► │  …future agent │      │
       │   └──────┬──────┘                   └────────────────┘      │
       │          │                                                  │
       │          ▼                                                  │
       │   ConversationStore  (Prisma: Conversation, Message,        │
       │                       AgentTask — NEW)                      │
       └────────────────────────────────────────────────────────────┘
```

**Properties:**

- One user-visible chat session. The user does **not** know there
  are multiple agents — they see one assistant.
- One SSE stream per session. Tool envelopes carry an
  `origin_agent_id` so mobile can tag which sub-agent emitted them
  (used for analytics + UI affordances; not for routing).
- Core agent is the only one that talks to the user-facing message
  stream. Specialists' textual output is **summarised by Core**
  before reaching mobile, unless explicitly proxied (see §6.4).
- Specialists' tools execute on mobile via the existing executor
  registry. There is **no specialist ↔ mobile direct channel** —
  every tool call is sequenced by the server.

### 4.1 Core is orchestration-only — no external MCP surface

This is a load-bearing invariant of the design:

- **Core owns no external tools.** No chain reads, no signing, no
  balance fetches, no external API calls, no on-device executors.
  If Core needs *any* of those, it delegates to the appropriate
  specialist by emitting a tool call with that specialist's prefix
  (e.g. `get_balance` → Wallet, `defi_list_positions` → DeFi).
- **The only tools registered under Core's prefix are orchestration
  affordances**: `core_clarify` (ask the user a question) and
  `core_handoff` (let a specialist take the narrative for one turn).
  Neither hits the device or the network. They are structured LLM
  outputs that the orchestrator handles in-process.
- **Why this matters.** It keeps the routing graph a tree (Core at
  the root, specialists at the leaves) instead of a mesh. Any
  capability the agent gains has exactly one owner, and that owner
  is never Core. This is what makes "add a new specialist" the
  six-step checklist in §13 — there is no Core surface to grow.

**CI enforcement.** `pnpm check:agents` (§7.3) fails if:

1. Core's Agent Card declares any `tool_prefix` other than `core_`.
2. Any tool under the `core_` prefix issues a `tool_pending` event
   to mobile or imports from `services/walletKit/`,
   `services/chains/`, `services/defi/`, or any other external-
   capability module.
3. Core's handler imports any specialist handler directly (it must
   reach them only through the orchestrator's registry lookup).

---

## 5. Agent Card — capability discovery

Each sub-agent ships a static `AgentCard` (JSON) loaded at boot.
Borrowed from A2A's Agent Card concept but trimmed to what we need.

```ts
// agent-api/src/agents/types.ts
export type AgentId = "core" | "wallet" | "defi" | (string & {});

export type AgentCard = {
  id: AgentId;
  version: string;                      // semver, bumped on schema change
  display_name: string;                 // for debug logs / admin UI
  description: string;                  // routing hint for Core's LLM
  tool_prefixes: string[];              // owned tool name prefixes
  capabilities: string[];               // free-form tags ("read_balance", "sign_tx", "yield_discovery")
  requires_wallet_context: boolean;     // whether wallet_context must be forwarded
  requires_jwt: boolean;                // whether paying-wallet JWT is needed
  default_system_prompt_ref: string;    // key into PROMPTS map (server-side)
  status: "ready" | "stub" | "disabled";
};
```

**Boot-time invariants** (enforced in `agent-api/src/agents/registry.ts`):

- No two agents share a `tool_prefix`.
- Every `tool_prefix` matches at least one tool in the server tool
  registry.
- The union of all `tool_prefixes` covers the server tool registry —
  no orphan tools.
- A parity check on mobile (mirroring the existing
  `assertRegistryParity()` at
  `services/agent-executors/index.ts:129-138`) asserts every
  server tool prefix has a mobile executor.

Initial cards:

| Agent | `tool_prefixes` | Owns |
|---|---|---|
| `core` | `core_` only — **never grows** | Orchestration affordances only: `core_clarify`, `core_handoff`. No external tools, ever (see §4.1). |
| `wallet` | `get_`, `send_`, `transfer_`, `approve_`, `read_contract`, `estimate_gas`, `write_contract`, `points_`, `address_book_` | all 29 existing executors except those reassigned to DeFi |
| `defi` | `defi_` | stub: `defi_list_opportunities`, `defi_list_positions`, `defi_deposit`, `defi_withdraw`, `defi_rebalance` (all dummy). Names match the canonical set in [`defi-strategies-spec.md` §11](./defi-strategies-spec.md#11-agent-executor-tools) so the stub → real flip is a no-op rename. The full DeFi spec also adds `defi_get_config`, `defi_simulate_deposit`, and `defi_claim`; those land at flip time, not as stubs. |

Prefix-based routing is intentionally boring. It survives without an
LLM in the loop (cheap path) and gives us a fast lint
(`pnpm check:agents`) that fails CI if a tool drifts out of its
agent's prefix.

---

## 6. Routing & orchestration

### 6.1 Decision: keep it explicit, LLM-assisted

Two viable shapes were considered:

1. **LLM-as-router.** Core's LLM reads the user message and *decides*
   which sub-agent to delegate to via a `delegate_to_agent` tool call.
2. **Static prefix routing.** Tool name prefix determines the owning
   agent; no LLM router round-trip.

We use **both**, in that order:

- **Routing of a tool call** is static. When Core's LLM emits a tool
  call named e.g. `defi_deposit`, the orchestrator inspects
  the prefix, finds DeFi's Agent Card, opens (or reuses) an
  `AgentTask` against the DeFi agent, and runs DeFi's handler. The
  LLM never has to "pick an agent" explicitly.
- **Delegation of a turn** is LLM-driven. Core can also emit an
  explicit `core_handoff` tool call (`{ to: "defi", brief: "…" }`)
  when the work is conversational and tool-less (e.g. "explain
  liquid staking risks to the user"). Specialists return either a
  text answer or a follow-up tool plan.

Static prefix is the hot path. `core_handoff` exists to cover the
~5% of cases where Core wants the specialist to take over the
*narrative*, not just produce a structured tool result.

### 6.2 AgentTask lifecycle

```
[Core emits tool call or core_handoff]
        │
        ▼
   AgentTask.create({
     id, conversation_id, owner_agent: "defi",
     status: "pending", brief, input
   })
        │
        ▼
   specialist handler runs
        │
        ├─► may emit tool_pending events (executed on mobile)
        ├─► may emit peer messages back to Core
        │    (e.g. "I need the user's risk tier — please ask")
        └─► returns final payload (text, structured data, or
            a tool result for Core to summarise)
        │
        ▼
   AgentTask.complete({ output })
        │
        ▼
   Core resumes its turn, folds the task output into its next
   LLM call, and emits the user-visible message.
```

All AgentTasks for a conversation are persisted (§8) so we can
replay / audit.

### 6.3 Peer messages

A peer message is `{ from: AgentId, to: AgentId, body: string,
attachments?: unknown }`. The transport is an internal in-process
event bus (NestJS EventEmitter is sufficient for v1). No network.

If a specialist's peer message is `kind: "ask_user"`, Core decides
whether to surface it as a user-visible question or to answer from
its own knowledge of the conversation. Specialists never speak to
mobile directly.

### 6.4 Streaming text from a specialist

Sometimes a specialist *should* stream its prose to the user verbatim
(e.g. DeFi explaining a strategy at length). Core can grant a
"narrative pass-through" by emitting an SSE frame
`{ kind: "narrative_handoff", origin_agent_id: "defi" }`; subsequent
text deltas from DeFi stream to mobile under DeFi's `origin_agent_id`
until Core emits `narrative_handoff_end`. Mobile renders the message
with a small "via DeFi specialist" affordance.

This is the only place a non-Core agent reaches the user directly,
and it's gated by Core.

---

## 7. Tool-registry partitioning

### 7.1 Server side (`agent-api/src/tools/`)

Today: one flat registry. After:

```
agent-api/src/tools/
├── core/
│   ├── clarify.ts
│   └── handoff.ts
├── wallet/
│   ├── reads.ts          (moved from current registry)
│   ├── writes.ts
│   ├── points.ts
│   ├── solana.ts
│   ├── sui.ts
│   └── addressBook.ts
├── defi/
│   ├── opportunities.ts  (stub)
│   ├── positions.ts      (stub)
│   ├── propose.ts        (stub)
│   └── ...
└── registry.ts           (composes per-agent registries, asserts prefix invariants)
```

`registry.ts` exposes the same flat shape it always did — composition
is internal. Mobile sees no API break.

### 7.2 Mobile side (`services/agent-executors/`)

Today: flat `EXECUTORS` map. After: still a flat map at the top
level (so executor lookup stays O(1) by tool name), but file layout
mirrors the server:

```
services/agent-executors/
├── index.ts              (composes; asserts parity)
├── types.ts
├── chainRouter.ts
├── core/
│   └── (handlers for any core_ tools that need a mobile side; most won't)
├── wallet/
│   ├── reads.ts
│   ├── writes.ts
│   ├── simulate.ts
│   ├── points.ts
│   ├── solana.ts
│   ├── sui.ts
│   ├── solanaTakumiPay.ts
│   └── addressBook.ts
└── defi/
    └── stub.ts           (returns dummy ToolResults; logs in __DEV__ only)
```

**Migration:** rename + re-export. Existing imports still resolve
because `index.ts` keeps the composed `EXECUTORS` export. We do **not**
add a per-agent dispatcher on mobile — the server has already
sequenced the call.

### 7.3 CI guard

New `pnpm check:agents` (sibling of `pnpm check:chains`):

- Lints `services/agent-executors/` so files under `wallet/`,
  `defi/`, … export only handlers whose tool names match the
  owning agent's prefixes (loaded from a shared
  `agentManifests.json`).
- Fails if a handler outside `core/` references `agentSession`'s
  routing internals (specialists must not reach into the router).

Mirror lint on the server side.

---

## 8. Conversation & state model

### 8.1 What stays

- One `Conversation` row per chat session. ID server-issued.
- `Message` rows for user + assistant turns. Indistinguishable from
  today on mobile.

### 8.2 What's added

Two new Prisma tables in `agent-api/`:

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

### 8.3 Mobile changes

None to the persistence shape — mobile still caches `Message[]`
keyed by conversation. Optionally we can surface `originAgentId` on
assistant messages for the small "via DeFi specialist" badge (§6.4),
but this is a UI nicety, not a contract change.

---

## 9. Wallet-context isolation (CLAUDE.md rule, applied here)

The CLAUDE.md "dApp bridge isolation" and "payment JWT binding" rules
both say the same thing in different words: a tool call MUST sign
against the wallet that *initiated the intent*, not the wallet that
happens to be active on the home screen.

Multi-agent must not loosen this:

- `wallet_context` (address, namespace, chain_id, JWT) is set
  **once per turn** at Core's entry point and is forwarded
  verbatim to every specialist Core delegates to within that turn.
- Specialists may **never** re-resolve wallet context from anywhere
  else. They receive `wallet_context` as a function parameter and
  pass it through to the tool-call envelope.
- Mobile-side executors keep their existing behaviour: read
  `wallet_context` from the SSE envelope, ignore `activeWallet` /
  `activeChain` from `useWallet` for signing operations.
- For payment-intent reads the existing per-wallet JWT rule
  applies; the specialist that owns payment intents (Wallet agent
  for v1) is responsible for using the paying-wallet JWT.

Lint extension: add `wallet_context` propagation check to the
existing agent-side tests so a specialist that drops the field on
the way to a tool call fails CI.

---

## 10. Mobile changes

Scope-limited, additive, no breaking API for callers:

1. **`services/agent-executors/` reshape.** §7.2. Pure file moves +
   the new `defi/stub.ts`. No call-site changes.
2. **`AgentMode.tsx` envelope handling.** Tool envelope gains an
   optional `origin_agent_id` field. Default behaviour identical
   when absent. Add a tiny "via X" badge on the message when
   present (`MessageContent.tsx`).
3. **Conversation list filter (optional).** Long-term we may want
   filters like "show me only DeFi conversations" — out of scope
   for v1; not built.
4. **`assertRegistryParity()`** at `services/agent-executors/index.ts:129`
   extended to check prefix → owning agent matches the manifest
   shipped from the server (the manifest is a small JSON in
   `services/agent-executors/agentManifests.json`, hand-edited and
   parity-checked against the server's Agent Cards in CI).
5. **No new SSE events for v1** beyond `origin_agent_id` and the
   optional `narrative_handoff` / `narrative_handoff_end` markers.

What is **not** changing on mobile:

- `useChat`-equivalent (`createAgentSession`) is unchanged.
- MMKV persistence is unchanged.
- Tool-call rendering registry is unchanged.
- Approval flow, grant store, threshold store — unchanged.

---

## 11. `agent-api/` changes

### 11.1 New modules

```
agent-api/src/agents/
├── types.ts              # AgentCard, AgentTask, peer-message types
├── registry.ts           # loadAgentCards(); enforces invariants from §5
├── orchestrator.ts       # Core's turn handler; routes tool calls; manages tasks
├── core/
│   ├── card.ts
│   ├── handler.ts        # LLM call with Core's system prompt
│   └── prompts.ts
├── wallet/
│   ├── card.ts
│   ├── handler.ts
│   └── prompts.ts
├── defi/
│   ├── card.ts
│   ├── handler.ts        # STUB v1: returns canned responses
│   └── prompts.ts
└── tasks/
    ├── store.ts          # Prisma wrapper for AgentTask / AgentPeerMessage
    └── eventBus.ts       # in-process peer-message bus
```

### 11.2 Turn flow

```
SSE in: user message + wallet_context
  └─► orchestrator.run({ conversation_id, user_message, wallet_context })
        ├─► Core handler ←─ system prompt + Agent Card summaries
        ├─► LLM emits tool calls
        │     ├─ prefix → wallet?  → wallet handler runs in-process,
        │     │                       may emit further tool calls
        │     │                       (executed on mobile)
        │     ├─ prefix → defi?   → defi (stub) handler returns canned
        │     │                       payload; AgentTask completed
        │     └─ prefix → core?   → core handles inline
        └─► Core's final message  → SSE out to mobile
```

A specialist's tool call to mobile is just an SSE `tool_pending` event
with `origin_agent_id` set. Mobile's executor map looks it up by name
and returns the result. The orchestrator dispatches the result back to
the specialist that asked for it (keyed on `tool_call_id`).

### 11.3 LLM cost note

Each specialist that consumes the LLM is a new call. To stay within
budget, the v1 default is:

- Core: full system prompt + conversation context.
- Wallet specialist: invoked only when its tools are called; for
  pure tool dispatch (no narrative) **no separate LLM call** is
  needed — its "handler" is a thin tool router.
- DeFi specialist (stub): no LLM call at all in v1.

I.e. v1 adds an LLM call only when a specialist legitimately needs to
reason (e.g. DeFi explaining a strategy). The common case stays at
one LLM call per turn.

### 11.4 Backwards compatibility

The Agent SSE protocol from mobile's POV gains two optional fields
(`origin_agent_id`, `narrative_handoff*` frames). Old mobile clients
that ignore them keep working unchanged.

---

## 12. DeFi agent — dummy first cut

Scope of v1 DeFi agent (purely to validate topology):

- **Card** ready, status `stub`.
- **Tools registered server-side** with names and input schemas
  matching the canonical set in
  [`docs/defi-strategies-spec.md` §11](./defi-strategies-spec.md#11-agent-executor-tools):
  - `defi_list_opportunities(input)` → returns a fixed sample of 3
    opportunities.
  - `defi_list_positions(input)` → returns `{ positions: [] }`.
  - `defi_deposit(input)` → returns
    `{ status: "stubbed", message: "DeFi agent is not yet wired up." }`.
  - `defi_withdraw(input)` / `defi_rebalance(input)` — same shape.
  - The DeFi spec adds `defi_get_config`, `defi_simulate_deposit`,
    and `defi_claim` at flip time; they are NOT shipped as stubs in
    v1 (the LLM doesn't need them while DeFi is stubbed — Core's
    canned "coming soon" reply covers every code path).
- **Mobile executors** live in `services/agent-executors/defi/stub.ts`,
  return the canned `ToolResult` matching the executor type, and
  **never** issue chain RPCs.
- **No UI cards** registered yet. The agent's textual response from
  Core narrates the result.
- **User-facing error rule** (CLAUDE.md): if the stub is hit for an
  action the user expected to execute (deposit/withdraw/rebalance),
  Core paraphrases to the user with fixed friendly copy ("DeFi
  Strategies are coming soon — this action is not yet available.").
  No raw stub string surfaces to UI.

When the real DeFi backend lands per `defi-strategies-spec.md`, we
flip the card from `stub` → `ready`, drop the stub executors, and
register the real ones. **Nothing in the topology changes.**

---

## 13. Adding a new sub-agent — the checklist

This is the *durable* test of whether the design earns its keep.
Adding "Identity agent" tomorrow should be:

1. `agent-api/src/agents/identity/{card,handler,prompts}.ts` — one
   directory.
2. Add tool definitions under `agent-api/src/tools/identity/`.
3. Register card in `agents/registry.ts`.
4. Add `identity/` directory under `services/agent-executors/` with
   one file per tool group.
5. Add the new prefix to `services/agent-executors/agentManifests.json`.
6. `pnpm check:agents` + `pnpm test` pass; merge.

**No changes** required to:

- Core agent's handler or prompts (it discovers identity via the
  Agent Card registry).
- Mobile SSE handling.
- Conversation persistence.
- Tool envelope shape.

If a future PR proposing a new agent touches Core's handler, that's
a smell — push back, the seam isn't doing its job.

---

## 14. Rollout

Scope decision: **the whole agent redesign ships as one feature.**
We do not phase the redesign behind feature flags or stage it across
releases. The DeFi backend (per `defi-strategies-spec.md`) is the
*only* deferred piece — it slots into the redesigned topology later
without touching it.

### 14.1 In scope for this redesign (ships together)

| # | Workstream | Output |
|---|---|---|
| 1 | **Skeleton** | `agent-api/src/agents/{registry,orchestrator,types}.ts`; Agent Card types; prefix-routing inside the orchestrator. |
| 2 | **Server tool registry split** | Move `agent-api/src/tools/registry.ts` contents into per-agent subfolders (`core/`, `wallet/`, `defi/`). Composition in `registry.ts` stays API-compatible. |
| 3 | **Mobile executor reshape** | Move `services/agent-executors/*` into `wallet/` and `defi/` subfolders; flat `EXECUTORS` map preserved via `index.ts` composition. Parity check extended to validate prefix → agent mapping. |
| 4 | **Core agent** | Card, handler, system prompt; `core_clarify` + `core_handoff` tools. No external tool surface (§4.1 invariant). |
| 5 | **Wallet agent** | Card, handler, system prompt; all 29 existing executors registered under it. |
| 6 | **DeFi agent stub** | Card (status `stub`); server tool schemas matching `defi-strategies-spec.md` §11; mobile stub executors returning canned `ToolResult`s; Core narrates friendly "coming soon" copy. |
| 7 | **AgentTask + AgentPeerMessage persistence** | Prisma migration in `agent-api/`; orchestrator writes task lifecycle + peer-message audit. Conversation detail endpoint extended to surface task transcripts (debug-mode UI only). |
| 8 | **SSE envelope extension** | Optional `origin_agent_id` on tool envelopes; optional `narrative_handoff` / `narrative_handoff_end` frames. Mobile renders "via X specialist" badge when present. |
| 9 | **CI guards** | `pnpm check:agents` (mirroring `pnpm check:chains`): asserts prefix invariants, Core has no external tool surface, no specialist imports another specialist directly, `wallet_context` propagation through tool calls. |
| 10 | **Tests** | Vitest coverage for orchestrator routing + task lifecycle; node:test coverage for executor parity; end-to-end SSE test asserting old-shape envelopes (no `origin_agent_id`) still work for backwards compat. |

### 14.2 Deferred — real DeFi

The DeFi agent flips from `stub` → `ready` when
`defi-strategies-spec.md` is implemented. Concretely: the stub
mobile executors in `services/agent-executors/defi/stub.ts` get
replaced by real ones, the DeFi card's `status` flips, and new tool
UI cards land. **Nothing else in the topology changes** — that's the
whole point of shipping the redesign first.

### 14.3 What this redesign does *not* touch

Reassurance list — these surfaces stay byte-identical:

- `useWallet`, wallet derivation, signer caching.
- `walletKitRegistry` / `bridgeRegistry` / `chainRouter` —
  multi-chain dispatch is unchanged.
- Approval sheet, permission grant store, transfer threshold store.
- MMKV conversation cache layout; `conversationsApi.ts` contract.
- Mobile's `createAgentSession` public API; `AgentMode.tsx` keeps
  the same hook shape (only the message-render path gains the
  optional "via X" badge).
- Any of the friendly-error sanitisation surfaces (CLAUDE.md rule).

---

## 15. Open questions

1. **Conversation forking?** If a user starts in "wallet" intent and
   pivots to "DeFi" mid-conversation, do we keep one Conversation or
   spawn a child? *Current answer:* one Conversation. AgentTasks
   capture the topical seam.
2. **Cost of an explicit `core_handoff` tool.** Adding it to Core's
   tool surface costs a few tokens of system prompt and one
   tool-definition entry. Worth it for the narrative pass-through
   case; revisit if telemetry shows it's never used.
3. **Specialist-to-specialist delegation.** A2A allows it. We
   disallow in v1 (Core is the only orchestrator) to keep the graph
   simple. If a real use case appears (e.g. DeFi needs Wallet to
   fetch balances), DeFi calls a `wallet_*` tool through the same
   orchestrator — that's already the pattern.
4. **Per-agent rate limits / circuit breakers.** Deferred; the
   `agent-api/` Valkey already has primitives for this if needed.
5. **Public Agent Card hosting.** Out of scope. If/when we want
   external agents (e.g. a third-party DeFi specialist) to integrate,
   we lift the internal Agent Card to an authenticated public
   endpoint and add A2A's auth/discovery layer at that boundary.

---

## Appendix A — Worked example: "Deposit 50 USDC into Aave"

User turn:

```
"Deposit 50 USDC into Aave on Base, conservative tier."
```

Flow (post-redesign, with DeFi still a stub):

1. Mobile sends SSE: `{ user_message, wallet_context: { address, namespace: "eip155", chain_id: 8453, jwt } }`.
2. Orchestrator wakes Core. Core's LLM, seeing it has a `defi` Agent
   Card, emits a tool call `defi_deposit({ asset_symbol: "USDC",
   amount_raw: "50000000", protocol_slug: "aave-v3-base",
   chain_id: 8453, expected_tier: "conservative" })`.
3. Orchestrator inspects the prefix `defi_` → routes to DeFi handler.
   Creates `AgentTask{ owner_agent: "defi", brief: "Deposit 50 USDC
   to Aave Base, conservative" }`.
4. DeFi handler (stub) returns `{ status: "stubbed", message: "DeFi
   Strategies are coming soon." }`. Task completed.
5. Orchestrator returns the task output to Core. Core's next LLM
   step composes the user-visible message: *"DeFi Strategies aren't
   wired up yet on my end — once they are, I'll walk you through a
   conservative-tier deposit step-by-step. In the meantime I can
   help you send the 50 USDC manually — want me to draft that
   transfer?"* (Note: friendly copy, no raw stub string surfaced —
   CLAUDE.md user-facing-error rule applied to stubs as well.)
6. If the user says yes, the next turn produces a `transfer_erc20`
   tool call — prefix `transfer_` → Wallet agent → mobile executor
   → on-device sign → result back to Core → user-visible message.

When DeFi flips from `stub` → `ready` (per
[`defi-strategies-spec.md` §25](./defi-strategies-spec.md#25-multi-agent-architecture-integration)),
only step 4 changes shape (real opportunity scoring + execution
proposal + UI card). Steps 1–3, 5, 6 are identical — that's the
whole point of shipping the redesign first.
