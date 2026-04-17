/**
 * Pure helpers extracted from `useWallet` so they can be exercised by
 * node test runner without pulling in react / react-native / expo.
 *
 * Per spec §7.5, `changeActiveChainInternal` owns the one allowed
 * namespace `if` in this layer because it's mapping backend
 * `TBlockchain` rows to the `ChainConfig` discriminated union. That's
 * data-shape translation, not behavior dispatch — dispatch belongs to
 * `WalletKitAdapter`.
 */

import type { ChainConfig } from "@/constants/configs/chainConfig";
import type { TBlockchain } from "@/api/types/blockchain";

/**
 * `TBlockchain` may gain a `namespace` field in a future API revision.
 * Until then we infer the namespace from `isEVM` (backend authoritative
 * flag) and fall back to name heuristics only for the cluster field of
 * Solana chains.
 */
type BlockchainWithMaybeNamespace = TBlockchain & {
  namespace?: "eip155" | "solana";
};

function resolveNamespace(b: BlockchainWithMaybeNamespace): "eip155" | "solana" {
  if (b.namespace === "solana") return "solana";
  if (b.namespace === "eip155") return "eip155";
  // `isEVM === false` is treated as Solana in v2.3.0 since Solana is
  // the only non-EVM chain the backend lists. If a future chain family
  // (e.g. Cosmos) lands before the backend adds `namespace`, this
  // heuristic must be revisited.
  if (b.isEVM === false) return "solana";
  return "eip155";
}

/**
 * Produces a stable discriminator string for a `ChainConfig` suitable
 * for use as a React Query cache key fragment. Reads the discriminant
 * of the union (namespace-specific field) without requiring callers to
 * `switch` on `namespace` inline — the single namespace branch lives
 * here, mirroring the §7.5 "data-shape mapping" exception used by
 * `buildChainConfigFromBlockchain`.
 */
export function chainCacheKey(chain: ChainConfig): string {
  if (chain.namespace === "eip155") {
    return `eip155:${chain.chain.id}`;
  }
  return `solana:${chain.cluster}`;
}

export function buildChainConfigFromBlockchain(
  blockchain: TBlockchain,
): ChainConfig {
  const b = blockchain as BlockchainWithMaybeNamespace;
  const namespace = resolveNamespace(b);

  if (namespace === "solana") {
    const cluster: "mainnet-beta" | "devnet" = b.name
      ?.toLowerCase()
      .includes("devnet")
      ? "devnet"
      : "mainnet-beta";
    return {
      namespace: "solana",
      cluster,
      rpcUrl: b.rpcUrl,
      iconUrl: b.tokens?.[0]?.logoUrl,
      isTestnet: cluster === "devnet",
    };
  }

  return {
    namespace: "eip155",
    chain: {
      id: b.chainId,
      name: b.name,
      nativeCurrency: {
        name: b.tokens?.[0]?.name || "Ether",
        symbol: b.tokens?.[0]?.symbol || "ETH",
        decimals: b.tokens?.[0]?.decimals || 18,
      },
      rpcUrls: {
        default: { http: [b.rpcUrl] },
        public: { http: [b.rpcUrl] },
      },
      blockExplorers: b.blockExplorer
        ? {
            default: {
              name: b.name,
              url: b.blockExplorer,
            },
          }
        : undefined,
    },
    iconUrl: b.tokens?.[0]?.logoUrl,
    isTestnet:
      b.name.toLowerCase().includes("testnet") ||
      b.name.toLowerCase().includes("sepolia") ||
      b.name.toLowerCase().includes("goerli"),
  };
}
