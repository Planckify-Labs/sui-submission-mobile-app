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
import type { TWallet } from "@/constants/types/walletTypes";
import type { Namespace } from "@/services/chains/types";

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
/**
 * An "account" is a set of TWallet rows derived from the same BIP-39
 * mnemonic. Each row inside represents a single namespace (EVM, Solana,
 * …). Private-key imports have no shared seed, so they collapse to a
 * single-row account keyed by their address.
 *
 * The rest of the UI treats accounts — not individual wallet rows — as
 * the unit a user selects. The active wallet row within a selected
 * account is derived from the active chain's namespace (`walletFor`).
 */
export type WalletAccount = {
  /** Stable key for React lists. Derived from the first wallet's address. */
  id: string;
  /** Display name with per-namespace suffixes stripped (e.g. "Main Wallet"). */
  name: string;
  /** Rows that belong to this account, in insertion order (EVM → Solana). */
  wallets: TWallet[];
};

// Strip namespace-specific suffixes added by `defaultWalletNameFor`
// (e.g. "Main Wallet · ETH" → "Main Wallet"). Falls back to the
// original name when no known suffix is present.
function canonicalAccountName(name: string): string {
  return name.replace(/\s*[·•|-]\s*(ETH|SOL|SOLANA|ETHEREUM)\s*$/i, "").trim() ||
    name;
}

/**
 * Groups a flat wallet list into accounts. Wallets sharing a
 * `seedPhrase` collapse into one account; non-seeded wallets (private-
 * key imports) each form a single-row account keyed by their address.
 * Input order is preserved.
 */
export function groupWalletsIntoAccounts(wallets: TWallet[]): WalletAccount[] {
  const accountsBySeed = new Map<string, WalletAccount>();
  const accountOrder: string[] = [];
  const accountsById = new Map<string, WalletAccount>();

  for (const w of wallets) {
    const seed = typeof w.seedPhrase === "string" && w.seedPhrase.length > 0
      ? w.seedPhrase
      : null;
    if (seed) {
      const existing = accountsBySeed.get(seed);
      if (existing) {
        existing.wallets.push(w);
        continue;
      }
      const id = w.address;
      const account: WalletAccount = {
        id,
        name: canonicalAccountName(w.name || "Wallet"),
        wallets: [w],
      };
      accountsBySeed.set(seed, account);
      accountsById.set(id, account);
      accountOrder.push(id);
      continue;
    }
    // No seed → its own single-row account.
    const id = w.address;
    const account: WalletAccount = {
      id,
      name: canonicalAccountName(w.name || "Wallet"),
      wallets: [w],
    };
    accountsById.set(id, account);
    accountOrder.push(id);
  }

  return accountOrder
    .map((id) => accountsById.get(id))
    .filter((a): a is WalletAccount => !!a);
}

/**
 * Finds the wallet row inside `account` that matches `namespace`. Falls
 * back to the first row when no exact match exists — relevant for
 * private-key imports whose namespace may not match the active chain.
 */
export function walletForNamespace(
  account: WalletAccount,
  namespace: Namespace,
): TWallet {
  return (
    account.wallets.find((w) => w.namespace === namespace) ?? account.wallets[0]
  );
}

/**
 * Given a flat wallet list and an account id, returns the row that
 * represents the account's active selection for the given namespace.
 * Used by `setActiveAccount` to translate an account click into the
 * correct `TWallet` index.
 */
export function walletIndexForAccountAndNamespace(
  wallets: TWallet[],
  accountId: string,
  namespace: Namespace,
): number {
  const accounts = groupWalletsIntoAccounts(wallets);
  const account = accounts.find((a) => a.id === accountId);
  if (!account) return -1;
  const target = walletForNamespace(account, namespace);
  return wallets.findIndex((w) => w.address === target.address);
}

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
