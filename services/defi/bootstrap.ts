/**
 * DeFi adapter bootstrap — phased registration.
 *
 * Spec: docs/defi-strategies-spec.md §5.3 / §17 / §24.5#3.
 *
 * Phase 1 (always-on): Aave v3 (Eth/Base/Arb), Lido (Mainnet), Curve
 * 3pool, Morpho Steakhouse USDC (Ethereum).
 *
 * Phase 2 (FEATURE_DEFI_PHASE_2 — default ON): Morpho Flagship USDC
 * Base, Jito SOL, Maple syrupUSDC (EVM mainnet + Base).
 *
 * Phase 3 (FEATURE_DEFI_PHASE_3 — default ON): Yearn v3 USDC,
 * EigenLayer (Eth/Holesky), Ethena sUSDe, GMX v2 Arbitrum.
 *
 * Testnet adapters register when `FEATURE_DEFI_TESTNET_ADAPTERS` is
 * on — used by QA so production user lists stay clean.
 */

import {
  FEATURE_DEFI_PHASE_2,
  FEATURE_DEFI_PHASE_3,
  FEATURE_DEFI_TESTNET_ADAPTERS,
} from "@/constants/configs/featureFlags";
import { walletKitRegistry } from "@/services/walletKit/registry";
import {
  AaveV3ArbitrumAdapter,
  AaveV3ArbitrumSepoliaAdapter,
  AaveV3BaseAdapter,
  AaveV3BaseSepoliaAdapter,
  AaveV3EthereumAdapter,
  AaveV3EthereumSepoliaAdapter,
} from "./adapters/aaveV3";
import { Curve3poolAdapter } from "./adapters/curve3pool";
import {
  EigenLayerEthereumAdapter,
  EigenLayerHoleskyAdapter,
} from "./adapters/eigenlayer";
import { EthenaEthereumAdapter } from "./adapters/ethena";
import { GmxV2ArbitrumAdapter } from "./adapters/gmxV2";
import { LidoHoleskyAdapter, LidoMainnetAdapter } from "./adapters/lido";
import {
  MapleSyrupUsdcBaseAdapter,
  MapleSyrupUsdcEthereumAdapter,
} from "./adapters/maple";
import {
  MorphoFlagshipUsdcBaseAdapter,
  MorphoSteakhouseUsdcEthAdapter,
  MorphoVaultAdapter,
} from "./adapters/morpho";
import { SolanaJitoAdapter } from "./adapters/solanaJito";
import {
  YearnV3EthereumAdapter,
  YearnV3UsdcEthereumAdapter,
} from "./adapters/yearnV3";
import { registerDefiAdapter } from "./registry";

let booted = false;

export function bootDefi(): void {
  if (booted) return;
  if (walletKitRegistry.getAll().length === 0) {
    // The DeFi registry has no signing capability of its own — every
    // adapter dispatches submission through `WalletKitAdapter`. Boot
    // order matters; fail loud per spec §24.5#3.
    throw new Error(
      "[bootDefi] walletKitRegistry is empty. Must boot wallets first.",
    );
  }

  // ── Phase 1 (always on) ──────────────────────────────────────────
  registerDefiAdapter(AaveV3EthereumAdapter);
  registerDefiAdapter(AaveV3BaseAdapter);
  registerDefiAdapter(AaveV3ArbitrumAdapter);
  registerDefiAdapter(LidoMainnetAdapter);
  registerDefiAdapter(Curve3poolAdapter);
  registerDefiAdapter(MorphoSteakhouseUsdcEthAdapter);
  registerDefiAdapter(MorphoVaultAdapter); // legacy slug alias

  // ── Phase 2 ──────────────────────────────────────────────────────
  if (FEATURE_DEFI_PHASE_2) {
    registerDefiAdapter(MorphoFlagshipUsdcBaseAdapter);
    registerDefiAdapter(SolanaJitoAdapter);
    registerDefiAdapter(MapleSyrupUsdcEthereumAdapter);
    registerDefiAdapter(MapleSyrupUsdcBaseAdapter);
  }

  // ── Phase 3 ──────────────────────────────────────────────────────
  if (FEATURE_DEFI_PHASE_3) {
    registerDefiAdapter(YearnV3UsdcEthereumAdapter);
    registerDefiAdapter(YearnV3EthereumAdapter); // legacy slug alias
    registerDefiAdapter(EigenLayerEthereumAdapter);
    registerDefiAdapter(EthenaEthereumAdapter);
    registerDefiAdapter(GmxV2ArbitrumAdapter);
  }

  // ── Testnet adapters (QA-only) ──────────────────────────────────
  if (FEATURE_DEFI_TESTNET_ADAPTERS) {
    registerDefiAdapter(AaveV3EthereumSepoliaAdapter);
    registerDefiAdapter(AaveV3BaseSepoliaAdapter);
    registerDefiAdapter(AaveV3ArbitrumSepoliaAdapter);
    registerDefiAdapter(LidoHoleskyAdapter);
    if (FEATURE_DEFI_PHASE_3) {
      registerDefiAdapter(EigenLayerHoleskyAdapter);
    }
  }

  booted = true;
}
