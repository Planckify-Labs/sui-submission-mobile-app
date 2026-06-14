/**
 * `settlement/attempt` — shared `SettlementAttempt` constructors so every
 * rail classifies failures identically (§9.2 / SP-1) and emits friendly
 * copy only (SI-6 / SP-8).
 *
 * The optional `devLabel` is an INTERNAL reason ("fee over bound",
 * "facilitator unreachable", …) used for diagnosis: it is dev-logged here
 * and NEVER placed in the user-facing `reason`, which is always
 * {@link friendlySettlementError}.
 */

import { friendlySettlementError, logSettlementDebug } from "./errors.ts";
import type { SettlementAttempt } from "./types.ts";

/**
 * Failover-safe outcome: the rail has positive evidence that no value-
 * bearing transaction was broadcast (pre-submission failure, or a rail-
 * attested terminal-failed with no tx hash — §9.2). The orchestrator may
 * advance to the next rail.
 */
export function unavailable(devLabel?: string): SettlementAttempt {
  if (devLabel) logSettlementDebug(`unavailable: ${devLabel}`);
  return { outcome: "unavailable", reason: friendlySettlementError() };
}

/**
 * Stop-the-chain outcome: funds MAY have moved (post-submission
 * ambiguity, or an uncaught throw — SP-1 / SP-2). The orchestrator must
 * NOT advance; the on-chain caveat + local ledger are the backstop.
 */
export function terminalFailure(devLabel?: string): SettlementAttempt {
  if (devLabel) logSettlementDebug(`terminal_failure: ${devLabel}`);
  return { outcome: "terminal_failure", reason: friendlySettlementError() };
}

/** Budget gate failure (SI-1): surface a top-up prompt, never fail over. */
export function overBudget(
  requestedAtoms: bigint,
  remainingBudgetAtoms: bigint,
): SettlementAttempt {
  return { outcome: "over_budget", requestedAtoms, remainingBudgetAtoms };
}
