/**
 * `settlement/types` — the `SettlementRail` port and its attempt
 * vocabulary (x402-extensibility-spec §10.1).
 *
 * This module is **rail-neutral, SDK-free, and chain-agnostic** (SP-9): it
 * imports only plain serialisable shapes from `walletKit/types.ts` (type-
 * only) and contains no viem / no `@metamask/*` / no `namespace === …`
 * branch. EVM-specific rail implementations live under
 * `services/walletKit/evm/rails/`, where viem/SDK imports are allowed.
 *
 * The orchestrator (`settleWithFallback.ts`) only ever branches on
 * `SettlementAttempt.outcome` — the `unavailable` (failover-safe) vs
 * `terminal_failure` (stop) split is each rail's contractual
 * responsibility and is audited per §9.2 / SP-1.
 */

import type {
  SettleX402PaymentArgs,
  X402Erc7710Challenge,
} from "../../walletKit/types.ts";

export type SettlementKind = "relayer" | "facilitator" | "direct";

/** Cheap, synchronous capability context for `supports()` / `health()`. */
export interface SettlementContext {
  /** viem chain id of the paying chain (CAIP-2 reference). */
  chainId: number;
  challenge: X402Erc7710Challenge;
}

/**
 * A rail's self-classified attempt result. The orchestrator NEVER inspects
 * internals — it branches on `outcome` only. `reason` (on the failure
 * variants) is ALWAYS hand-written friendly copy (SI-6 / SP-8); the raw
 * label that explains *why* goes to a `__DEV__` log, never to the user.
 *
 * The split between `unavailable` (provably pre-broadcast → failover-safe)
 * and `terminal_failure` (post-submission ambiguity → STOP) is the
 * anti-double-spend invariant SP-1.
 */
export type SettlementAttempt =
  | {
      outcome: "settled";
      rail: SettlementKind;
      /** tx-hash envelope (Mode A) OR signed X-PAYMENT envelope (Mode B). */
      proof: string;
      /** present in Mode A; absent in Mode B (the seller settles on retry). */
      txHash?: string;
      /** true in Mode B (§9.1): no funds moved yet; seller settles on retry. */
      settlesOnRetry?: boolean;
      spentAtoms: bigint;
    }
  | {
      outcome: "over_budget";
      requestedAtoms: bigint;
      remainingBudgetAtoms: bigint;
    }
  /** funds MAY have moved → STOP the chain (SP-1). */
  | { outcome: "terminal_failure"; reason: string }
  /** provably pre-broadcast → safe to try the next rail. */
  | { outcome: "unavailable"; reason: string };

export interface SettlementRail {
  /** Stable id; also the config / breaker key (e.g. `"oneshot-relayer"`). */
  readonly id: string;
  readonly kind: SettlementKind;
  /** Lower = tried first (matches `MultiProvider`). Config may override. */
  readonly priority: number;

  /** Can this rail service THIS challenge at all? (network, SDK, config). */
  supports(ctx: SettlementContext): boolean;

  /** Optional liveness probe feeding the breaker; never called per-payment. */
  health?(ctx: SettlementContext): Promise<boolean>;

  /**
   * Settle exactly one challenge. MUST be all-or-nothing observable and
   * MUST classify failure per §9.2. `reason` is friendly copy only (SI-6).
   * Carries `idempotencyKey` (SP-5); pass it through where the backend
   * honours it.
   */
  attempt(
    args: SettleX402PaymentArgs,
    idempotencyKey: string,
  ): Promise<SettlementAttempt>;
}
