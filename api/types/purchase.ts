export type TPurchaseCreateRequest = {
  refId: string;
  walletAddress: string;
  bookingId: string;
  contractAddress: string;
  networkId: string;
  transactionHash: string;
};

export type TVendorResponse = {
  code: number;
  data: {
    trx_code: string;
    selling_total: number;
    transaction_status: "PENDING" | "SUCCESS" | "FAILED";
  };
  status: "SUCCESS" | "FAILED";
  rc_code: string;
};

export type TProduct = {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  code: string;
  categoryId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TProductVariant = {
  id: string;
  name: string;
  description: string;
  sku: string;
  productId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  subCategoryId: string | null;
  product: TProduct;
};

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
  isTestnet: boolean;
};

export type TToken = {
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
  blockchain: TBlockchain;
};

export type TTransaction = {
  id: string;
  userId: string;
  tokenId: string;
  type: "PAYMENT" | "DEPOSIT" | "WITHDRAWAL";
  status: "PENDING" | "CONFIRMED" | "FAILED";
  amount: string;
  amountInFiat: string;
  fiatCurrency: string;
  txHash: string;
  senderAddress: string;
  recipientAddress: string;
  createdAt: string;
  updatedAt: string;
  token: TToken;
};

export type TBooking = {
  id: string;
  createdAt: string;
  customerInfo: Array<{
    key: string;
    value: string;
  }>;
};

export type TPurchaseCompleted = {
  id: string;
  status: "PENDING" | "COMPLETED" | "FAILED";
  transactionId: string;
  productVariantId: string;
  refId: string;
  createdAt: string;
  updatedAt: string;
  transaction: TTransaction;
  productVariant: TProductVariant;
  voucherCode?: string;
  booking: TBooking;
};

export type TPurchaseInitialResponse = {
  refId: string;
  status: "PENDING";
  message: string;
  processingStatus: "queued" | "processing" | "completed" | "failed";
  jobId: string;
  bookingId: string;
  estimatedProcessingTime: string;
};

export type TPurchaseResponse = TPurchaseInitialResponse | TPurchaseCompleted;
