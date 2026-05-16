# Multi-agent design notes

> **Status:** Implementation reference · Owner: Agent team
> **Source spec:** [`multi-agent-architecture-spec.md`](./multi-agent-architecture-spec.md)

These notes capture the two load-bearing invariants of the multi-agent
redesign. They are deliberately short — the spec covers *why*; this
file covers *what every contributor must know* and where each
invariant is enforced.

If you only have five minutes before touching agent code, read this.

---

## 1. §4.1 — Core has no external tool surface

### Purpose

Core is the only agent the user talks to. Routing intent and
summarising results back is its entire job. Any capability Core
"owns" creates a mesh in what should be a tree:

```
        Core (router)
       /   |    \
  Wallet  DeFi  …future
```

If Core ever picks up a chain read or a balance fetch, the seam between
"orchestrator" and "specialist" stops doing its job. The "add a new
agent" checklist (§13) would grow Core's surface every time. We
explicitly chose not to.

### Forbidden

The following all violate §4.1:

- Core's `AgentCard.tool_prefixes` containing any string other than
  `core_`.
- A tool under `agent-api/src/tools/core/` emitting a `tool_pending`
  envelope to mobile.
- Anything under `agent-api/src/tools/core/` or `agent-api/src/agents/core/`
  importing from `services/walletKit`, `services/chains`,
  `services/defi`, or any other external-capability module.
- Core's handler (`agent-api/src/agents/core/handler.ts`) importing
  specialist handlers directly. Core reaches specialists only through
  the orchestrator's registry lookup (`getAgentForTool` /
  `dispatch()`).

### Enforced by

| Layer | Mechanism |
|---|---|
| Boot | `assertRegistryInvariants(serverToolNames)` in `agent-api/src/agents/registry.ts` rejects any Core card whose prefixes ≠ `["core_"]` and any orphan/dead prefix. The server refuses to start on violation. |
| CI | `pnpm check:agents` (`mobile-app/scripts/check-agents.sh`) greps for the forbidden imports + `tool_pending` emissions under `tools/core/` / `agents/core/`. |
| Tests | `agents/registry.spec.ts` covers the Core invariant case. |

---

## 2. §9 — `wallet_context` isolation

### Purpose

This is the agent-seam projection of the CLAUDE.md "dApp bridge
isolation" and "payment JWT binding" rules: a tool call MUST sign
against the wallet that *initiated the intent*, not the wallet that
happens to be active on the home screen.

In a single-agent world, the rule lived at the executor boundary
(`hooks/useWallet.ts` vs `intent.wallet`). In a multi-agent world the
rule has to survive every Core ↔ specialist hop. The orchestrator
pins `wallet_context` once at turn entry and forwards it verbatim into
every specialist handler in that turn.

### Forbidden

- A specialist re-resolving wallet context from `useWallet` / `useActiveChain`
  / any other ambient source.
- The orchestrator editing `wallet_context` mid-turn (the input object
  is frozen for the duration of the turn).
- A specialist's `tool_pending` envelope omitting `wallet_context` (or
  carrying a different address / chain_id than the orchestrator pinned).
- Mobile executors reading `activeWallet` / `activeChain` from
  `useWallet` for signing operations — they must use the
  `wallet_context` carried on the tool envelope.

### Enforced by

| Layer | Mechanism |
|---|---|
| Runtime | The orchestrator (`agent-api/src/agents/orchestrator.ts`) freezes `wallet_context` at entry, threads it into every specialist handler call, and includes it on every `tool_pending` SSE frame. |
| Type | `services/agentSession/protocol.ts` types `ToolPendingPayload` so a redesign that drops `wallet_context` fails type-check. |
| CI | `pnpm check:agents` greps the orchestrator for `wallet_context: WalletContext` and fails if the propagation site is removed. |

---

## 3. Borrowed primitives from A2A — what's in scope

The redesign borrows three A2A semantics: Agent Card, AgentTask, and
peer messages. Everything else (push notifications, agent
authentication, public Agent Card hosting, federation, multi-org
discovery) is **out of scope** until a real third-party-agent use case
appears.

If you find yourself reaching for an A2A feature not in that
three-item list, push back. The spec §1 explicitly trims the
A2A surface to what we need.

---

## 4. When to update this file

This document is a **landing page**, not a changelog. Edit it when:

- A new invariant is added (cross-link the spec section).
- The enforcement layer changes (e.g. CI moves from grep to AST).
- A future agent makes one of the two existing invariants more or less
  load-bearing.

Do **not** edit it for routine implementation changes — those belong
in commit messages and the spec.

---

## See also

- [`multi-agent-architecture-spec.md`](./multi-agent-architecture-spec.md) — the canonical spec.
- [`agent-onboarding-runbook.md`](./agent-onboarding-runbook.md) — six-step checklist for adding a new specialist.
- [`CLAUDE.md`](../CLAUDE.md) — the dApp bridge isolation + payment JWT binding rules these invariants project from.
