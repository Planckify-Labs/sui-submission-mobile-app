# Task 04 — Move existing tools into `agent-api/src/tools/wallet/`

**Status:** Not taken
**Owner:** Server (agent-api)
**Spec reference:** `multi-agent-architecture-spec.md` §7.1, §11.2.

## Why this matters

Today `agent-api/src/tools/registry.ts` exposes a flat tool registry.
Every existing tool is conceptually wallet-owned (the 29 mobile
executors all map to wallet capabilities per §5). The redesign keeps
the *flat shape* the orchestrator consumes but reorganises the *source*
into per-agent subfolders so Tasks 05 (core) and 06 (defi) can land
without producing one giant `tools/` directory.

## Scope

- Create `agent-api/src/tools/wallet/` and move existing tool
  definitions into the following subfiles (mirror the mobile layout in
  Task 07):
  - `reads.ts` — balance reads, contract reads, gas estimation.
  - `writes.ts` — transfers, approvals, write_contract.
  - `points.ts` — points-related tools.
  - `solana.ts` — Solana-specific tool definitions.
  - `sui.ts` — Sui-specific tool definitions.
  - `addressBook.ts` — address-book tools.
- Update `agent-api/src/tools/registry.ts` to **compose** the per-agent
  registries. Public export shape is unchanged — orchestrator + LLM
  prompt assembly still see one flat map keyed by tool name.
- Where current tool files mix concerns, move each tool to the file
  that matches its prefix per §5. Do not rename tools in this task; a
  rename would require updating the mobile executor map.
- Add an internal helper `composeAgentTools(agentId, tools)` (in
  `tools/internal/compose.ts`) that:
  - Validates that every tool name starts with one of the agent's
    `tool_prefixes` (read from `agentManifests.json`).
  - Throws with a clear error if it does not.
- Wire the wallet folder through `composeAgentTools("wallet", …)` in
  `registry.ts` so misplacement is caught locally before Task 18's
  global CI lint.

## Rules (non-negotiable)

- **No tool renames.** This task is a pure relocation. Renaming has a
  cross-cutting cost (mobile executor map, agent-side LLM prompts,
  conversation history). Defer to a follow-up if a rename is genuinely
  needed.
- **No behaviour change.** The flat registry the orchestrator consumes
  is byte-equivalent to today's. Snapshot the export keys before and
  after — they must match exactly.
- **Schema parity preserved.** Zod / JSON-Schema shapes for every tool
  stay identical. Editing a tool's schema in this task is a smell.
- **Composition validates prefixes locally.** `composeAgentTools` is
  the first line of defence; the boot invariant (Task 03) is the
  second; CI (Task 18) is the third. All three layers run.
- **Imports go through the barrel only.** Other modules import from
  `agent-api/src/tools` (the barrel) — never reach into
  `tools/wallet/*` directly.

## Acceptance

- [ ] All existing tools live under `agent-api/src/tools/wallet/`,
      organised by subfile per the scope list.
- [ ] `agent-api/src/tools/registry.ts` exports the same flat map (key
      set unchanged — verified by a one-off diff captured in the PR
      description).
- [ ] `composeAgentTools` throws if a misplaced tool is passed in
      (covered by a vitest).
- [ ] Existing `agent-api` integration tests pass without modification.
- [ ] `pnpm --filter agent-api run check:syntax` passes.

## Out of scope

- Core tool definitions (`clarify`, `handoff`) — Task 05.
- DeFi stub tool schemas — Task 06.
- Tool renames or schema changes — out of scope for the redesign
  entirely.
