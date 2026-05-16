# `api/` DeFiLlama poller, scoring service, and workers

**Phase 1 — MVP**

Refer to `../defi-strategies-spec.md` §8 and §13.
Implement:
- `external/defillama.client.ts`
- `defillama-poll.processor.ts` (BullMQ worker, every 4h)
- `scoring/scoring.service.ts` (5-dimension risk scoring)
- `score-opportunities.processor.ts`
- `stablecoin-depeg-watcher.processor.ts` (every 5 min)
- `rebalance-trigger.processor.ts`
- `goal-deadline-watcher.processor.ts`