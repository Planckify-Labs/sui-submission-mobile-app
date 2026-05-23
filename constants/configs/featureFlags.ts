/**
 * Feature flags consumed by the DeFi Strategies feature.
 *
 * Spec: docs/defi-strategies-spec.md §22.2 / §17 phasing.
 *
 * Defaults are conservative:
 *   - DEFI_STRATEGIES: gates the entire `/strategies` surface + agent
 *     tool registrations.
 *   - DEFI_PHASE_2: gates the Phase 2 adapter set (Morpho-Base, Jito,
 *     Maple syrupUSDC EVM, LI.FI-driven cross-chain).
 *   - DEFI_PHASE_3: gates the Phase 3 adapter set (Yearn, EigenLayer,
 *     Ethena, GMX). Tier-cap and cooldown UI ride alongside.
 *   - DEFI_TESTNET_ADAPTERS: registers Aave Sepolia / Lido Holesky /
 *     EigenLayer Holesky adapters so QA flows can run against
 *     testnet without polluting production user lists.
 *   - DEFI_CROSS_CHAIN_REBALANCE: Phase-2 cross-chain rebalance UI
 *     (LI.FI-powered). Spec §22.2.
 */

function flag(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === "true") return true;
  if (raw === "false") return false;
  return defaultValue;
}

export const FEATURE_DEFI_STRATEGIES = flag(
  "EXPO_PUBLIC_DEFI_STRATEGIES",
  true,
);
export const FEATURE_DEFI_PHASE_2 = flag("EXPO_PUBLIC_FF_DEFI_PHASE_2", true);
export const FEATURE_DEFI_PHASE_3 = flag("EXPO_PUBLIC_FF_DEFI_PHASE_3", true);
export const FEATURE_DEFI_TESTNET_ADAPTERS = flag(
  "EXPO_PUBLIC_FF_DEFI_TESTNET_ADAPTERS",
  false,
);
export const FEATURE_DEFI_CROSS_CHAIN_REBALANCE = flag(
  "EXPO_PUBLIC_FF_CROSS_CHAIN_REBALANCE",
  false,
);
