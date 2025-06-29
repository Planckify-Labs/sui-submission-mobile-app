import { api } from "@/constants/configs/ky";
import type {
  TTransaction,
  TTransactionListResponse,
  TTransactionSearchParams,
} from "../types/transaction";

export const transactionApi = {
  searchTransactions: async ({
    senderAddress,
    recipientAddress,
    type,
    status,
    startDate,
    endDate,
    take = 10,
    cursor,
  }: TTransactionSearchParams = {}) => {
    try {
      const searchParams = new URLSearchParams();

      if (senderAddress) searchParams.append("senderAddress", senderAddress);
      if (recipientAddress)
        searchParams.append("recipientAddress", recipientAddress);
      if (type) searchParams.append("type", type);
      if (status) searchParams.append("status", status);
      if (startDate) searchParams.append("startDate", startDate);
      if (endDate) searchParams.append("endDate", endDate);
      if (take) searchParams.append("take", take.toString());
      if (cursor) searchParams.append("cursor", cursor);

      const response = await api
        .get("transactions/search", { searchParams })
        .json<TTransactionListResponse>();
      return response;
    } catch (error) {
      console.error("Failed to search transactions:", error);
      throw error;
    }
  },

  getTransactionById: async (id: string) => {
    try {
      const response = await api.get(`transactions/${id}`).json<TTransaction>();
      return response;
    } catch (error) {
      console.error("Failed to fetch transaction:", error);
      throw error;
    }
  },
};
