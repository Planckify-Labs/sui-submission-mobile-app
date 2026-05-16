# Task 02 — Shared `agentManifests.json` (server-authoritative + mobile mirror)

**Status:** Not taken
**Owner:** Server (agent-api) + Mobile (mobile-app)
**Spec reference:** `multi-agent-architecture-spec.md` §5, §7.3, §10.4.

## Why this matters

Prefix-based routing (§6.1) only works if server and mobile agree on
*which prefix belongs to which agent*. Today there's no manifest —
mobile's `assertRegistryParity()` only checks that tool *names* match.
The spec promises a shared JSON manifest so `pnpm check:agents` (Task
18) can lint both sides against one source of truth and the
extend-`assertRegistryParity` check (Task 09) has something to read.

## Scope

- `agent-api/src/agents/manifests/agentManifests.json` —
  server-authoritative. Initial content (versioned per §5 invariants):
  ```json
  {
    "version": 1,
    "agents": [
      { "id": "core",   "tool_prefixes": ["core_"],                                                                                                                                                                       "status": "ready" },
      { "id": "wallet", "tool_prefixes": ["get_", "send_", "transfer_", "approve_", "read_contract", "estimate_gas", "write_contract", "points_", "address_book_"], "status": "ready" },
      { "id": "defi",   "tool_prefixes": ["defi_"],                                                                                                                                                                       "status": "stub" }
    ]
  }
  ```
  - Format note: keep one agent per line, ordered Core → Wallet → DeFi
    (matches §5 reading order). New agents append at the bottom.
- `services/agent-executors/agentManifests.json` (mobile mirror).
  Byte-identical to the server file — checked by Task 18's CI script.
- Add a tiny script `agent-api/scripts/sync-agent-manifests.mjs` that:
  1. Reads the server manifest.
  2. Writes it to `../mobile-app/services/agent-executors/agentManifests.json`
     (relative path matching the workspace layout).
  3. Errors if the destination file is missing — sync, do not create.
  Wire it into the `agent-api` `package.json` as `manifests:sync` and
  call it from the existing `prebuild` / `predev` hook so the mirror
  cannot go stale locally.
- README note inside `services/agent-executors/agentManifests.json`'s
  sibling `README.md` (or `agent-executors/README.md` if you prefer):
  one line, "Generated from `agent-api/src/agents/manifests/agentManifests.json`
  — edit there, sync with `pnpm manifests:sync`."

## Rules (non-negotiable)

- **Server is the source of truth.** Mobile never edits its mirror by
  hand. The sync script is the only allowed writer.
- **No two agents share a `tool_prefix`.** Enforced at boot (Task 03)
  and in CI (Task 18). Lint reads this JSON.
- **`tool_prefixes` strings end with `_` when they denote a prefix
  family** (e.g. `"defi_"`) and **do not end with `_` when they denote a
  full tool name** (e.g. `"estimate_gas"`, `"read_contract"`). Match
  exactly what the §5 table lists — do not "normalise" these.
- **`status: "stub"` is a load-bearing signal.** DeFi being `stub` is
  how Core narrates "coming soon" copy (§12). Don't flip it to `"ready"`
  until Task 12's stub handler is replaced with the real DeFi backend.
- **No secrets in the manifest.** It ships to mobile binaries — never
  embed API keys, JWTs, or RPC URLs here.

## Acceptance

- [ ] Both JSON files exist and are byte-identical (`diff` returns 0).
- [ ] `pnpm manifests:sync` is idempotent.
- [ ] Manifest JSON is valid (`node -e "JSON.parse(require('fs').readFileSync(…))"`).
- [ ] `prebuild` / `predev` hook calls `manifests:sync`.
- [ ] No production runtime depends on the mobile JSON yet (consumers
      land in Tasks 03 + 09 + 18).

## Out of scope

- The boot invariant checker that consumes this manifest — Task 03.
- The mobile parity extension — Task 09.
- The CI lint that diffs both files — Task 18.
