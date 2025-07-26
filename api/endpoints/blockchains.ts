import { publicApi } from "@/constants/configs/ky";
import type { TBlockchain, TBlockchainListResponse } from "../types/blockchain";
import { fetchById, fetchList, searchItems } from "../utils/api-helpers";

export interface TBlockchainSearchParams {
  name?: string;
  chainId?: number;
  isEVM?: boolean;
  isActive?: boolean;
  take?: number;
  cursor?: string;
}

export const blockchainApi = {
  getBlockchainList: () =>
    fetchList<TBlockchainListResponse>(
      publicApi,
      "blockchains",
      "Failed to fetch blockchain list",
    ),

  searchBlockchains: (params: TBlockchainSearchParams = {}) => {
    const searchParams = { take: 10, ...params };
    return searchItems<TBlockchainListResponse>(
      publicApi,
      "blockchains/search",
      searchParams,
      "Failed to search blockchains",
    );
  },

  getBlockchainById: (id: string) =>
    fetchById<TBlockchain>(
      publicApi,
      "blockchains",
      id,
      "Failed to fetch blockchain by id",
    ),
};
