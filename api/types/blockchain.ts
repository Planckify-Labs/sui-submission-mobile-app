import { TToken } from "./token";

export type TBlockchain = {
  id: string;
  name: string;
  /**
   * EVM numeric chainId, or `null` for non-EVM networks (e.g. Solana).
   * Narrow with `typeof chainId === "number"` at EVM-only call sites.
   */
  chainId: number | null;
  rpcUrl: string;
  blockExplorer: string;
  isEVM: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  tokens?: TToken[];
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
