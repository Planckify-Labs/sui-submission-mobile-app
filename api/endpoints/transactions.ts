import { api } from "@/constants/configs/ky";
import type {
  TTransaction,
  TTransactionListResponse,
  TTransactionSearchParams,
} from "../types/transaction";
import { fetchById, searchItems } from "../utils/api-helpers";

export const transactionApi = {
  searchTransactions: (params: TTransactionSearchParams = {}) => {
    const searchParams = { take: 10, ...params };
    return searchItems<TTransactionListResponse>(
      api,
      "transactions/search",
      searchParams,
      "Failed to search transactions",
    );
  },

  getTransactionById: (id: string) =>
    fetchById<TTransaction>(
      api,
      "transactions",
      id,
      "Failed to fetch transaction",
    ),
};
