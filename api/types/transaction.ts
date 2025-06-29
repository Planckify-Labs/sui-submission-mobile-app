export type TTransactionType = "SEND" | "RECEIVE" | "PAYMENT";

export type TTransactionStatus = "PENDING" | "COMPLETED" | "FAILED";

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
  isNativeCurrency: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TPurchase {
  id: string;
  transactionId: string;
  productVariantId: string;
  status: TTransactionStatus;
  vendorResponse: any;
  vendorRefId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TTransaction {
  id: string;
  userId: string;
  tokenId: string;
  type: TTransactionType;
  status: TTransactionStatus;
  amount: string;
  amountInFiat: string;
  fiatCurrency: string;
  txHash: string | null;
  senderAddress: string;
  recipientAddress: string;
  createdAt: string;
  updatedAt: string;
  token: TToken;
  purchase?: TPurchase;
}

export interface TTransactionSearchParams {
  senderAddress?: string;
  recipientAddress?: string;
  type?: TTransactionType;
  status?: TTransactionStatus;
  startDate?: string;
  endDate?: string;
  take?: number;
  cursor?: string;
}

export type TTransactionListResponse = TTransaction[];
