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
      logTokenOperation("Fetching all tokens");
      const response = await fetchList<TokenListResponse>(
        publicApi,
        "tokens",
        "Failed to fetch token list",
      );
      logTokenOperation("Token list response", response);
      return response;
    }, "Failed to fetch token list"),

  searchTokens: (params?: TTokenSearchParams) =>
    apiCall(async () => {
      logTokenOperation("Searching tokens with params", params);
      const response = await searchItems<TokenListResponse>(
        publicApi,
        "tokens/search",
        params || {},
        "Failed to search tokens",
      );
      logTokenOperation("Token search response", response);
      return response;
    }, "Failed to search tokens"),

  getTokenById: (id: string) =>
    apiCall(async () => {
      logTokenOperation("Fetching token by id", id);
      const response = await fetchById<TToken>(
        publicApi,
        "tokens",
        id,
        "Failed to fetch token by id",
      );
      logTokenOperation("Token by id response", response);
      return response;
    }, "Failed to fetch token by id"),
};
