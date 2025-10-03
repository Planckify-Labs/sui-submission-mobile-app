export const purchasesQueryKeys = {
  all: ["purchases"] as const,
  lists: () => [...purchasesQueryKeys.all, "list"] as const,
  list: (filters: Record<string, unknown>) =>
    [...purchasesQueryKeys.lists(), filters] as const,
  byRefId: (refId: string) =>
    [...purchasesQueryKeys.all, "detail", refId] as const,
  byWallet: (walletAddress: string) =>
    [...purchasesQueryKeys.all, "by-wallet", walletAddress] as const,
  status: (refId: string) =>
    [...purchasesQueryKeys.all, "status", refId] as const,
} as const;
