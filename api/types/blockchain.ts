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

export type TBlockchainListResponse = TBlockchain[];
