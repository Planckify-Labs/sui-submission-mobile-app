import type { TTokenSearchParams, TokenListResponse } from "@/api/types/token";
import { api } from "@/constants/configs/ky";

export const tokenApi = {
  getTokenList: async () => {
    try {
      console.log("Fetching all tokens...");
      const response = await api.get("tokens").json<TokenListResponse>();
      console.log("Token list response:", response);
      return response;
    } catch (error) {
      console.error("Failed to fetch token list:", error);
      throw error;
    }
  },
  searchTokens: async (params?: TTokenSearchParams) => {
    try {
      const searchParams = new URLSearchParams();
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined) {
            searchParams.append(key, value.toString());
          }
        });
      }
      console.log(
        "Searching tokens with params:",
        Object.fromEntries(searchParams.entries()),
      );
      const response = await api
        .get("tokens/search", { searchParams })
        .json<TokenListResponse>();
      console.log("Token search response:", response);
      return response;
    } catch (error) {
      console.error("Failed to search tokens:", error);
      throw error;
    }
  },
};
