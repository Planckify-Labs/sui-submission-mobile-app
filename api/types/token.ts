export interface TToken {
  id: string;
  name: string;
  symbol: string;
  decimals: number;
  blockchainId: string;
  contractAddress: string;
  logoUrl: string;
  isStablecoin: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type TokenListResponse = TToken[];
