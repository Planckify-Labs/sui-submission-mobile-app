export type TTransactionType = "TRANSFER" | "PAYMENT";

export type TTransactionStatus =
  | "PENDING"
  | "COMPLETED"
  | "FAILED"
  | "PROCESSING";

export interface TBlockchainInToken {
  name: string;
  blockExplorer: string;
  tokens: {
    id: string;
    name: string;
    symbol: string;
    decimals: number;
    blockchainId: string;
    contractAddress: string | null;
    logoUrl: string;
    isStablecoin: boolean;
    isActive: boolean;
    isNativeCurrency: boolean;
    createdAt: string;
    updatedAt: string;
  }[];
}

export interface TToken {
  blockchain: TBlockchainInToken;
  contractAddress: string;
  name: string;
  symbol: string;
  decimals: number;
  logoUrl: string;
}

export interface TProductVariantInPurchase {
  name: string;
  product: {
    id: string;
    imageUrl: string;
  };
}

export interface TPurchase {
  id: string;
  transactionId: string;
  transactionCreatedAt: string;
  productVariantId: string;
  bookingOrderId?: string;
  status: TTransactionStatus;
  vendorResponse: any;
  vendorStatusResponse?: any;
  vendorRefId: string | null;
  refId?: string;
  createdAt: string;
  updatedAt: string;
  productVariant: TProductVariantInPurchase;
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

export interface TCreateTransactionRequest {
  tokenId: string;
  type: TTransactionType;
  status?: TTransactionStatus;
  amount: string;
  amountInFiat?: string;
  fiatCurrency?: string;
  txHash?: string | null;
  fromAddress?: string;
  toAddress?: string;
}
