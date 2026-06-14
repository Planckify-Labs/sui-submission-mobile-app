/**
 * `settlement/settleWithFallback` — the sequential, health-aware rail
 * cascade (§8.1, §10.3). The thin orchestrator behind
 * `WalletKitAdapter.settleX402Payment`.
 *
 * Discipline (carried verbatim from the Phase 5 invariants):
 *   - **SP-4.** The budget gate (SI-1) runs ONCE here, rail-independent,
 *     before any rail is dispatched.
 *   - **SP-3.** Rails are tried STRICTLY SEQUENTIALLY — at most one
 *     `attempt()` in flight per challenge. Racing rails is a double-spend.
 *   - **SP-1.** The chain advances to the next rail **only** on an
 *     `unavailable` outcome (positive evidence nothing was broadcast).
 *     `terminal_failure` STOPS — funds may have moved.
 *   - **SP-2.** An uncaught throw is treated as `terminal_failure`, never
 *     `unavailable` — a throw is not proof of no broadcast.
 *   - **SP-7.** A `down`/cooling rail is skipped before `attempt()`.
 *   - **SP-8.** Every user-facing `reason` is friendly copy; raw detail is
 *     `__DEV__`-logged only.
 *
 * Rail-neutral / chain-agnostic (SP-9): no viem, no SDK, no
 * `namespace === …` branch. The chain id is parsed from the CAIP-2
 * `challenge.network`; rails narrow `args.chain` to their own namespace
 * internally.
 */

import type {
  SettleX402PaymentArgs,
  SettleX402PaymentResult,
  X402Erc7710Challenge,
} from "../../walletKit/types.ts";
import type { SettlementBreaker } from "./breaker.ts";
import { friendlySettlementError, logSettlementDebug } from "./errors.ts";
import type { SettlementRailRegistry } from "./registry.ts";
import type { SettlementContext } from "./types.ts";

/** Parse the viem chain id from a CAIP-2 network (`"eip155:84532"` → 84532). */
function caip2ChainId(network: string): number {
  const ref = network.split(":").pop() ?? "";
  return Number.parseInt(ref, 10);
}

/** Tolerant atoms parse — `null` on an unparseable price (never throws). */
function parseAtoms(value: string): bigint | null {
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

/**
 * Stable idempotency key derived from the challenge identity
 * (payTo, asset, maxAmountRequired, resource, network) — SP-5. Rails
 * forward it to backends that honour duplicate suppression; SP-1 remains
 * the real anti-double-spend backstop.
 */
export function deriveIdempotencyKey(ctx: SettlementContext): string {
  const c = ctx.challenge;
  return [
    "x402",
    c.network,
    c.payTo,
    c.asset,
    c.maxAmountRequired,
    c.resource,
  ].join("|");
}

export interface SettleDeps {
  registry: SettlementRailRegistry;
  breaker: SettlementBreaker;
}

export async function settleWithFallback(
  args: SettleX402PaymentArgs,
  registry: SettlementRailRegistry,
  breaker: SettlementBreaker,
): Promise<SettleX402PaymentResult> {
  const challenge: X402Erc7710Challenge = args.challenge;
  const ctx: SettlementContext = {
    chainId: caip2ChainId(challenge.network),
    challenge,
  };

  // SP-4: rail-independent budget gate, once, here. The on-chain caveat is
  // still the hard ceiling; this local gate only drives silent-vs-prompt.
  const requestedAtoms = parseAtoms(challenge.maxAmountRequired);
  if (requestedAtoms === null) {
    logSettlementDebug(
      "unparseable maxAmountRequired",
      challenge.maxAmountRequired,
    );
    return { status: "failed", reason: friendlySettlementError() };
  }
  if (requestedAtoms > args.remainingBudgetAtoms) {
    return {
      status: "over_budget",
      requestedAtoms,
      remainingBudgetAtoms: args.remainingBudgetAtoms,
    };
  }

  const candidates = registry
    .candidates(ctx)
    .filter((r) => breaker.isUsable(r.id)); // skip down/cooling (SP-7)
  if (candidates.length === 0) {
    return { status: "failed", reason: friendlySettlementError() };
  }

  const idempotencyKey = deriveIdempotencyKey(ctx); // SP-5
  let lastReason = friendlySettlementError();

  for (const rail of candidates) {
    // SP-3: strictly sequential — await each attempt fully before the next.
    const res = await rail.attempt(args, idempotencyKey).catch((err) => {
      logSettlementDebug(`${rail.id} threw`, err);
      // SP-2: an uncaught throw is NOT proof of no broadcast → terminal.
      return {
        outcome: "terminal_failure",
        reason: friendlySettlementError(),
      } as const;
    });

    switch (res.outcome) {
      case "settled":
        breaker.recordSuccess(rail.id);
        logSettlementDebug("settled", { railId: rail.id, rail: res.rail });
        return {
          status: "settled",
          rail: res.rail === "facilitator" ? "facilitator" : "relayer",
          ...(res.txHash ? { txHash: res.txHash } : {}),
          proof: res.proof,
          spentAtoms: res.spentAtoms,
        };
      case "over_budget":
        return {
          status: "over_budget",
          requestedAtoms: res.requestedAtoms,
          remainingBudgetAtoms: res.remainingBudgetAtoms,
        };
      case "terminal_failure":
        // SP-1: do NOT advance — value may have moved.
        logSettlementDebug("terminal_failure", { railId: rail.id });
        return { status: "failed", reason: res.reason };
      case "unavailable":
        breaker.recordFailure(rail.id);
        lastReason = res.reason;
        logSettlementDebug("unavailable → next rail", { railId: rail.id });
        continue; // the ONLY advancing path
    }
  }

  return { status: "failed", reason: lastReason };
}
