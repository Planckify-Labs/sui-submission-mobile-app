import type { TToken } from "./token";

export type TNativeCurrency = {
  symbol: string;
  decimals: number;
  address: string | null;
};

export type TGatewayContracts = {
  walletContract: string;
  minterContract: string;
};

export type TPaymaster = {
  address: string;
};

export type TX402Domain = {
  domainName: string;
  domainVersion: string;
  verifyingContract: string;
  facilitatorUrl: string | null;
};

export type TUsdcToken = {
  address: string;
  decimals: number;
  symbol: string;
  isNativeCurrency: boolean;
};

export type TSmartContract = {
  name: string;
  address: string;
};

export type TBlockchain = {
  id: string;
  name: string;
  /**
   * EVM numeric chainId, or `null` for non-EVM networks (e.g. Solana).
   * Narrow with `typeof chainId === "number"` at EVM-only call sites.
   */
  chainId: number | null;
  /**
   * Stable slug for non-EVM rows (e.g. `sui-mainnet`, `solana-devnet`).
   * Used by `resolveNamespace` to disambiguate Solana vs Sui — `isEVM:
   * false` alone collides on the same flag. Null on EVM rows.
   */
  chainSlug?: string | null;
  caip2Id?: string | null;
  rpcUrl: string;
  blockExplorer: string;
  isEVM: boolean;
  isActive: boolean;
  isTestnet: boolean;
  nativeCurrency?: TNativeCurrency | null;
  gateway?: TGatewayContracts | null;
  paymaster?: TPaymaster | null;
  x402?: TX402Domain | null;
  usdc?: TUsdcToken | null;
  tokens?: TToken[];
  smartContracts?: TSmartContract[];
  updatedAt: string;
};

export interface TUseBlockchainsWithStorageOptions {
  name?: string;
  chainId?: number;
  isEVM?: boolean;
  take?: number;
  cursor?: string;
  forceRefresh?: boolean;
  isNativeCurrency?: boolean;
  isActive: boolean;
}

export type TBlockchainListResponse = TBlockchain[];
