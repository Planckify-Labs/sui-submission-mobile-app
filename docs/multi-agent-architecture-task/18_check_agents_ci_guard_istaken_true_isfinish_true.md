# Task 18 — `pnpm check:agents` CI guard

**Status:** Not taken
**Owner:** Mobile (mobile-app) + Server (agent-api)
**Spec reference:** `multi-agent-architecture-spec.md` §4.1, §5, §7.3, §9.

## Why this matters

`pnpm check:chains` (existing) prevents shared mobile code from
branching on chain namespace — that pattern is what makes the
multi-chain registry trustable. The redesign needs the same kind of
guard for **agent prefixes and Core's tool surface**. Without this
script, the §4.1 invariant ("Core owns no external tools, ever") will
quietly erode through `git blame` lottery.

## Scope

- `scripts/check-agents.sh` (sibling of
  `scripts/check-chain-agnostic.sh`). Pure-text lint, no TS compile —
  matches the existing `check:chains` style.
- Add `"check:agents"` to root `package.json` so `pnpm check:agents`
  runs it; wire it into the existing pre-merge CI alongside
  `check:chains`.
- Checks the script enforces:
  1. **Manifest parity** — `agent-api/src/agents/manifests/agentManifests.json`
     equals `services/agent-executors/agentManifests.json`
     byte-for-byte. If not, fail with
     "[check:agents] manifest mirror is stale — run `pnpm manifests:sync`".
  2. **Core has no external tool surface** (§4.1):
     - Any file under `agent-api/src/tools/core/` that calls
       `emitToolPending(...)` (or whatever the SSE helper is named in
       the codebase — read the orchestrator) → fail.
     - Any file under `agent-api/src/tools/core/` or
       `agent-api/src/agents/core/` that imports from
       `services/walletKit/`, `services/chains/`, `services/defi/`,
       or any other capability module → fail.
     - Core's Agent Card declares `tool_prefixes` other than
       `["core_"]` → fail.
  3. **Specialist isolation** (§4.1 third bullet):
     - `agent-api/src/agents/core/handler.ts` imports any specialist
       handler directly (i.e. not via
       `agents/registry.ts` / `agents/tools/dispatch.ts`) → fail.
     - Any specialist handler imports another specialist handler
       directly → fail.
  4. **Prefix → owning agent** (§7.3): every executor file under
     `services/agent-executors/<agentDir>/` exports executors whose
     tool names match `agentDir`'s `tool_prefixes` from the synced
     manifest. Mirror lint on the server side for
     `agent-api/src/tools/<agentDir>/`.
  5. **`wallet_context` propagation** (§9): grep for any specialist
     handler emitting `tool_pending` whose payload does not include
     `wallet_context`. Allow-list inline with a reason comment is
     fine; a silent omission fails.
- Add an allow-list at the top of the script (like the existing
  `check-chain-agnostic.sh`) with `# Reason: …` comments for any
  intentional exception. Initial allow-list:
  - `services/agent-executors/types.ts` (interface module, no
    executors).
  - Test files (`*.test.ts`, `*.spec.ts`).
- Output is grep-friendly: one violation per line, prefixed
  `[check:agents]`. No raw payloads in messages (CLAUDE.md user-
  facing-error rule applies to dev-tooling output too — we don't
  want CI logs to embed secret-shaped strings if a fixture ever
  contained one).

## Rules (non-negotiable)

- **Pure text checks.** Use `grep -R` / `rg` patterns; no TS AST
  parsing. The point is fast, transparent guards that anyone can
  read. Speed matters — CI runs this on every PR.
- **Fail loud, fail specific.** Each violation says exactly which
  file, which line, which invariant — modeled after how
  `check:chains` reports.
- **The allow-list is reasoned.** Every exemption has a `# Reason:`
  comment; PRs that add exemptions are reviewable on those reasons
  alone.
- **Local + CI parity.** A developer running `pnpm check:agents`
  locally sees the same failures CI would surface — no env-only
  rules.
- **No flakiness.** Grep patterns are anchored / scoped so a refactor
  somewhere else doesn't accidentally trigger.

## Acceptance

- [ ] `scripts/check-agents.sh` exists and is executable; root
      `package.json` exposes `check:agents`.
- [ ] On the current redesign branch the script exits 0.
- [ ] Deliberate sabotage (in five separate local commits, reverted
      before merge) trips each invariant 1–5 with the expected
      message — captured as screenshots in the PR description.
- [ ] CI step added in the existing workflow alongside `check:chains`.
- [ ] The allow-list has at most three entries, each with a
      `# Reason:` comment.

## Out of scope

- Runtime checks (boot invariants are Task 03 + Task 09 + Task 13's
  `wallet_context` integrity check). This is the static layer.
- A TypeScript-AST-based lint — overkill for v1; revisit if grep
  patterns start producing false positives.
