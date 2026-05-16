# Adding a new sub-agent — the six-step checklist

> **Status:** Runbook · Owner: Agent team
> **Source spec:** [`multi-agent-architecture-spec.md`](./multi-agent-architecture-spec.md) §13.

Adding the Identity / NFT / Payments-Concierge / … agent should be
**six edits and a green build**. If your PR touches anything else
(Core's handler/prompts, SSE protocol, Prisma schema, the agent
session client), that's a smell — push back, the seam isn't doing its
job.

Working dirs:

- Server: `agent-api/`
- Mobile: `mobile-app/`

Replace `<id>` below with the new agent's id (lowercase, snake_case if
multi-word — `identity`, `nft`, `payments_concierge`).

---

## Step 1 — Add the agent's card + handler + prompts on the server

`agent-api/src/agents/<id>/card.ts`, `handler.ts`, `prompts.ts`.

Copy from `wallet/` or `defi/` as the template — handler shape is
identical, prompts file is just a `PROMPTS` map. The card must
declare:

- `id`, `version`, `display_name`, `description`
- `tool_prefixes` — a unique set (use `<id>_` for a single-prefix
  family unless you have a real reason).
- `requires_wallet_context`, `requires_jwt`
- `default_system_prompt_ref` — key into `PROMPTS`
- `status: "ready" | "stub" | "disabled"`

**Invariant enforced:** the card's prefixes must not overlap with any
existing agent's. `assertRegistryInvariants` throws on duplicate
prefixes at boot.

---

## Step 2 — Add tool definitions under `tools/<id>/`

`agent-api/src/tools/<id>/<group>.ts` per logical grouping; each file
ends with:

```ts
export const <ID>_<GROUP>_TOOLS = composeAgentTools('<id>', { … })
```

`composeAgentTools` reads the shared manifest and throws on
misplacement — the lint can't help if you skip it. Compose all groups
into `tools/<id>/index.ts` and spread that into `tools/registry.ts`.

**Invariant enforced:** every tool name must match the agent's
manifest prefixes. The `pnpm check:agents` lint greps each file in
`tools/<id>/` for `composeAgentTools` and fails if missing.

---

## Step 3 — Register the card in `agents/loadAgentCards.ts`

Append a `registerAgent(<id>Card)` call so it loads after the existing
three. Insertion order is the user-visible debug order
(Core → Wallet → DeFi → `<id>`).

**Invariant enforced:** boot fails if the card isn't registered before
`assertRegistryInvariants(Object.keys(TOOL_REGISTRY))` runs.

---

## Step 4 — Mirror on mobile under `services/agent-executors/<id>/`

`services/agent-executors/<id>/<group>.ts` per logical grouping; each
file exports a `Record<string, MobileToolExecutor>`. The top-level
`services/agent-executors/index.ts` adds:

```ts
const <ID>_EXECUTORS = composeAgentExecutors('<id>', { ...<ID>_GROUP_EXECUTORS, … })

export const EXECUTORS = { ..., ...<ID>_EXECUTORS }
```

Add the new tool names to `EXPECTED_MOBILE_TOOLS` so the boot parity
check covers them.

**Invariant enforced:** `composeAgentExecutors` throws at module load
if any executor name falls outside the agent's manifest prefixes;
`assertRegistryParity()` throws at boot if a recorded `(toolName →
agentId)` doesn't match `resolveAgentForTool`.

---

## Step 5 — Update the manifest and sync

Edit `agent-api/src/agents/manifests/agentManifests.json`:

```json
{ "id": "<id>", "display_name": "<display name>", "tool_prefixes": ["<id>_"], "status": "ready" }
```

Then:

```bash
pnpm --filter takumi-agent-api manifests:sync
```

The mobile mirror is overwritten automatically. Commit both files.

**Invariant enforced:** `pnpm check:agents` diffs the two JSON files
byte-for-byte; drift fails CI.

---

## Step 6 — Run the gates

```bash
# Mobile
pnpm check:syntax
pnpm check:chains
pnpm check:agents
pnpm test

# Server
cd ../agent-api
pnpm test
```

If all six are green, ship it.

---

## What you must NOT touch

If your PR for a new agent edits any of these files, stop and reread
§13:

- `agent-api/src/agents/core/handler.ts` or `prompts.ts`
- `agent-api/src/agents/orchestrator.ts`
- `agent-api/src/session/types.ts` or `chat.events.ts` (the SSE wire
  format)
- `agent-api/prisma/schema.prisma`
- `mobile-app/services/agentSession/*` (the SSE parser / dispatcher)
- `mobile-app/components/home/TakumiAgent/AgentMode.tsx`

None of these should need a change for an additional specialist —
Core discovers the new agent through the registry, mobile renders
specialist results identically, and persistence already supports any
`ownerAgent` string.

---

## See also

- [`multi-agent-architecture-spec.md`](./multi-agent-architecture-spec.md) §13.
- [`multi-agent-design-notes.md`](./multi-agent-design-notes.md) — the two invariants every contributor must know.
