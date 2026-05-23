/**
 * Position reader dispatcher.
 *
 * Spec: docs/defi-strategies-spec.md §9.2 + §6 (services/defi/positions).
 *
 * Each adapter's `readPosition(walletAddress)` is authoritative for the
 * raw on-chain numbers. This module dispatches to the right adapter by
 * slug and (for adapters that need asset metadata) supplements the call
 * with extra args.
 *
 * The Aave adapter is the only one whose standalone `readPosition` is
 * insufficient — it needs `assetContract` to resolve the aToken via
 * the Pool Data Provider. We carry the asset hint through this module
 * so the executor pipeline doesn't have to know about that quirk.
 */

import type { Address } from "viem";
import {
  arbitrum,
  arbitrumSepolia,
  base,
  baseSepolia,
  mainnet,
  sepolia,
} from "viem/chains";
import { AaveV3Deployments, readAaveV3Position } from "../adapters/aaveV3";
import { getDefiAdapter } from "../registry";
import type { DefiPosition } from "../types";

export interface PositionReadInput {
  protocolSlug: string;
  walletAddress: string;
  /** EVM token contract for the position's underlying asset (e.g. USDC). */
  assetContract?: string;
  assetSymbol?: string;
  assetDecimals?: number;
  chainId?: number | string;
}

/**
 * Read the current on-chain state of a position. Returns `null` when
 * the adapter can't resolve (e.g. Aave without an asset hint, or the
 * position is empty).
 */
export async function readPosition(
  input: PositionReadInput,
): Promise<DefiPosition | null> {
  const adapter = getDefiAdapter(input.protocolSlug);
  if (!adapter) return null;

  // Aave needs the asset contract + chain to derive the aToken via
  // the Pool Data Provider. Use the specialized reader.
  if (input.protocolSlug.startsWith("aave-v3-") && input.assetContract) {
    const deploymentKey = aaveDeploymentKeyForSlug(input.protocolSlug);
    if (!deploymentKey) return null;
    const deployment = AaveV3Deployments[deploymentKey];
    const viemChain = aaveViemChainFor(deployment.chainId);
    if (!viemChain) return null;
    return readAaveV3Position({
      deployment,
      viemChain,
      walletAddress: input.walletAddress as Address,
      assetSymbol: input.assetSymbol ?? "USDC",
      assetContract: input.assetContract as Address,
      assetDecimals: input.assetDecimals ?? 6,
    });
  }

  // Default — let the adapter handle it.
  return adapter.readPosition(input.walletAddress);
}

function aaveDeploymentKeyForSlug(
  slug: string,
): keyof typeof AaveV3Deployments | null {
  switch (slug) {
    case "aave-v3-ethereum":
      return "ethereum";
    case "aave-v3-base":
      return "base";
    case "aave-v3-arbitrum":
      return "arbitrum";
    case "aave-v3-sepolia":
      return "ethereumSepolia";
    case "aave-v3-base-sepolia":
      return "baseSepolia";
    case "aave-v3-arbitrum-sepolia":
      return "arbitrumSepolia";
    default:
      return null;
  }
}

function aaveViemChainFor(chainId: number): import("viem").Chain | null {
  switch (chainId) {
    case 1:
      return mainnet;
    case 8453:
      return base;
    case 42161:
      return arbitrum;
    case 11155111:
      return sepolia;
    case 84532:
      return baseSepolia;
    case 421614:
      return arbitrumSepolia;
    default:
      return null;
  }
}
