# Task 19 — Vitest — orchestrator routing + `AgentTask` lifecycle

**Status:** Not taken
**Owner:** Server (agent-api)
**Spec reference:** `multi-agent-architecture-spec.md` §6, §8, §14.1 row 10.

## Why this matters

The orchestrator is the single most load-bearing module in the
redesign. Unit-level vitests in Task 13 cover the happy paths; this
task is the **coverage sweep** — every branch the spec promises gets
a test, with realistic mocked LLM responses + mocked SSE sink + the
real `tasks/store.ts` over an in-memory Prisma fake.

## Scope

- Add or extend `agent-api/src/agents/orchestrator.test.ts` (and
  sibling files as needed; vitest's `include` list already covers
  `agent-api/`). Each test below gets its own `describe` block:
  1. **Wallet tool round-trip.** "Transfer 1 USDC to 0x…" →
     `tool_pending` for `transfer_erc20` with
     `origin_agent_id: "wallet"` and the forwarded `wallet_context`;
     mobile-sink mock returns `tool_result`; Core re-enters; final
     assistant message emitted. `AgentTask` row: `pending` →
     `working` → `completed`, `outputJson` populated.
  2. **DeFi stub round-trip** (Appendix A). "Deposit 50 USDC into
     Aave Base, conservative" → `defi_deposit` task, DeFi handler
     returns `status: "stubbed"`, Core narrates "DeFi Strategies are
     coming soon …" — assert the assistant message contains the
     friendly copy AND does NOT contain the raw `message` sentinel
     (CLAUDE.md user-facing-error rule).
  3. **`wallet_context` propagation** (§9). Specialist handler
     receives the same `wallet_context` object Core was called with;
     `tool_pending` envelope carries it verbatim; if the specialist
     tries to emit with a *different* `wallet_context`, the
     orchestrator rejects the emission (assertion on the rejected
     promise + structured error type).
  4. **`core_handoff` non-conversational.** Core emits
     `core_handoff({ to: "wallet", brief: "fetch balance" })`;
     orchestrator creates a Wallet task; Wallet handles it (mocked
     to return a structured payload); Core resumes the narrative
     next turn.
  5. **`core_handoff conversational: true`.** Orchestrator emits
     `narrative_handoff` SSE frame, pipes specialist text deltas
     under `origin_agent_id: "<specialist>"`, emits
     `narrative_handoff_end`. Core does NOT re-enter for narration
     this turn.
  6. **Peer message `ask_user`.** Specialist returns
     `kind: "ask_user"`; orchestrator surfaces it on Core's next
     turn (as input context); Core decides whether to ask the user.
     Assert the peer message row is persisted via `tasks/store.ts`.
  7. **Specialist error handling.** Specialist throws → task status
     `failed`, raw error is logged via the test's `__DEV__` capture,
     user-visible message is fixed friendly copy (CLAUDE.md).
  8. **Unknown tool name.** Core emits a tool call whose prefix
     resolves to no agent → orchestrator returns a structured error,
     Core paraphrases for the user.
- Mocking layer:
  - LLM: a tiny `MockLlm` that returns canned tool-call plans per
    test (no actual `@ai-sdk` invocation).
  - SSE sink: an in-memory recorder that captures the frame
    sequence; assertions run on the captured array.
  - Prisma: use Prisma's `__mocks__` or an in-memory adapter for
    `AgentTask` + `AgentPeerMessage`. Real `tasks/store.ts` (Task 15)
    runs on top.

## Rules (non-negotiable)

- **Real store, mocked LLM + SSE.** The point of the test is the
  orchestrator + store boundary — that's where bugs hide. Mocking
  the store too means the test only proves orchestrator-shaped-like-
  itself.
- **Each test reads independently.** No shared `beforeAll` state
  that one test mutates and another reads — that pattern flakes the
  whole suite.
- **No real network / chain RPCs.** Mocked SSE sink, mocked LLM,
  Prisma fake. Anything else risks flake.
- **Assertion messages cite the spec line.** `expect(frame.kind).toBe("narrative_handoff") // §6.4` — easy
  to grep when a test breaks.
- **Snapshot tests sparingly.** Only for the canonical SSE frame
  sequence in Task 16's snapshots; everywhere else use explicit
  assertions so a future refactor doesn't accidentally bless a
  silent behaviour change.

## Acceptance

- [ ] All eight test groups exist and pass.
- [ ] Coverage report shows `agent-api/src/agents/orchestrator.ts` at
      ≥ 90 % line coverage (target, not gate — the gate is "every
      branch the spec promises has a test", not a number).
- [ ] `pnpm test:vitest` finishes in under 5 s for this suite (mocked
      everything; if it doesn't, the mocks are wrong).
- [ ] `pnpm --filter agent-api run check:syntax` passes.

## Out of scope

- The mobile parser test — Task 17 covers it locally.
- The end-to-end SSE backwards-compat test — Task 20.
- Performance benchmarking — not part of v1 acceptance.
