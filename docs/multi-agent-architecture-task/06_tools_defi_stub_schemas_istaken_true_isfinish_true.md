# Task 06 — `tools/defi/` — stub schemas matching `defi-strategies-spec.md` §11

**Status:** Not taken
**Owner:** Server (agent-api)
**Spec reference:** `multi-agent-architecture-spec.md` §5, §12, §14.1 row 6; cross-ref `defi-strategies-spec.md` §11.

## Why this matters

The whole point of shipping the redesign before the DeFi backend is
that the **flip from stub to real is a no-op rename** (§12). That only
works if the stub schemas match the canonical names and shapes the
real DeFi spec promises — anything else means re-prompting Core, which
is not "no-op". This task lands the schemas; Task 12 lands the canned
stub handler.

## Scope

- Create `agent-api/src/tools/defi/`:
  - `opportunities.ts` — `defi_list_opportunities`.
  - `positions.ts` — `defi_list_positions`.
  - `propose.ts` — `defi_deposit`, `defi_withdraw`, `defi_rebalance`
    (grouped because they all return the same stub envelope; split
    further if individual schemas diverge from `defi-strategies-spec.md`
    §11).
  - `index.ts` — barrel + `composeAgentTools("defi", …)`.
- Tool names + input shapes **must** match
  `defi-strategies-spec.md` §11 byte-for-byte (canonical set noted in
  the multi-agent spec §5 table):
  - `defi_list_opportunities({ chain_ids?, risk_tier?, asset_symbol? })`
  - `defi_list_positions({})`
  - `defi_deposit({ asset_symbol, amount_raw, protocol_slug, chain_id, expected_tier })`
  - `defi_withdraw({ position_id, amount_raw })`
  - `defi_rebalance({ position_id, target_protocol_slug? })`
- **Do NOT ship** `defi_get_config`, `defi_simulate_deposit`, or
  `defi_claim` in this task. Per §12, the LLM doesn't need them while
  DeFi is stubbed — Core's canned "coming soon" reply covers every
  code path. These land at stub→ready flip time.
- Output schemas — minimal but match the real shape so the LLM can be
  prompted on them now:
  - `defi_list_opportunities`: `{ opportunities: Array<{ id, protocol_slug, chain_id, asset_symbol, apy, risk_tier }> }`.
    Stub returns a fixed sample of 3 (Task 12).
  - `defi_list_positions`: `{ positions: [] }` from the stub handler.
  - The three write tools: `{ status: "stubbed", message: string }` —
    the orchestrator/Core paraphrase this; mobile never sees the raw
    string (CLAUDE.md user-facing-error rule).
- Register the defi bucket in `agent-api/src/tools/registry.ts`.

## Rules (non-negotiable)

- **Names are frozen.** Renaming any of these is a breaking change to
  the LLM prompt for Core; anyone who tries it must update
  `defi-strategies-spec.md` first.
- **No real RPC / DeFi backend calls from the schemas.** Schemas are
  schemas; handlers (Task 12) are stubs. Importing a Web3 client here
  is a review-block.
- **`status: "stubbed"` is a sentinel, not user copy.** Core (Task 10)
  reads it and emits the friendly "DeFi Strategies are coming soon."
  reply per §12. The raw string never reaches a user (CLAUDE.md).
- **Three-tool minimum for proposals.** Even though all three return
  the same stub envelope today, keep them as distinct tool entries so
  Core's prompt distinguishes deposit / withdraw / rebalance intent —
  this is what makes the stub→ready flip safe.
- **Card `status: "stub"` is set in Task 12.** This task does not edit
  `agentManifests.json` — the manifest already reflects DeFi as stub
  (Task 02). Do not flip it.

## Acceptance

- [ ] `tools/defi/` contains all five tool schemas with names matching
      `defi-strategies-spec.md` §11.
- [ ] Flat registry now includes all five `defi_*` tools.
- [ ] `composeAgentTools("defi", …)` succeeds; no tool slipped under
      another prefix.
- [ ] Vitest covers: input schemas accept the canonical example payloads
      from `defi-strategies-spec.md` §11.
- [ ] Grep confirms no real Web3/DeFi backend import inside `tools/defi/`.
- [ ] `pnpm --filter agent-api run check:syntax` passes.

## Out of scope

- The DeFi handler (canned responses) — Task 12.
- Mobile-side `defi/stub.ts` executors — Task 08.
- `defi_get_config`, `defi_simulate_deposit`, `defi_claim` — stub→ready
  flip, not part of this redesign.
