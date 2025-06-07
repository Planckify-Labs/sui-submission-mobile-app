import { api } from "@/constants/configs/ky";
import type { TBlockchainListResponse } from "../types/blockchain";

interface TBlockchainSearchParams {
  name?: string;
  chainId?: number;
  isEVM?: boolean;
  isActive?: boolean;
  take?: number;
  cursor?: string;
}

export const blockchainApi = {
  getBlockchainList: async () => {
    try {
      const response = await api
        .get("blockchains")
        .json<TBlockchainListResponse>();
      return response;
    } catch (error) {
      console.error("Failed to fetch blockchain list:", error);
      throw error;
    }
  },
  searchBlockchains: async ({
    name,
    chainId,
    isEVM,
    isActive,
    take = 10,
    cursor,
  }: TBlockchainSearchParams = {}) => {
    try {
      const searchParams = new URLSearchParams();

      if (name) searchParams.append("name", name);
      if (chainId !== undefined)
        searchParams.append("chainId", chainId.toString());
      if (isEVM !== undefined) searchParams.append("isEVM", isEVM.toString());
      if (isActive !== undefined)
        searchParams.append("isActive", isActive.toString());
      if (take) searchParams.append("take", take.toString());
      if (cursor) searchParams.append("cursor", cursor);

      const response = await api
        .get("blockchains/search", { searchParams })
        .json<TBlockchainListResponse>();
      return response;
    } catch (error) {
      console.error("Failed to search blockchains:", error);
      throw error;
    }
  },
};
