export interface TTakumiTransaction {
  walletAddress: `0x${string}`;
  tokenAddress: `0x${string}`;
  bookingId: string;
  exchangeRateId: bigint;
  productVariantId: string;
  timestamp: bigint;
  refId: string;
  amount: bigint;
}

export interface TCreateTransactionParams {
  bookingId: string;
  exchangeRateId: bigint;
  productVariantId: string;
  tokenAddress: `0x${string}`;
  refId: string;
  amount: string;
  tokenDecimals: number;
}

export interface TGetTransactionsByAddressParams {
  user: `0x${string}`;
  offset: bigint;
  limit: bigint;
}

export interface TGetTransactionsInRangeParams {
  start: bigint;
  end: bigint;
  offset: bigint;
  limit: bigint;
}

export interface TGetUserTransactionsParams {
  offset: bigint;
  limit: bigint;
}

export interface TWithdrawParams {
  token: `0x${string}`;
  to: `0x${string}`;
  amount: bigint;
}

export interface TWithdrawAllParams {
  token: `0x${string}`;
  to: `0x${string}`;
}

export type TDepositPointsParams = {
  tokenAddress: `0x${string}`;
  refId: string;
  amount: string; // Raw token amount in smallest unit
  tokenDecimals: number;
};

export type TPointDeposit = {
  walletAddress: `0x${string}`;
  tokenAddress: `0x${string}`;
  amount: bigint;
  refId: string;
  timestamp: bigint;
};

export interface TTakumiWalletEvents {
  AdminAdded: {
    admin: `0x${string}`;
  };
  AdminRemoved: {
    admin: `0x${string}`;
  };
  TransactionCreated: {
    txId: bigint;
    walletAddress: `0x${string}`;
    tokenAddress: `0x${string}`;
    bookingId: string;
    exchangeRateId: bigint;
    productVariantId: string;
    timestamp: bigint;
    refId: string;
    amount: bigint;
  };
  NativeDeposit: {
    from: `0x${string}`;
    amount: bigint;
  };
  Withdraw: {
    to: `0x${string}`;
    token: `0x${string}`;
    amount: bigint;
  };
}
