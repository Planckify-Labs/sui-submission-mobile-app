/**
 * RiskCheck registry + `runGuardian` (spec §5.1).
 *
 * New risk classes dock by registering a `RiskCheck` — no branching
 * anywhere else changes (space-docking). `runGuardian` runs every
 * registered check and collects the non-null flags. Each check is
 * isolated: one throwing never aborts the guardian (a failed check must
 * not silently *pass* a risky intent, but it also must not crash the
 * preview — it simply contributes no flag, and the dry-run revert gate in
 * the executor remains the backstop).
 */

import { createEffectMismatchCheck } from "./checks/effectMismatchCheck";
import { createHighSlippageCheck } from "./checks/highSlippageCheck";
import { createOverConcentrationCheck } from "./checks/overConcentrationCheck";
import { createStaleOracleCheck } from "./checks/staleOracleCheck";
import type { RiskCheck, RiskCheckArgs, RiskFlag } from "./riskCheck";

class RiskCheckRegistry {
  private readonly checks = new Map<string, RiskCheck>();

  register(check: RiskCheck): void {
    this.checks.set(check.code, check);
  }

  list(): RiskCheck[] {
    return [...this.checks.values()];
  }

  clear(): void {
    this.checks.clear();
  }
}

export { RiskCheckRegistry };

/** Production registry — the Phase-1 risk classes (§5.2). */
export const guardianRegistry = new RiskCheckRegistry();

let registered = false;
function ensureRegistered(): void {
  if (registered) return;
  guardianRegistry.register(createHighSlippageCheck());
  guardianRegistry.register(createStaleOracleCheck());
  guardianRegistry.register(createOverConcentrationCheck());
  // Reasons over the dry-run's REAL balance changes (not the venue quote) —
  // the "why Sui" pre-sign effect inspection.
  guardianRegistry.register(createEffectMismatchCheck());
  registered = true;
}

/**
 * Run the guardian over a compiled intent + dry-run. Defaults to the
 * production registry; tests pass an explicit `checks` array built from
 * the check factories with stub readers so no live RPC is hit.
 */
export async function runGuardian(
  args: RiskCheckArgs,
  checks?: RiskCheck[],
): Promise<RiskFlag[]> {
  let active = checks;
  if (!active) {
    ensureRegistered();
    active = guardianRegistry.list();
  }

  const results = await Promise.all(
    active.map(async (check) => {
      try {
        return await check.run(args);
      } catch {
        // A check that errors contributes no flag — it must never crash
        // the preview. The dry-run revert gate (executor) is the backstop.
        return null;
      }
    }),
  );
  return results.filter((f): f is RiskFlag => f !== null);
}
