export type TBooking = {
  id: string;
  walletAddress: string;
  productId: string;
  product: {
    id: string;
    name: string;
    price: {
      amount: number;
      currency: string;
    };
  };
  payment: {
    token: {
      symbol: string;
      address: string;
      blockchainId: string;
    };
    blockchainName: string;
  };
  exchangeRate: {
    rate: number;
    lockedAt: string;
  };
  status: "PENDING" | "COMPLETED" | "FAILED" | "EXPIRED";
  createdAt: string;
  expiresAt: string;
};

export type TBookingCreateRequest = {
  walletAddress: string;
  productId: string;
  payment: {
    tokenAddress: string;
    blockchainId: string;
  };
};

export type TBookingListResponse = TBooking[];
