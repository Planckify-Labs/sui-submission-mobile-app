import type {
  TTransactionSearchParams,
  TTransactionType,
} from "@/api/types/transaction";

export const transactionsQueryKeys = {
  all: ["transactions"] as const,
  search: (params: TTransactionSearchParams) =>
    [...transactionsQueryKeys.all, "search", params] as const,
  history: (params: { type?: TTransactionType; take?: number }) =>
    [...transactionsQueryKeys.all, "history", JSON.stringify(params)] as const,
  detail: (id: string) => [...transactionsQueryKeys.all, "detail", id] as const,
};
