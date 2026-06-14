/**
 * `Erc7710FacilitatorRail` — Mode-B (server-settled, relayer-free)
 * settlement (x402-extensibility-spec §11.2, §9.1).
 *
 * The rail only **signs** the ERC-7710 payment inside `attempt()` — no
 * funds move there. The proof is the signed `X-PAYMENT` envelope; the
 * *seller's* facilitator settles when the orchestrator retries. So this
 * path needs no buyer gas and no buyer-side relayer. Enabling it and
 * disabling the relayer is the whole of "run relayer-free" (§12.2).
 *
 * The failover-safe window is ALL of `attempt()` because the submission
 * boundary is the orchestrator's retry, *outside* the rail (§9.1). The
 * non-settling `/verify` pre-check is what makes a facilitator outage
 * failover-safe: it validates the payload + confirms the facilitator is up
 * WITHOUT moving funds.
 *
 * **Facilitator-agnostic by construction (SP-6).** Not bound to any vendor:
 * the facilitator URL is seller-advertised (`challenge.facilitator`),
 * validated against `cfg.allowedFacilitators`, and the rail speaks the
 * standard x402 `/verify` + `/settle` contract. The only vendor-specific
 * piece is the injectable buyer-side `signPayment` (today the MetaMask
 * smart-accounts SDK as the reference ERC-7710 signer).
 *
 * Ships DISABLED by default (`sdkAvailable() === false`) only because the
 * buyer SDK isn't a dependency of this repo yet — it is fully specified,
 * not a stub. All SDK access is behind injectable `deps` so the rail is
 * `node:test`-able with mocks and bundles no SDK until it lands.
 */

import type { ChainConfig } from "../../../../constants/configs/chainConfig.ts";
import type { TWallet } from "../../../../constants/types/walletTypes.ts";
import { unavailable } from "../../../x402/settlement/attempt.ts";
import { logSettlementDebug } from "../../../x402/settlement/errors.ts";
import type {
  SettlementAttempt,
  SettlementContext,
  SettlementRail,
} from "../../../x402/settlement/types.ts";
import type {
  DelegationStruct,
  SettleX402PaymentArgs,
  X402Erc7710Challenge,
} from "../../types.ts";

export interface FacilitatorRailConfig {
  /** rail id / breaker key. Defaults to `"erc7710-facilitator"`. */
  id?: string;
  /** intrinsic priority (config may override at registration). */
  priority?: number;
  /**
   * Allow-listed facilitator origins (SI-3 / SP-6). A seller-named
   * facilitator outside this list is refused at `supports()` — the buyer
   * never signs for an unknown redeemer.
   */
  allowedFacilitators: string[];
}

/** Result of the non-settling `/verify` pre-check (§9.1). */
export interface FacilitatorVerifyResult {
  reachable: boolean;
  ok: boolean;
}

/**
 * Injectable SDK / network seam — all vendor coupling lives here so the
 * rail body stays facilitator-agnostic and testable. Production wiring
 * supplies the MetaMask smart-accounts signer + an x402 `/verify` client;
 * the default below reports the SDK as absent so the rail self-disables.
 */
export interface FacilitatorRailDeps {
  /** Whether the buyer ERC-7710 signing SDK is present in the bundle. */
  sdkAvailable(): boolean;
  /** Derive the buyer smart account from the SESSION-bound wallet (SI-4). */
  deriveAccount(wallet: TWallet, chain: ChainConfig): Promise<unknown>;
  /** Encode the stored user→agent delegation as `parentPermissionContext`. */
  encodeDelegations(args: {
    chain: ChainConfig;
    delegations: DelegationStruct[];
  }): Promise<string>;
  /** Produce the signed ERC-7710 `X-PAYMENT` payload (no settlement). */
  signPayment(args: {
    account: unknown;
    parentPermissionContext: string;
    challenge: X402Erc7710Challenge;
    idempotencyKey: string;
  }): Promise<string>;
  /** NON-settling `/verify` — validates signature + balance + nonce only. */
  verify(
    facilitator: string,
    signedPayment: string,
    challenge: X402Erc7710Challenge,
  ): Promise<FacilitatorVerifyResult>;
  /** Liveness probe (GET `/supported` / HEAD `/verify`) feeding the breaker. */
  probe(facilitator: string): Promise<boolean>;
}

/** The SDK isn't a dependency yet — report absent so the rail self-disables. */
export const DEFAULT_FACILITATOR_DEPS: FacilitatorRailDeps = {
  sdkAvailable: () => false,
  deriveAccount: async () => {
    throw new Error("facilitator SDK not available");
  },
  encodeDelegations: async () => {
    throw new Error("facilitator SDK not available");
  },
  signPayment: async () => {
    throw new Error("facilitator SDK not available");
  },
  verify: async () => ({ reachable: false, ok: false }),
  probe: async () => false,
};

/** Origin of a facilitator URL for the allow-list check; `""` if unparseable. */
function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

export function createErc7710FacilitatorRail(
  cfg: FacilitatorRailConfig,
  deps: FacilitatorRailDeps = DEFAULT_FACILITATOR_DEPS,
): SettlementRail {
  return {
    id: cfg.id ?? "erc7710-facilitator",
    kind: "facilitator",
    priority: cfg.priority ?? 20,

    // Capable only for the ERC-7710 scheme, when the seller names a
    // facilitator on the allow-list AND the buyer SDK is present. An
    // EIP-3009 seller is served by a sibling Eip3009FacilitatorRail.
    supports: (ctx: SettlementContext) =>
      ctx.challenge.assetTransferMethod === "erc7710" &&
      !!ctx.challenge.facilitator &&
      cfg.allowedFacilitators.includes(originOf(ctx.challenge.facilitator)) &&
      deps.sdkAvailable(),

    // Liveness only — settles nothing; feeds the breaker so a dead
    // facilitator is skipped (SP-7).
    async health(ctx) {
      if (!ctx.challenge.facilitator) return false;
      return deps.probe(ctx.challenge.facilitator).catch(() => false);
    },

    async attempt(
      args: SettleX402PaymentArgs,
      idempotencyKey: string,
    ): Promise<SettlementAttempt> {
      const facilitator = args.challenge.facilitator;
      if (!facilitator) {
        // supports() already guards this; defensive — nothing moved.
        return unavailable("no facilitator on challenge");
      }

      let spentAtoms: bigint;
      try {
        spentAtoms = BigInt(args.challenge.maxAmountRequired);
      } catch {
        return unavailable("unparseable maxAmountRequired");
      }

      // 1+2. Derive the session-bound buyer account (SI-4) and SIGN the
      //      payment, seeded with the stored user→agent delegation as the
      //      parentPermissionContext (the budget). No funds move here.
      let signedPayment: string;
      try {
        const account = await deps.deriveAccount(args.wallet, args.chain);
        const parentPermissionContext = await deps.encodeDelegations({
          chain: args.chain,
          delegations: [args.delegation],
        });
        signedPayment = await deps.signPayment({
          account,
          parentPermissionContext,
          challenge: args.challenge,
          idempotencyKey, // SP-5 where the SDK threads it
        });
      } catch (err) {
        logSettlementDebug("facilitator sign", err);
        return unavailable("sign failed"); // nothing moved → fail over (SP-1)
      }

      // 3. NON-SETTLING /verify pre-check (§9.1) — the window in which
      //    trying a different rail is still safe.
      const verify = await deps
        .verify(facilitator, signedPayment, args.challenge)
        .catch((err) => {
          logSettlementDebug("facilitator verify threw", err);
          return { reachable: false, ok: false } as FacilitatorVerifyResult;
        });

      if (!verify.reachable) return unavailable("facilitator unreachable");
      if (!verify.ok) return unavailable("facilitator rejected payload");

      // 4. Hand back the signed payload as the proof. ACTUAL settlement
      //    happens when the orchestrator retries with X-PAYMENT and the
      //    seller forwards to /settle (Mode B). Past that retry, a non-200
      //    is terminal for the chain — never a fail-over.
      return {
        outcome: "settled",
        rail: "facilitator",
        proof: signedPayment, // the real X-PAYMENT envelope, not a tx hash
        settlesOnRetry: true, // marks Mode B for the orchestrator + receipt
        spentAtoms, // optimistic — see OQ-5
      };
    },
  };
}
