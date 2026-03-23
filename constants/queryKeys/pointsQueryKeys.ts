export const pointsQueryKeys = {
  all: ["points"] as const,
  balance: () => [...pointsQueryKeys.all, "balance"] as const,
  price: (tokenId: string, currency: string) =>
    [...pointsQueryKeys.all, "price", tokenId, currency] as const,
  history: (params?: Record<string, unknown>) =>
    [...pointsQueryKeys.all, "history", params] as const,
  depositStatus: (depositId: string) =>
    [...pointsQueryKeys.all, "deposit", depositId] as const,
};
