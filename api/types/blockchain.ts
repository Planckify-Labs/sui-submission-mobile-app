export type TBlockchain = {
  id: string;
  name: string;
  chainId: number;
  rpcUrl: string;
  blockExplorer: string;
  isEVM: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export interface TUseBlockchainsWithStorageOptions {
  name?: string;
  chainId?: number;
  isEVM?: boolean;
  isActive?: boolean;
  take?: number;
  cursor?: string;
  forceRefresh?: boolean;
  isNativeCurrency?: boolean;
}

export type TBlockchainListResponse = TBlockchain[];
