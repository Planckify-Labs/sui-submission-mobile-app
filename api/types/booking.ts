export type TBooking = {
  id: string;
  walletAddress: string;
  product: {
    id: string;
    name: string;
    variant: {
      id: string;
      name: string;
      sku: string;
    };
    price: {
      amount: number;
      currency: string;
    };
  };
  payment: {
    token: {
      symbol: string;
      address: string;
      amount: string;
      blockchainId: string;
      blockchainName: string;
    };
    exchangeRate: {
      rate: number;
      lockedAt: string;
    };
  };
  status: "PENDING" | "COMPLETED" | "FAILED" | "EXPIRED";
  createdAt: string;
  expiresAt: string;
};

export type TBookingCreateRequest = {
  walletAddress: string;
  productVariantId: string;
  productPriceId: string;
  payment: {
    tokenAddress: string;
    blockchainId: string;
    exchangeRateId: number;
  };
};

export type TBookingListResponse = TBooking[];
