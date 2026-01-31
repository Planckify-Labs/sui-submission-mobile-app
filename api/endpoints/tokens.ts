import type {
  TokenListResponse,
  TToken,
  TTokenSearchParams,
} from "@/api/types/token";
import { publicApi } from "@/constants/configs/ky";
import {
  apiCall,
  fetchById,
  fetchList,
  searchItems,
} from "../utils/api-helpers";

const logTokenOperation = (operation: string, data?: any) => {
  console.log(`Token API: ${operation}`, data || "");
};

export const tokenApi = {
  getTokenList: () =>
    apiCall(async () => {
      const response = await fetchList<TokenListResponse>(
        publicApi,
        "tokens",
        "Failed to fetch token list",
      );
      return response;
    }, "Failed to fetch token list"),

  searchTokens: (params?: TTokenSearchParams) =>
    apiCall(async () => {
      const response = await searchItems<TokenListResponse>(
        publicApi,
        "tokens/search",
        params || {},
        "Failed to search tokens",
      );
      return response;
    }, "Failed to search tokens"),

  getTokenById: (id: string) =>
    apiCall(async () => {
      const response = await fetchById<TToken>(
        publicApi,
        "tokens",
        id,
        "Failed to fetch token by id",
      );
      return response;
    }, "Failed to fetch token by id"),
};
