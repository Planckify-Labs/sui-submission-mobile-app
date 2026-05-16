# Task 03 — `agents/registry.ts` — `loadAgentCards()` + boot invariants

**Status:** Not taken
**Owner:** Server (agent-api)
**Spec reference:** `multi-agent-architecture-spec.md` §5, §4.1, §7.3.

## Why this matters

The registry is the single place every other server module asks "which
agent owns this tool?". Boot-time invariants from §5 catch the
silent-failure cases that would otherwise route a tool call into a
nonexistent specialist or a Core that secretly owns external tools.
This task lands the skeleton — handlers and tools register against it
later.

## Scope

- `agent-api/src/agents/registry.ts`:
  - Internal `Map<AgentId, AgentCard>` keyed by `card.id`.
  - `registerAgent(card: AgentCard): void` — throws on duplicate `id` or
    on a `tool_prefix` already owned by another card.
  - `getAgentForTool(toolName: string): AgentCard | undefined` —
    longest-prefix-wins lookup. Prefix ending in `_` matches as a
    family; a non-`_` entry matches as a full tool name.
  - `getAgentCard(id: AgentId): AgentCard | undefined`.
  - `listAgents(): AgentCard[]` — insertion-ordered.
  - `assertRegistryInvariants(serverToolNames: string[]): void` — the
    boot self-check. Throws with a clear, fail-loud error on any
    violation:
    1. **No two agents share a `tool_prefix`** (per §5).
    2. **Every `tool_prefix` matches at least one server tool**
       (no dead prefixes).
    3. **The union of all `tool_prefixes` covers the server tool
       registry** — no orphan tools (per §5).
    4. **Core's prefixes are exactly `["core_"]`** (the §4.1
       invariant). Throw if Core declares any other prefix.
- `agent-api/src/agents/loadAgentCards.ts`:
  - Reads `manifests/agentManifests.json`.
  - Cross-references it with the static card files (`core/card.ts`,
    `wallet/card.ts`, `defi/card.ts` — placeholders for now; the cards
    themselves land in Tasks 10–12).
  - Returns a frozen `AgentCard[]` ordered Core → Wallet → DeFi → …
- Wire `assertRegistryInvariants` into `agent-api`'s bootstrap so the
  process **refuses to start** on violation. Log message format:
  `"[agents/registry] Invariant violation: <reason>"` — no raw
  payloads, no card JSON dumped into prod logs.

## Rules (non-negotiable)

- **Fail loud at boot.** Invariant violations `throw` — they never
  `console.warn`. A misconfigured registry must not produce a running
  server.
- **§4.1 Core invariant is checked here, not just in CI.** The lint
  catches it pre-merge; this check catches it post-merge when someone
  hot-edits a card. Both layers run.
- **Longest-prefix-wins.** `read_contract` (exact match) wins over a
  hypothetical `read_` family. Document this in a comment on
  `getAgentForTool` so future-you doesn't change the matching order.
- **Insertion order matters.** `listAgents()` returns Core → Wallet →
  DeFi so any admin/debug UI shows agents in their hierarchical order.
- **No I/O at module load.** `loadAgentCards()` is an explicit call
  that the bootstrap module invokes; the registry module itself is
  pure data.
- **CLAUDE.md user-facing-error rule:** invariant-violation messages
  go to logs only. The orchestrator's user-visible reply on a
  misconfigured boot is "Something went wrong on our end." — never the
  raw violation message.

## Acceptance

- [ ] `registry.ts`, `loadAgentCards.ts` exist with the API above.
- [ ] Unit test (vitest) — happy path: three cards register, lookups
      return the right `AgentCard`, `assertRegistryInvariants` returns
      cleanly when the manifest matches the (mock) server tool list.
- [ ] Unit test — each invariant: duplicate prefix throws, orphan tool
      throws, Core-declares-non-core-prefix throws, dead prefix throws.
- [ ] Server bootstrap calls `assertRegistryInvariants` before listening
      on the port (verified by introducing a deliberate violation
      locally — process exits non-zero).
- [ ] `pnpm --filter agent-api run check:syntax` passes.

## Out of scope

- The Core / Wallet / DeFi `card.ts` files themselves — Tasks 10–12.
- The mobile-side parity extension — Task 09.
- `pnpm check:agents` CI guard — Task 18.
