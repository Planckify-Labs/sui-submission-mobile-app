# Task 20 — End-to-end SSE backwards-compat test

**Status:** Not taken
**Owner:** Server (agent-api) + Mobile (mobile-app)
**Spec reference:** `multi-agent-architecture-spec.md` §11.4, §14.1 row 10.

## Why this matters

§11.4 is explicit: the redesign adds two optional fields/frames
(`origin_agent_id`, `narrative_handoff*`). Old mobile clients that
ignore them keep working unchanged. That promise is worth a real
end-to-end test, because *every* future change to the SSE envelope
will lean on it.

## Scope

- Add `agent-api/test/sse-backwards-compat.e2e.ts` (or wherever e2e
  tests live in `agent-api`; if no e2e harness exists yet, set up a
  minimal supertest-style runner against the NestJS app).
- The test:
  1. Boot the real `agent-api` NestJS app with a stubbed LLM
     (returns canned tool-call plans) + a stubbed mobile-executor
     responder.
  2. Open an SSE connection. Send a user message "transfer 1 USDC
     to 0x…".
  3. Parse the SSE stream into discrete frames.
  4. Assert: every `tool_pending` includes `origin_agent_id`;
     the orchestrator-side round-trip closes with the assistant
     message.
  5. **Backwards-compat parser pass:** run the captured frame
     stream through a *legacy* parser that ignores
     `origin_agent_id` and the new frame kinds (copy-pasted from
     git history pre-redesign, or stubbed in the test as the
     minimal pre-redesign shape) and assert it still yields a
     valid message stream — no parse errors, no missed user-
     visible content. **This is the actual backwards-compat
     promise** the spec makes.
- Optional but recommended: add a complementary mobile-side test
  under `services/agentSession/` that asserts the pre-redesign
  cached `Message[]` shape (without `originAgentId`) loads from
  MMKV and renders without error. Read fixtures from
  `services/agentSession/__fixtures__/pre-redesign-conversation.json`
  — capture them once from a prod-shaped conversation snapshot
  (PII-scrubbed) and commit.
- Wire the e2e test into CI alongside the existing `pnpm test`
  invocation. It must run after the server is up; if CI doesn't
  already spin up `agent-api`, add the minimal step.

## Rules (non-negotiable)

- **The legacy parser is the contract.** Write it to mirror the
  pre-redesign code path (you can grab it from the git history of
  `services/agentSession/protocol.ts` just before this redesign's
  PR). If the redesign requires editing the legacy parser to make
  the test pass, you have broken backwards compat — fix the wire
  format, not the test.
- **Stub the LLM, not the orchestrator.** The orchestrator runs
  for real in this test. The point is to exercise the actual SSE
  emitter, not a mock of it.
- **No real chain calls.** The mobile-executor responder is a
  stub that returns canned `tool_result` payloads for the tool
  names this test exercises (just `transfer_erc20` is enough).
- **PII-scrubbed fixtures.** The mobile MMKV fixture must not
  contain real addresses, real JWTs, or real seed phrases —
  obvious fakes only (CLAUDE.md user-facing-error rule extends to
  test fixtures: never let a real secret-shaped string land in a
  repo).
- **Failures cite the spec.** If a future change breaks this test,
  the assertion failure messages should point at "§11.4 backwards
  compat" so the next engineer reads the right paragraph.

## Acceptance

- [ ] `sse-backwards-compat.e2e.ts` runs in CI; passes today.
- [ ] Legacy parser ignores `origin_agent_id` and both narrative
      frames; still produces a valid user-visible message stream.
- [ ] Mobile-side MMKV fixture test loads a pre-redesign cached
      `Message[]` and renders without error.
- [ ] Deliberate sabotage (introduce a *required* new envelope
      field) reproduces a test failure citing §11.4 — captured in
      the PR description, reverted before merge.
- [ ] `pnpm test` runs the new e2e step in under 10 s.

## Out of scope

- Orchestrator unit coverage — Task 19.
- Mobile-side parser branch coverage — Task 17 covered it locally.
- Cross-version coexistence with future redesign frames — by
  definition revisited per redesign.
