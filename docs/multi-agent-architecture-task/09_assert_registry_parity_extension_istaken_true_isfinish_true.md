# Task 09 — Extend `assertRegistryParity()` with prefix → owning-agent check

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** `multi-agent-architecture-spec.md` §5, §7.3, §10.4.

## Why this matters

Today `assertRegistryParity()` at `services/agent-executors/index.ts:129`
checks that every server tool *name* has a mobile executor. After this
redesign there's a second invariant: every mobile executor must live
under the directory of its owning agent. The CI guard in Task 18 owns
the cross-repo lint; this task owns the **runtime** check that catches
local mistakes before app boot.

## Scope

- Extend `assertRegistryParity()` (or add a sibling
  `assertAgentPrefixParity()` called from the same boot site):
  - Load `services/agent-executors/agentManifests.json` (synced in
    Task 02).
  - For every entry in the flat `EXECUTORS` map, resolve the executor's
    *source file path* (via a small registry-side marker — each
    `composeAgentExecutors` call records the `agentId` next to its
    executors).
  - Assert: `resolveAgentForTool(toolName, manifest) === recordedAgentId`.
  - Throw a loud `"[agent-executors] prefix mismatch: tool X recorded
    under wallet/, manifest assigns it to defi"` on violation. No raw
    payloads in the message — just the tool name and the two agent
    ids (CLAUDE.md user-facing-error rule keeps this in logs only).
- Hook the new check into the existing boot path so it runs alongside
  the name-parity check.
- Add a node:test under
  `services/agent-executors/assertRegistryParity.test.ts` covering:
  - Happy path: a wallet tool recorded under wallet/ + a defi tool
    recorded under defi/ — passes.
  - Sad path: a wallet tool deliberately registered under defi/ —
    throws with the expected message.
- The manifest helper `resolveAgentForTool(toolName, manifest)` should
  also live in this task as a tiny module (`services/agent-executors/
  agentManifest.ts`) so Task 18's CI lint can import the same logic.

## Rules (non-negotiable)

- **Fail loud at boot.** Like the existing parity check, this is a
  `throw` — it never `console.warn`. A drifted registry must surface
  in DEV immediately.
- **Manifest is authoritative.** If the manifest says `defi_*` belongs
  to DeFi, an executor for `defi_foo` registered under `wallet/` is
  the bug, not the manifest entry. Do not "auto-correct" by remapping.
- **Longest-prefix-wins matches the server.** Mirror Task 03's lookup
  order — `read_contract` (exact) wins over a `read_` family.
- **No production exposure of mismatch strings.** Friendly fallback
  ("Something went wrong on our end.") only — never `String(err)` into
  an Alert (CLAUDE.md user-facing-error rule). If a parity throw
  reaches a user, the catch site at boot sanitises it.
- **`resolveAgentForTool` is pure.** No I/O at module load; it reads
  the manifest passed in by the caller.

## Acceptance

- [ ] `assertRegistryParity()` (or sibling) now enforces
      prefix→owning-agent in addition to name parity.
- [ ] `agentManifest.ts` exports `resolveAgentForTool`.
- [ ] node:test covers happy + sad paths; both fit the existing
      `_test-resolver.mjs` harness (CLAUDE.md note).
- [ ] Boot of the dev app does not throw on the current wallet + defi
      composition.
- [ ] `pnpm test` passes; `pnpm check:syntax` passes.

## Out of scope

- The cross-repo `pnpm check:agents` script — Task 18.
- `wallet_context` propagation lint — also Task 18.
- Any change to `services/agentSession/` — SSE transport unchanged.
