export const addressBookQueryKeys = {
  all: ["address-book"] as const,
  list: (walletAddress: string) =>
    [...addressBookQueryKeys.all, "list", walletAddress] as const,
  detail: (id: string) => [...addressBookQueryKeys.all, "detail", id] as const,
};
