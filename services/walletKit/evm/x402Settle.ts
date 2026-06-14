/**
 * `x402Settle` — EVM settlement for agent-initiated x402 micropayments.
 *
 * Post-refactor (x402-extensibility-spec Part II) this is a **thin
 * adapter** over the rail-neutral settlement chain in
 * `services/x402/settlement/`. The Phase 5 two-rail body has moved into
 * interchangeable `SettlementRail`s tried in priority order with
 * health-based failover (`RelayerBroadcastRail`, `Erc7710FacilitatorRail`);
 * the budget gate + failover safety (SP-1) live in `settleWithFallback`.
 *
 * The `WalletKitAdapter.settleX402Payment` port is UNCHANGED — the rail
 * chain is internal to the EVM kit. Adding/removing/reordering rails is a
 * config flip (§12), not an edit here. Running relayer-free is the
 * `RELAYER_FREE_PROFILE` (§12.2).
 *
 * `encodeProofEnvelope` now lives in `services/x402/settlement/proof.ts`
 * (Mode-A tx-hash envelope) and is re-exported here for back-compat.
 */

import { createSettlementBreaker } from "../../x402/settlement/breaker.ts";
import { resolveSettlementRails } from "../../x402/settlement/config.ts";
import { settlementRailRegistry } from "../../x402/settlement/registry.ts";
import {
  type SettleDeps,
  settleWithFallback,
} from "../../x402/settlement/settleWithFallback.ts";
import { getCachedRailOverride } from "../../x402/settlementRailConfigStore.ts";
import type {
  SettleX402PaymentArgs,
  SettleX402PaymentResult,
} from "../types.ts";

export { encodeProofEnvelope } from "../../x402/settlement/proof.ts";

/**
 * Default settlement deps: the module-level rail registry (rails self-
 * register via `evm/rails/bootstrap.ts` at kit init) and a session-lived
 * breaker singleton so failover/cooldown state persists across payments.
 *
 * The registry resolves its config FRESH per payment from the API-driven
 * on-device override (`getCachedRailOverride`, refreshed at boot) merged
 * over `DEFAULT_SETTLEMENT_RAILS` — so disabling/reordering a rail, or
 * flipping relayer-free, takes effect without an app release (§12.1,
 * OQ-2). Injectable for tests (`{ registry, breaker }`).
 */
export const DEFAULT_SETTLE_DEPS: SettleDeps = {
  registry: settlementRailRegistry(() =>
    resolveSettlementRails(getCachedRailOverride()),
  ),
  breaker: createSettlementBreaker(),
};

/**
 * Settle a single x402 "exact" challenge for an EVM wallet. Delegates to
 * the rail chain; preserves every Phase 5 invariant (budget gate, fee
 * bound, payment-target binding, wallet isolation, error discipline) —
 * those now live in the orchestrator + each rail.
 */
export async function settleX402PaymentEvm(
  args: SettleX402PaymentArgs,
  deps: SettleDeps = DEFAULT_SETTLE_DEPS,
): Promise<SettleX402PaymentResult> {
  return settleWithFallback(args, deps.registry, deps.breaker);
}
