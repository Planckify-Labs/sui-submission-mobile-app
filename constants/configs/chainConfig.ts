import {
  bsc,
  goerli,
  mainnet,
  polygon,
  polygonMumbai,
  type Chain as TChain,
} from "viem/chains";
import type { TSmartContract } from "@/api/types/blockchain";

export type ChainConfig =
  | {
      namespace: "eip155";
      chain: TChain;
      iconUrl?: string;
      isTestnet?: boolean;
      smartContracts?: TSmartContract[];
    }
  | {
      namespace: "solana";
      cluster: "mainnet-beta" | "devnet";
      rpcUrl: string;
      rpcSubscriptionsUrl?: string;
      iconUrl?: string;
      isTestnet?: boolean;
      smartContracts?: TSmartContract[];
    }
  | {
      namespace: "sui";
      network: "mainnet" | "testnet" | "devnet";
      rpcUrl: string;
      iconUrl?: string;
      isTestnet?: boolean;
      smartContracts?: TSmartContract[];
    };

export type EvmChainConfig = Extract<ChainConfig, { namespace: "eip155" }>;
export type SolanaChainConfig = Extract<ChainConfig, { namespace: "solana" }>;
export type SuiChainConfig = Extract<ChainConfig, { namespace: "sui" }>;

/**
 * Narrowing helper used as a stopgap while tasks 04–16 relocate
 * `activeChain.chain.*` reach-through into the `WalletKitAdapter` and
 * per-screen kit dispatch. Throws when called on a non-EVM chain so
 * callers that haven't migrated yet still fail loud rather than silently
 * passing `undefined` into viem.
 *
 * Prefer `if (chain.namespace === "eip155")` at the boundary of new code.
 */
export function assertEvmChain(chain: ChainConfig): EvmChainConfig {
  if (chain.namespace !== "eip155") {
    throw new Error(
      `assertEvmChain: expected EVM chain, got namespace=${chain.namespace}`,
    );
  }
  return chain;
}

/** Filters `supportedChains` down to the EVM-only variants. */
export function getEvmSupportedChains(): EvmChainConfig[] {
  return supportedChains.filter(
    (c): c is EvmChainConfig => c.namespace === "eip155",
  );
}

/** Lookup an EVM chain by viem `chainId`. Ignores Solana entries. */
export function findEvmChainById(chainId: number): EvmChainConfig | undefined {
  return getEvmSupportedChains().find((c) => c.chain.id === chainId);
}

/**
 * Mirror of {@link assertEvmChain} for Sui. Throws if `chain.namespace`
 * is not `"sui"` so callers that haven't migrated still fail loud.
 */
export function assertSuiChain(chain: ChainConfig): SuiChainConfig {
  if (chain.namespace !== "sui") {
    throw new Error(
      `assertSuiChain: expected Sui chain, got namespace=${chain.namespace}`,
    );
  }
  return chain;
}

/**
 * Static frontend defaults — used as the initial `activeChain` before
 * the backend `blockchains` feed resolves, and as a fallback for any
 * UI that needs a sensible list before the query settles. Solana rows
 * are NOT listed here: v2.3.0 onward, the backend `/blockchains`
 * endpoint returns Solana alongside EVM (via `isEVM: false`) and
 * `ChainSelector` / `buildChainConfigFromBlockchain` consume it
 * directly. Mirrors how EVM chains are served.
 */
export const supportedChains: ChainConfig[] = [
  {
    namespace: "eip155",
    chain: mainnet,
    iconUrl:
      "https://ethereum.org/static/6b935ac0e6194247347855dc3d328e83/13c43/eth-diamond-black.png",
  },
  {
    namespace: "eip155",
    chain: polygon,
    iconUrl: "https://polygon.technology/favicon.ico",
  },
  {
    namespace: "eip155",
    chain: bsc,
    iconUrl: "https://bscscan.com/images/svg/brands/bnb.svg",
  },
  {
    namespace: "eip155",
    chain: goerli,
    iconUrl:
      "https://ethereum.org/static/6b935ac0e6194247347855dc3d328e83/13c43/eth-diamond-black.png",
    isTestnet: true,
  },
  {
    namespace: "eip155",
    chain: polygonMumbai,
    iconUrl: "https://polygon.technology/favicon.ico",
    isTestnet: true,
  },
  // Sui mainnet — public Mysten fullnode is the v1 endpoint. Swap for a
  // paid provider via re-seed once mobile traffic warrants. Testnet /
  // devnet rows arrive via the backend `/blockchains` feed.
  {
    namespace: "sui",
    network: "mainnet",
    rpcUrl: "https://fullnode.mainnet.sui.io:443",
    iconUrl: "https://sui.io/favicon.ico",
    isTestnet: false,
  },
];
