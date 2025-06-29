import { transactionApi } from "@/api/endpoints/transactions";
import type {
  TTransaction,
  TTransactionSearchParams,
} from "@/api/types/transaction";
import { transactionsQueryKeys } from "@/constants/queryKeys/transactionsQueryKeys";
import { useQuery } from "@tanstack/react-query";

export const useTransactionSearch = (params: TTransactionSearchParams = {}) => {
  return useQuery({
    queryKey: transactionsQueryKeys.search(params),
    queryFn: async () => {
      try {
        const response = await transactionApi.searchTransactions(params);
        return response;
      } catch (error) {
        console.error("API Error:", error);
        throw error;
      }
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
};

export const useTransaction = (id: string) => {
  return useQuery({
    queryKey: transactionsQueryKeys.detail(id),
    queryFn: async () => {
      if (!id) {
        return {} as TTransaction;
      }

      try {
        const response = await transactionApi.getTransactionById(id);
        return response;
      } catch (error) {
        console.error("API Error:", error);
        throw error;
      }
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: !!id,
  });
};
