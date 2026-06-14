/**
 * `evm/rails/bootstrap` — registers the EVM settlement rails into the
 * `services/x402/settlement` registry (x402-extensibility-spec §10.3).
 *
 * Mirrors `services/walletKit/bootstrap.ts` (space docking, §3.2):
 * **ADD A RAIL = ADD ONE LINE HERE.** The registry itself needs no central
 * edit — `registerRail` is the docking point. Called from
 * `createEvmWalletKit()`; idempotent so re-creating the kit (tests) can't
 * duplicate a rail.
 *
 * No vendor host is compiled in (SP-6): the relayer's enabled chains come
 * from the EVM chain registry; per-rail construction params (fee cap,
 * facilitator allow-list) are sourced from the same API-driven on-device
 * override (`getCachedRailOverride`) so they're updatable without an app
 * release. Which rails are *active* (enable/disable/priority) is decided
 * live by the registry from `DEFAULT_SETTLEMENT_RAILS` + that override.
 */

import { getEvmSupportedChains } from "../../../../constants/configs/chainConfig.ts";
import { registerRail } from "../../../x402/settlement/registry.ts";
import { getCachedRailOverride } from "../../../x402/settlementRailConfigStore.ts";
import {
  createErc7710FacilitatorRail,
  type FacilitatorRailConfig,
} from "./Erc7710FacilitatorRail.ts";
import {
  createRelayerBroadcastRail,
  type RelayerRailConfig,
} from "./RelayerBroadcastRail.ts";

let booted = false;

export interface EvmSettlementRailsConfig {
  relayer?: Partial<RelayerRailConfig>;
  facilitator?: Partial<FacilitatorRailConfig>;
}

/** Parse an atoms string from the cached override; `undefined` if absent/bad. */
function feeCapFromOverride(railId: string): bigint | undefined {
  const raw = getCachedRailOverride()?.find(
    (c) => c.id === railId,
  )?.feeCapUsdcAtoms;
  if (typeof raw !== "string") return undefined;
  try {
    return BigInt(raw);
  } catch {
    return undefined;
  }
}

function allowedFacilitatorsFromOverride(railId: string): string[] | undefined {
  return getCachedRailOverride()?.find((c) => c.id === railId)
    ?.allowedFacilitators;
}

export function bootstrapEvmSettlementRails(
  config: EvmSettlementRailsConfig = {},
): void {
  if (booted) return;

  const enabledChainIds =
    config.relayer?.enabledChainIds ??
    getEvmSupportedChains().map((c) => c.chain.id);

  // Construction params: explicit (tests) wins, else the API-driven cache,
  // else the safe default. (Cold boot before the first refresh ⇒ default.)
  const relayerId = config.relayer?.id ?? "oneshot-relayer";
  const facilitatorId = config.facilitator?.id ?? "erc7710-facilitator";

  registerRail(
    createRelayerBroadcastRail({
      enabledChainIds,
      feeCapAtoms: feeCapFromOverride(relayerId),
      ...config.relayer,
    }),
  );

  registerRail(
    createErc7710FacilitatorRail({
      allowedFacilitators:
        config.facilitator?.allowedFacilitators ??
        allowedFacilitatorsFromOverride(facilitatorId) ??
        [],
      ...config.facilitator,
    }),
  );

  booted = true;
}

/** Test-only reset — pair with `__resetRailsForTests()` on the registry. */
export function __resetEvmSettlementRailsForTests(): void {
  booted = false;
}
