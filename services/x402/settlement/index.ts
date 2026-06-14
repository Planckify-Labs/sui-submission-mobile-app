/**
 * `services/x402/settlement` — the rail-neutral settlement chain
 * (x402-extensibility-spec Part II). Barrel for the orchestrator,
 * registry, breaker, and config; EVM rail implementations live under
 * `services/walletKit/evm/rails/` and register themselves here.
 *
 * Contains NO viem / SDK / `namespace === …` branch (SP-9).
 */

export { overBudget, terminalFailure, unavailable } from "./attempt.ts";
export {
  type BreakerConfig,
  createSettlementBreaker,
  type RailHealth,
  type SettlementBreaker,
} from "./breaker.ts";
export {
  DEFAULT_SETTLEMENT_RAILS,
  isEnabled,
  priorityOf,
  RELAYER_FREE_PROFILE,
  resolveSettlementRails,
  type SettlementRailConfig,
} from "./config.ts";
export { friendlySettlementError, logSettlementDebug } from "./errors.ts";
export { encodeProofEnvelope } from "./proof.ts";
export {
  __resetRailsForTests,
  registeredRailIds,
  registerRail,
  type SettlementRailRegistry,
  settlementRailRegistry,
} from "./registry.ts";
export {
  deriveIdempotencyKey,
  type SettleDeps,
  settleWithFallback,
} from "./settleWithFallback.ts";
export {
  type SettlementAttempt,
  type SettlementContext,
  type SettlementKind,
  type SettlementRail,
} from "./types.ts";
