/**
 * DeFi agent executor registry.
 *
 * Spec: docs/defi-strategies-spec.md §11, §25.3.
 *
 * Reads wire through to the live `/strategies/*` backend so the
 * agent can discover opportunities and report on the user's open
 * positions. Writes are gated until the on-chain adapter set in
 * `services/defi/adapters/*` is fleshed out — see `./writes.ts`.
 */

import type { MobileToolExecutor } from "../types";
import { getConfig, listOpportunities, listPositions } from "./reads";
import { simulateDeposit } from "./simulate";
import {
  claim,
  compound,
  crossChainDeposit,
  deposit,
  rebalance,
  withdraw,
} from "./writes";

export const DEFI_EXECUTORS: Record<string, MobileToolExecutor> = {
  defi_list_opportunities: listOpportunities,
  defi_list_positions: listPositions,
  defi_get_config: getConfig,
  defi_simulate_deposit: simulateDeposit,
  defi_deposit: deposit,
  defi_withdraw: withdraw,
  defi_claim: claim,
  defi_rebalance: rebalance,
  defi_cross_chain_deposit: crossChainDeposit,
  defi_compound: compound,
};
