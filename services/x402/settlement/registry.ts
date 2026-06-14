/**
 * `settlement/registry` — rails SELF-REGISTER at bootstrap, mirroring
 * `services/walletKit/bootstrap.ts` (space docking, §3.2). Adding a rail =
 * one `registerRail()` line; the registry itself needs no central edit
 * (SP-6).
 *
 * `candidates()` returns the config-ordered, capability-filtered rails for
 * a challenge. It does NOT consult the breaker — health filtering is the
 * orchestrator's job so the breaker dependency stays injectable and the
 * registry stays a pure projection of (registered rails × config).
 */

import {
  isEnabled,
  priorityOf,
  resolveSettlementRails,
  type SettlementRailConfig,
} from "./config.ts";
import type { SettlementContext, SettlementRail } from "./types.ts";

export interface SettlementRailRegistry {
  /** config-ordered (priority asc), capability-filtered candidates. */
  candidates(ctx: SettlementContext): SettlementRail[];
}

/** Module-level registration table — the space-docking surface. */
const RAILS: SettlementRail[] = [];

/** Register a rail. Idempotent per `id` so a re-boot can't duplicate it. */
export function registerRail(rail: SettlementRail): void {
  const existing = RAILS.findIndex((r) => r.id === rail.id);
  if (existing >= 0) {
    RAILS[existing] = rail;
  } else {
    RAILS.push(rail);
  }
}

/** Test-only reset — clears every registered rail. */
export function __resetRailsForTests(): void {
  RAILS.length = 0;
}

/** Currently-registered rails (ids), for diagnostics / tests. */
export function registeredRailIds(): string[] {
  return RAILS.map((r) => r.id);
}

/**
 * Build a registry view. `resolveCfg` returns the merged config list
 * (default set + remote override) and is injectable so the remote-config
 * home (OQ-2) can supply a cached override without touching the registry.
 */
export function settlementRailRegistry(
  resolveCfg: () => SettlementRailConfig[] = () => resolveSettlementRails(),
): SettlementRailRegistry {
  return {
    candidates(ctx) {
      const cfg = resolveCfg();
      return RAILS.filter((r) => isEnabled(cfg, r.id)) // presence/enabled (SP-6)
        .filter((r) => r.supports(ctx)) // network / SDK / config capable
        .sort(
          (a, b) =>
            priorityOf(cfg, a.id, a.priority) -
            priorityOf(cfg, b.id, b.priority),
        );
    },
  };
}
