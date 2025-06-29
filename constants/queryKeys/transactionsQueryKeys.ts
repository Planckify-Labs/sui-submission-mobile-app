import type { TTransactionSearchParams } from "@/api/types/transaction";

export const transactionsQueryKeys = {
  all: ["transactions"] as const,
  search: (params: TTransactionSearchParams) =>
    [...transactionsQueryKeys.all, "search", params] as const,
  detail: (id: string) => [...transactionsQueryKeys.all, "detail", id] as const,
};
