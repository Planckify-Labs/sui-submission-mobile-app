# Multi-agent "Stub-to-Real" Flip

**Phase 1 — MVP**

Refer to `../defi-strategies-spec.md` §25.
This is the final integration task for Phase 1. Flip the DeFi specialist from `stub` to `ready`:
- Replace the stub handler in `agent-api/src/agents/defi/handler.ts` with the real one.
- Replace stub Zod schemas in `agent-api/src/tools/defi/` with real ones (§11).
- Replace `services/agent-executors/defi/stub.ts` with real mobile executors (§25.3).
- Wire `bootDefi()` into `app/_layout.tsx` (§5.3).
- Change `status: "stub"` → `status: "ready"` in `agent-api/src/agents/defi/card.ts`.
- Remove any "Coming Soon" or stub-related copy from the system prompt fragments.
