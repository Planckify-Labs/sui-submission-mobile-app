/**
 * `settlement/breaker` — per-rail circuit breaker (§10.2).
 *
 * Identical state machine to `MultiProvider.checkHealth`
 * (`healthy → degraded → down`), minus the rate limiter (settlements are
 * infrequent — no token bucket needed). In-memory only (N5): a cold start
 * resets it.
 *
 * Health isolation (SP-7): state is keyed by `railId` and a `down`/cooling
 * rail never blocks a *different*, healthy rail.
 */

export type RailHealth = "healthy" | "degraded" | "down";

export interface BreakerConfig {
  /** Consecutive `unavailable` before `down` (default 3). */
  failuresToDown: number;
  /** Skip window once `down`, in ms (default 60_000). */
  cooldownMs: number;
  /** Overridable clock for deterministic tests. */
  now: () => number;
}

export interface SettlementBreaker {
  /** false while `down` + still cooling (SP-7). */
  isUsable(railId: string): boolean;
  /** → healthy, reset counters. */
  recordSuccess(railId: string): void;
  /** ++ consecutive; threshold → down + start cooldown. */
  recordFailure(railId: string): void;
  health(railId: string): RailHealth;
}

interface RailBreakerState {
  consecutiveFailures: number;
  health: RailHealth;
  /** Epoch ms until which a `down` rail is skipped. */
  downUntil: number;
}

const DEFAULTS: BreakerConfig = {
  failuresToDown: 3,
  cooldownMs: 60_000,
  now: () => Date.now(),
};

/**
 * Creates an in-memory breaker. `recordFailure` is for `unavailable`
 * outcomes only — `terminal_failure` stops the chain and never touches the
 * breaker (a stop is not a liveness signal).
 */
export function createSettlementBreaker(
  config: Partial<BreakerConfig> = {},
): SettlementBreaker {
  const cfg: BreakerConfig = { ...DEFAULTS, ...config };
  const states = new Map<string, RailBreakerState>();

  function stateOf(railId: string): RailBreakerState {
    let s = states.get(railId);
    if (!s) {
      s = { consecutiveFailures: 0, health: "healthy", downUntil: 0 };
      states.set(railId, s);
    }
    return s;
  }

  return {
    isUsable(railId) {
      const s = stateOf(railId);
      // `down` blocks only while the cooldown window is still open; once it
      // elapses the rail gets a trial attempt again (health stays `down`
      // until a success resets it — mirrors MultiProvider).
      if (s.health === "down" && cfg.now() < s.downUntil) return false;
      return true;
    },

    recordSuccess(railId) {
      const s = stateOf(railId);
      s.consecutiveFailures = 0;
      s.health = "healthy";
      s.downUntil = 0;
    },

    recordFailure(railId) {
      const s = stateOf(railId);
      s.consecutiveFailures += 1;
      if (s.consecutiveFailures >= cfg.failuresToDown) {
        s.health = "down";
        s.downUntil = cfg.now() + cfg.cooldownMs;
      } else {
        s.health = "degraded";
      }
    },

    health(railId) {
      return stateOf(railId).health;
    },
  };
}
