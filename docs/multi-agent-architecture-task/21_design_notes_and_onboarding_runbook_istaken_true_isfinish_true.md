# Task 21 — Multi-agent design notes + add-a-new-agent runbook

**Status:** Not taken
**Owner:** Server (agent-api) + Mobile (mobile-app) — architecture-review sign-off
**Spec reference:** `multi-agent-architecture-spec.md` §4.1, §9, §13.

## Why this matters

The redesign rests on two load-bearing invariants — §4.1 ("Core owns
no external tools, ever") and §9 ("`wallet_context` set once,
forwarded verbatim, never re-resolved") — and one durability promise:
§13's "adding a new sub-agent is a six-step checklist". CI (Task 18)
enforces all three statically, but a static enforcement without a
written rationale invites future engineers to disable a check and
move on. This task produces the durable artifacts so the *why* lives
next to the *how*.

Precedent in this repo: `docs/wallet-security-task/62_native_signing_design_note.md`
and `solana-chain-support-task/27_twv2026070_design_note` document
TWV gates the same way for security review. The multi-agent design
gets parallel treatment.

## Scope

Two artifacts under `docs/`:

### A. `docs/multi-agent-design-notes.md`

Captures the two invariants. Structure mirrors
`62_native_signing_design_note.md`:

- **Invariant §4.1 — Core has no external tool surface.**
  - **Purpose.** Why the routing graph must be a tree, not a mesh.
  - **What is forbidden.** Core's Agent Card declaring any
    `tool_prefix` other than `core_`; any tool under `core_`
    emitting `tool_pending` to mobile; any file under
    `agent-api/src/tools/core/` or `agent-api/src/agents/core/`
    importing from `services/walletKit`, `services/chains`,
    `services/defi`, or any other capability module; Core's handler
    importing any specialist handler directly.
  - **What must cite this gate.** Any PR that adds a `core_*` tool,
    edits Core's Agent Card, or edits
    `scripts/check-agents.sh`'s Core checks.
  - **Boot enforcement** — `assertRegistryInvariants` (Task 03).
  - **CI enforcement** — `pnpm check:agents` (Task 18).

- **Invariant §9 — `wallet_context` isolation.**
  - **Purpose.** The dApp-bridge isolation + payment-JWT-binding
    rules from CLAUDE.md, applied to the agent server seam: signing
    must use the wallet that *initiated the intent*, never the
    home-screen wallet. The orchestrator sets `wallet_context`
    once at Core's entry and forwards it verbatim.
  - **What is forbidden.** Specialists re-resolving wallet context
    from anywhere else (mobile state, JWT decode, a side-channel
    cache); the orchestrator editing the field mid-turn; specialist
    handlers emitting a `tool_pending` whose `wallet_context`
    differs from the one received; mobile executors reading
    `activeWallet` / `activeChain` from `useWallet` for signing
    paths.
  - **What must cite this gate.** Any PR that touches
    `orchestrator.ts`'s `wallet_context` plumbing, any new
    specialist handler, any new mobile executor that signs.
  - **Runtime enforcement** — orchestrator integrity check (Task
    13); mobile executors honour the forwarded context (existing
    CLAUDE.md rule).
  - **CI enforcement** — `pnpm check:agents` propagation lint
    (Task 18).

- **Out of scope** — anything in A2A beyond Agent Card / AgentTask /
  peer messages (push notifications, agent auth, public Agent Card
  hosting, multi-org federation — §3, §15).

### B. `docs/agent-onboarding-runbook.md`

The six-step §13 checklist as a runbook engineers reach for when
adding a new specialist (Identity, NFT, Payments-Concierge, …):

1. Create `agent-api/src/agents/<id>/{card,handler,prompts}.ts`.
2. Add tool definitions under `agent-api/src/tools/<id>/`.
3. Register the card in `agents/registry.ts` (Task 03 wiring).
4. Add `<id>/` under `services/agent-executors/` with one file per
   tool group; compose via `composeAgentExecutors("<id>", …)`.
5. Add the new prefix to
   `agent-api/src/agents/manifests/agentManifests.json` and run
   `pnpm manifests:sync`.
6. `pnpm check:agents` + `pnpm test` pass; merge.

For each step, include:
- The exact file paths that get touched.
- The 1-line invariant the step enforces (e.g. step 5: "no two
  agents share a prefix").
- The expected CI / boot failure mode if the step is skipped
  (e.g. "skip step 3 → `assertRegistryInvariants` throws at boot
  with 'orphan prefix' message").

Add the **anti-pattern** section: if a PR proposing a new agent
*also* edits Core's handler / prompts, the SSE protocol, Prisma
schema, or `services/agentSession/`, that's a smell — the seam
isn't doing its job. The reviewer should push back.

## Rules (non-negotiable)

- **Document the why, not the code.** Both docs survive code churn —
  if the implementation changes, the invariants and the six-step
  shape should still describe what reviewers must enforce.
- **Cross-link from code.** Add a one-line comment at the top of
  `agent-api/src/agents/core/handler.ts` and
  `agent-api/src/agents/orchestrator.ts` pointing at
  `docs/multi-agent-design-notes.md`. Same for the
  `wallet_context` forwarding site.
- **Cross-link from CI.** `scripts/check-agents.sh` opens with a
  comment referencing the design-notes doc — anyone debugging a CI
  failure lands on the rationale.
- **No secret material in examples.** Sample payloads use obvious
  fakes only (CLAUDE.md user-facing-error rule extends to docs).
- **Follow the existing markdown style.** Match the cadence of
  `62_native_signing_design_note.md` so reviewers reading both
  recognise the shape.

## Acceptance

- [ ] `docs/multi-agent-design-notes.md` exists with both invariant
      sections.
- [ ] `docs/agent-onboarding-runbook.md` exists with the six-step
      checklist + anti-pattern section.
- [ ] `agent-api/src/agents/core/handler.ts`,
      `agent-api/src/agents/orchestrator.ts`, and
      `scripts/check-agents.sh` link to the design-notes doc by
      relative path.
- [ ] Architecture reviewer signs off that the docs are adequate
      replacements for re-reading the spec from scratch.
- [ ] Markdown lints cleanly (matches the style of
      `docs/wallet-security-task/62_native_signing_design_note.md`).

## Out of scope

- Editing `multi-agent-architecture-spec.md` itself — the spec is
  the source of truth; this task is the projection.
- Public-facing developer docs for third-party agent authors — §15
  open question 5; revisit when external integration is on the
  table.
- A walkthrough of running the redesign locally — operational
  runbook, separate effort.
