// --- Request types ---

export type TPointPriceParams = {
  tokenId: string;
  currency: string;
};

export type TPointDepositRequest = {
  refId: string;
  txHash: string;
  tokenId: string;
  blockchainId: string;
  contractAddress: string;
  walletAddress: string;
  tokenAmount: string;
  expectedPoints: string;
};

export type TPointHistoryParams = {
  type?: "DEPOSIT" | "SPEND" | "REFUND" | "BONUS";
  status?: "PENDING" | "CONFIRMED" | "COMPLETED" | "FAILED";
  cursor?: string;
  limit?: number;
};

// --- Response types ---

export type TPointPriceResponse = {
  pointPrice: string;
  currency: string;
  token: {
    id: string;
    symbol: string;
    name: string;
    decimals: number;
    priceInCurrency: string;
  };
  pointsPerToken: string;
  tokenPerPoint: string;
  minimumPoints: number;
  minimumTokenAmount: string;
  updatedAt: string;
};

export type TPointBalanceResponse = {
  userId: string;
  balance: string;
};

export type TPointDepositResponse = {
  id: string;
  status: "PENDING" | "CONFIRMED" | "COMPLETED" | "FAILED";
  refId: string;
  message: string;
};

export type TPointDepositStatusResponse = {
  id: string;
  status: "PENDING" | "CONFIRMED" | "COMPLETED" | "FAILED";
  amount: string;
  refId: string;
  createdAt: string;
};

export type TPointTransaction = {
  id: string;
  type: "DEPOSIT" | "SPEND" | "REFUND" | "BONUS";
  amount: string;
  balanceBefore: string;
  balanceAfter: string;
  status: "PENDING" | "CONFIRMED" | "COMPLETED" | "FAILED";
  tokenAmount?: string;
  tokenSymbol?: string;
  txHash?: string;
  refId?: string;
  referenceType?: string;
  referenceId?: string;
  createdAt: string;
};

export type TPointHistoryResponse = {
  data: TPointTransaction[];
  nextCursor: string | null;
  hasMore: boolean;
};
