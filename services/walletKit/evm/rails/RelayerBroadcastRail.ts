/**
 * `RelayerBroadcastRail` — Mode-A (buyer-broadcast) settlement via the
 * 1Shot public relayer (x402-extensibility-spec §11.1, §9.1).
 *
 * The Phase 5 relayer body moves **verbatim** into `attempt()`; the only
 * new work is classifying failures around the `send` SUBMISSION BOUNDARY
 * per §9.2 / SP-1:
 *   - Everything up to and including `estimate` is pre-boundary — any
 *     failure is `unavailable` (failover-safe; nothing broadcast).
 *   - From the `send` invocation onward, any ambiguity is
 *     `terminal_failure` (funds MAY have moved → STOP). The one exception
 *     is a relayer-attested terminal-failed with NO tx hash, where the
 *     rail authoritatively knows it never broadcast → `unavailable`.
 *
 * 1Shot is just the default *client* of this rail (cfg-driven endpoints,
 * SP-6); switching relayers is swapping `deps`/`cfg`, not a new rail type.
 *
 * Rules: viem is allowed here (under `evm/`). `reason` on a failure is
 * friendly copy only; raw detail is `__DEV__`-logged (SI-6 / SP-8).
 */

import { encodeFunctionData, erc20Abi } from "viem";
import { assertEvmChain } from "../../../../constants/configs/chainConfig.ts";
import {
  terminalFailure,
  unavailable,
} from "../../../x402/settlement/attempt.ts";
import { logSettlementDebug } from "../../../x402/settlement/errors.ts";
import { encodeProofEnvelope } from "../../../x402/settlement/proof.ts";
import type {
  SettlementAttempt,
  SettlementContext,
  SettlementRail,
} from "../../../x402/settlement/types.ts";
import type {
  RelayerBundleEntry,
  RelayerStatus,
  SettleX402PaymentArgs,
} from "../../types.ts";
import {
  RELAYER_FEE_SAFETY_MAX_USDC_ATOMS,
  relayerEstimate7710Transaction,
  relayerGetCapabilities,
  relayerGetFeeData,
  relayerGetStatus,
  relayerSend7710Transaction,
} from "../relayer.ts";

export interface RelayerRailConfig {
  /** rail id / breaker key. Defaults to `"oneshot-relayer"`. */
  id?: string;
  /** intrinsic priority (config may override at registration). */
  priority?: number;
  /** viem chain ids this relayer is configured to serve. */
  enabledChainIds: number[];
  /** optional per-rail fee ceiling in atoms (≤ the SI-2 envelope). */
  feeCapAtoms?: bigint;
}

/**
 * Injectable seam for tests — defaults wire the real 1Shot client. Mirrors
 * the Phase 5 `X402SettleDeps` so the rail-selection / budget / fee logic
 * is exercisable under `node:test` with a mocked relayer and no network.
 */
export interface RelayerRailDeps {
  getCapabilities: typeof relayerGetCapabilities;
  getFeeData: typeof relayerGetFeeData;
  estimate: typeof relayerEstimate7710Transaction;
  send: typeof relayerSend7710Transaction;
  getStatus: typeof relayerGetStatus;
  pollIntervalMs: number;
  pollTimeoutMs: number;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

export const DEFAULT_RELAYER_DEPS: RelayerRailDeps = {
  getCapabilities: relayerGetCapabilities,
  getFeeData: relayerGetFeeData,
  estimate: relayerEstimate7710Transaction,
  send: relayerSend7710Transaction,
  getStatus: relayerGetStatus,
  pollIntervalMs: 3000,
  pollTimeoutMs: 90_000,
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/** Build an ERC-20 `transfer` execution leg for a relayer bundle. */
function erc20TransferExecution(
  token: `0x${string}`,
  to: `0x${string}`,
  amount: bigint,
): RelayerBundleEntry["executions"][number] {
  return {
    target: token,
    value: 0n,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [to, amount],
    }),
  };
}

function isHexAddress(value: unknown): value is `0x${string}` {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}

type PollResult =
  | { kind: "success"; txHash: string }
  | { kind: "failed"; txHash?: string }
  | { kind: "timeout" };

/**
 * Polls the relayer task to a terminal outcome. Unlike the Phase 5 helper
 * it never throws on a terminal-failed/timeout — it returns a structured
 * result the boundary classifier (§9.2) branches on. A thrown `getStatus`
 * (transport blip) still propagates, and is caught post-boundary → terminal.
 */
async function pollToTerminal(
  chainId: number,
  taskId: string,
  deps: RelayerRailDeps,
): Promise<PollResult> {
  const deadline = deps.now() + deps.pollTimeoutMs;
  while (deps.now() < deadline) {
    const status: RelayerStatus = await deps.getStatus({ chainId, taskId });
    if (status.status === "failed") {
      return { kind: "failed", txHash: status.transactionHash };
    }
    if (status.transactionHash) {
      return { kind: "success", txHash: status.transactionHash };
    }
    await deps.sleep(deps.pollIntervalMs);
  }
  return { kind: "timeout" };
}

export function createRelayerBroadcastRail(
  cfg: RelayerRailConfig,
  deps: RelayerRailDeps = DEFAULT_RELAYER_DEPS,
): SettlementRail {
  const feeCap = cfg.feeCapAtoms ?? RELAYER_FEE_SAFETY_MAX_USDC_ATOMS;

  return {
    id: cfg.id ?? "oneshot-relayer",
    kind: "relayer",
    priority: cfg.priority ?? 10,

    supports: (ctx: SettlementContext) =>
      cfg.enabledChainIds.includes(ctx.chainId),

    async health(ctx) {
      try {
        const caps = await deps.getCapabilities({ chainId: ctx.chainId });
        return isHexAddress(caps[ctx.chainId]?.feeCollector);
      } catch {
        return false;
      }
    },

    async attempt(
      args: SettleX402PaymentArgs,
      _idempotencyKey: string,
    ): Promise<SettlementAttempt> {
      const chainId = assertEvmChain(args.chain).chain.id;
      const { challenge, delegation, remainingBudgetAtoms } = args;

      let requestedAtoms: bigint;
      try {
        requestedAtoms = BigInt(challenge.maxAmountRequired);
      } catch {
        return unavailable("unparseable maxAmountRequired");
      }

      // ── pre-submission: every failure here is `unavailable` ───────────
      let bundle: RelayerBundleEntry;
      let context: string;
      try {
        const caps = await deps.getCapabilities({ chainId });
        const feeCollector = caps[chainId]?.feeCollector;
        if (!isHexAddress(feeCollector)) {
          return unavailable("no feeCollector from capabilities");
        }

        const feeData = await deps.getFeeData({
          chainId,
          token: challenge.asset,
        });
        let feeAmount = feeData.minFee > 0n ? feeData.minFee : 1n;

        const buildBundle = (fee: bigint): RelayerBundleEntry => ({
          permissionContext: [delegation],
          executions: [
            erc20TransferExecution(challenge.asset, feeCollector, fee),
            erc20TransferExecution(
              challenge.asset,
              challenge.payTo,
              requestedAtoms,
            ),
          ],
        });

        bundle = buildBundle(feeAmount);
        let estimate = await deps.estimate({ chainId, transactions: [bundle] });
        if (!estimate.success) return unavailable("estimate failed");

        // Honour the relayer's real required fee with ONE rebuild (no
        // re-sign — the standing delegation's cap covers fee + payment).
        if (
          estimate.requiredPaymentAmount !== undefined &&
          estimate.requiredPaymentAmount !== feeAmount
        ) {
          feeAmount = estimate.requiredPaymentAmount;
          bundle = buildBundle(feeAmount);
          estimate = await deps.estimate({ chainId, transactions: [bundle] });
          if (!estimate.success) return unavailable("re-estimate failed");
        }

        // SI-2 fee bound is PER-RAIL → `unavailable` enables cost-based
        // failover (§9.3): a cheaper rail down the list gets a turn.
        if (feeAmount > feeCap) return unavailable("fee over safety bound");

        // SI-1: payment + fee both draw from the same allowance.
        if (requestedAtoms + feeAmount > remainingBudgetAtoms) {
          return {
            outcome: "over_budget",
            requestedAtoms: requestedAtoms + feeAmount,
            remainingBudgetAtoms,
          };
        }

        context = estimate.context ?? "";
      } catch (err) {
        logSettlementDebug("oneshot pre-submit", err);
        return unavailable("pre-submit threw"); // nothing broadcast yet
      }

      // ── SUBMISSION BOUNDARY ── any failure from here is terminal ──────
      // (1Shot's client carries no idempotency field yet; SP-1 is the real
      //  anti-double-spend backstop. Thread `_idempotencyKey` once it does.)
      try {
        const { taskId } = await deps.send({
          chainId,
          transactions: [bundle],
          context,
        });
        const poll = await pollToTerminal(chainId, taskId, deps);

        // Rail authoritatively attests it never broadcast → safe to fail over.
        if (poll.kind === "failed" && !poll.txHash) {
          return unavailable("relayer rejected pre-broadcast");
        }
        // Broadcast then reverted, or timed out with a tx in flight → STOP.
        if (poll.kind === "failed")
          return terminalFailure("broadcast reverted");
        if (poll.kind === "timeout") return terminalFailure("poll timeout");

        return {
          outcome: "settled",
          rail: "relayer",
          txHash: poll.txHash,
          proof: encodeProofEnvelope({
            challenge,
            rail: "relayer",
            txHash: poll.txHash,
          }),
          spentAtoms: requestedAtoms,
        };
      } catch (err) {
        logSettlementDebug("oneshot post-submit", err);
        return terminalFailure("post-submit threw"); // funds MAY have moved
      }
    },
  };
}
