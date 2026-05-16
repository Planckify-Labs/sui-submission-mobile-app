# Multi-Agent Architecture — Task Backlog

This folder contains engineering tasks derived from
`../multi-agent-architecture-spec.md`. Each file represents one discrete
unit of work from the spec's §14 rollout plan plus the supporting
type / persistence / CI surfaces called out across §5–§11.

## Filename convention

```
{NN}_{task_name}_istaken_{true|false}[_isfinish_true].md
```

- `NN` — two-digit sequential task number
- `task_name` — short snake_case label
- `istaken_true` / `istaken_false` — whether an engineer is actively working on it
- `_isfinish_true` — appended as a **postfix** once the task is complete.
  A file without this postfix is not yet finished.

Three possible states:

| State | Filename pattern |
|---|---|
| Not started | `01_agent_card_types_istaken_false.md` |
| In progress | `01_agent_card_types_istaken_true.md` |
| Finished    | `01_agent_card_types_istaken_true_isfinish_true.md` |

## Workflow

1. Browse the tasks, pick one that ends with `istaken_false.md`.
2. Claim it by renaming `istaken_false` → `istaken_true`:
   ```
   git mv 01_agent_card_types_istaken_false.md 01_agent_card_types_istaken_true.md
   ```
3. Work on the task. Read the referenced sections of
   `../multi-agent-architecture-spec.md` — each task file excerpts only the
   minimum context needed.
4. When the task is complete and merged, append the `_isfinish_true`
   postfix — do NOT flip `istaken` back to `false`:
   ```
   git mv 01_agent_card_types_istaken_true.md 01_agent_card_types_istaken_true_isfinish_true.md
   ```
   Finished files stay in the folder as a durable record of what shipped.
5. If you abandon a task mid-flight, rename it back to `istaken_false.md`
   (without the `isfinish_true` postfix) so someone else can pick it up.

## Phase ordering

Tasks are numbered by the phase they belong to in the spec. **Do not start
a later phase before the previous phase's exit criteria are green.** The
spec ships the whole redesign as one feature (§14) — phasing only exists
to keep the diff reviewable, not to gate behind feature flags.

- **Phase 1** (tasks 01–03) — type scaffolding, agent manifests, registry
  skeleton. No behavior change.
- **Phase 2** (tasks 04–06) — server tool-registry split into per-agent
  subfolders. API-compatible (§7.1).
- **Phase 3** (tasks 07–09) — mobile executor reshape. Flat `EXECUTORS`
  map preserved via composition (§7.2, §10.4).
- **Phase 4** (tasks 10–12) — agent handlers: Core, Wallet, DeFi (stub).
- **Phase 5** (task 13) — orchestrator (prefix routing, task lifecycle,
  `wallet_context` propagation, narrative pass-through).
- **Phase 6** (tasks 14–15) — `AgentTask` + `AgentPeerMessage` persistence
  and the conversation-detail debug surface (§8, §14.1 row 7).
- **Phase 7** (tasks 16–17) — SSE envelope extension (`origin_agent_id`,
  narrative-handoff frames) and the mobile "via X specialist" badge.
- **Phase 8** (task 18) — `pnpm check:agents` CI guard.
- **Phase 9** (tasks 19–20) — Vitest orchestrator coverage and the
  end-to-end SSE backwards-compatibility test.
- **Phase 10** (task 21) — durable design notes (§4.1 + §9 invariants)
  and the §13 add-a-new-agent runbook. Can run in parallel once
  Phases 1–8 land.

The DeFi backend (per `../defi-strategies-spec.md`) is the **only**
deferred piece — it slots into the redesigned topology later without
touching it (§14.2).

## Task map

### Phase 1 — Foundations: types, manifests, registry

| # | File | Title |
|---|---|---|
| 01 | `01_agent_card_types_istaken_false.md` | `agent-api/src/agents/types.ts` — `AgentCard`, `AgentId`, `AgentTask`, peer-message types |
| 02 | `02_agent_manifests_shared_json_istaken_false.md` | Shared `agentManifests.json` (server-authoritative + mobile mirror) |
| 03 | `03_agent_registry_boot_invariants_istaken_false.md` | `agents/registry.ts` — `loadAgentCards()` + boot-time invariants |

### Phase 2 — Server tool registry split

| # | File | Title |
|---|---|---|
| 04 | `04_tools_wallet_subfolder_move_istaken_false.md` | Move existing tools into `agent-api/src/tools/wallet/` subfolders |
| 05 | `05_tools_core_clarify_handoff_istaken_false.md` | `agent-api/src/tools/core/{clarify,handoff}.ts` — orchestration affordances |
| 06 | `06_tools_defi_stub_schemas_istaken_false.md` | `agent-api/src/tools/defi/*.ts` — stub schemas matching `defi-strategies-spec.md` §11 |

### Phase 3 — Mobile executor reshape

| # | File | Title |
|---|---|---|
| 07 | `07_executors_wallet_subfolder_move_istaken_false.md` | Move `services/agent-executors/*` into `wallet/`; preserve flat `EXECUTORS` via composition |
| 08 | `08_executors_defi_stub_istaken_false.md` | `services/agent-executors/defi/stub.ts` — canned `ToolResult`s, no chain RPCs |
| 09 | `09_assert_registry_parity_extension_istaken_false.md` | Extend `assertRegistryParity()` to validate prefix → owning agent |

### Phase 4 — Agent handlers

| # | File | Title |
|---|---|---|
| 10 | `10_core_agent_handler_istaken_false.md` | Core agent — card, handler, prompts; §4.1 no-external-tools invariant |
| 11 | `11_wallet_agent_handler_istaken_false.md` | Wallet agent — card, handler, prompts; thin tool-router for pure dispatch |
| 12 | `12_defi_agent_stub_handler_istaken_false.md` | DeFi agent stub — card status `stub`, canned handler, friendly Core copy |

### Phase 5 — Orchestrator

| # | File | Title |
|---|---|---|
| 13 | `13_orchestrator_routing_and_tasks_istaken_false.md` | Orchestrator — prefix routing, `AgentTask` lifecycle, `wallet_context` propagation, narrative pass-through |

### Phase 6 — Persistence

| # | File | Title |
|---|---|---|
| 14 | `14_prisma_agent_task_migration_istaken_false.md` | Prisma migration — `AgentTask` + `AgentPeerMessage` models |
| 15 | `15_tasks_store_event_bus_and_debug_endpoint_istaken_false.md` | `agents/tasks/{store,eventBus}.ts` + conversation-detail task transcripts (debug-only) |

### Phase 7 — SSE envelope + mobile rendering

| # | File | Title |
|---|---|---|
| 16 | `16_sse_envelope_origin_agent_id_istaken_false.md` | Server SSE envelope — optional `origin_agent_id` + `narrative_handoff*` frames |
| 17 | `17_mobile_via_specialist_badge_istaken_false.md` | `AgentMode.tsx` envelope parse + `MessageContent.tsx` "via X specialist" badge |

### Phase 8 — CI guards

| # | File | Title |
|---|---|---|
| 18 | `18_check_agents_ci_guard_istaken_false.md` | `pnpm check:agents` — prefix invariants, Core has no external tool surface, `wallet_context` propagation |

### Phase 9 — Tests

| # | File | Title |
|---|---|---|
| 19 | `19_orchestrator_vitest_coverage_istaken_false.md` | Vitest — orchestrator routing + `AgentTask` lifecycle |
| 20 | `20_sse_backwards_compat_e2e_istaken_false.md` | End-to-end SSE backwards-compat test — old-shape envelopes still work |

### Phase 10 — Design notes and onboarding runbook

| # | File | Title |
|---|---|---|
| 21 | `21_design_notes_and_onboarding_runbook_istaken_false.md` | `docs/multi-agent-design-notes.md` (§4.1 + §9 invariants) + `docs/agent-onboarding-runbook.md` (§13 six-step checklist) |

## Source of truth

`../multi-agent-architecture-spec.md` is the canonical spec. These task
files are a projection of it — if anything here disagrees with the spec,
the spec wins. Update the spec first, then update the task.

The DeFi tool surface cross-references `../defi-strategies-spec.md` §11.
The CLAUDE.md rules on **dApp bridge isolation**, **payment JWT binding**,
and **user-facing errors** apply throughout — call them out explicitly in
any task that touches signing, intent reads, or error surfacing.
