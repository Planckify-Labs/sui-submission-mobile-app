# Task 07 — Move `services/agent-executors/*` into `wallet/`

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** `multi-agent-architecture-spec.md` §7.2, §10.1, §10.4.

## Why this matters

Mobile's `EXECUTORS` map is the surface every tool call lands on. The
spec keeps it flat at the top level (O(1) lookup, no per-agent
dispatcher on mobile — §7.2) but reshapes the file layout to mirror
the server's per-agent folders. Doing this *before* the DeFi stub
executor (Task 08) means there's a sane parent folder to put it in.

## Scope

- Create `services/agent-executors/wallet/` and relocate each existing
  executor file by capability:
  - `reads.ts` — balance / contract reads / gas estimation executors.
  - `writes.ts` — transfer / approval / write_contract executors.
  - `simulate.ts` — any simulate_* executors.
  - `points.ts` — points executors.
  - `solana.ts` — Solana-specific executors.
  - `sui.ts` — Sui-specific executors.
  - `solanaTakumiPay.ts` — Solana TakumiPay flow executors (keep
    as its own file per the current shape).
  - `addressBook.ts` — address-book executors.
- `services/agent-executors/index.ts`:
  - Continue exporting one flat `EXECUTORS` map composed from the
    per-agent buckets — call-sites do not change. Lookup remains O(1).
  - Add an internal helper `composeAgentExecutors(agentId, executors)`
    that validates each executor's tool name against the agent's
    `tool_prefixes` from the synced `agentManifests.json`. Throws
    locally on mismatch (mirror of the server `composeAgentTools` from
    Task 04).
- Keep `services/agent-executors/types.ts` and `chainRouter.ts` at the
  package root — they are shared infrastructure, not agent-specific.
- Update the `assertRegistryParity()` site in
  `services/agent-executors/index.ts:129` so it still runs after the
  composition step (the prefix→agent check itself lands in Task 09).

## Rules (non-negotiable)

- **No call-site changes.** Imports of `EXECUTORS` from
  `services/agent-executors` keep resolving exactly as today. If any
  outside file imports a sub-path (e.g. `agent-executors/transfer.ts`),
  preserve the deep path with a re-export shim — or move the import in
  the same PR, never silently. Grep first.
- **Flat at the top, organised below.** The orchestrator has already
  sequenced the call by the time the mobile executor map is read — we
  do **not** add a per-agent dispatcher on mobile (§7.2). One map, one
  lookup.
- **Pure relocation.** No executor renames, no behaviour change, no
  schema edits. If a tool currently emits a `tool_pending` envelope
  with a given shape, it still emits that exact shape post-move.
- **`composeAgentExecutors` reads the synced manifest.** The mobile
  side does not edit `agentManifests.json` (Task 02 owns sync). If a
  manifest entry is missing for a prefix the composer needs, fail loud
  in DEV and surface a friendly fallback in prod (CLAUDE.md user-
  facing-error rule — never leak the executor-side mismatch string).

## Acceptance

- [ ] All existing executors live under
      `services/agent-executors/wallet/<file>.ts`.
- [ ] `services/agent-executors/index.ts` composes the buckets into one
      flat `EXECUTORS` map; key set unchanged (diff captured in PR
      description).
- [ ] `composeAgentExecutors` throws when fed a misplaced executor
      (covered by a node:test).
- [ ] `pnpm check:syntax` passes; `pnpm test` passes.
- [ ] `pnpm check:chains` still passes (multi-chain dispatch is
      unchanged — only file paths moved).

## Out of scope

- The DeFi stub executor — Task 08.
- Extending `assertRegistryParity()` with prefix→agent validation —
  Task 09.
- Any change to `services/agentSession/` — the SSE transport is
  unchanged at this stage.
