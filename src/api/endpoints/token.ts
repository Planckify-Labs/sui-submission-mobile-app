import { api } from "@/constants/configs/ky";
import type { TokenListResponse } from "@/src/api/types/token";

interface TTokenSearchParams {
  symbol?: string;
  name?: string;
  blockchainId?: string;
  contractAddress?: string;
  isStablecoin?: boolean;
  isActive?: boolean;
  take?: number;
  cursor?: string;
}

export const tokenApi = {
  getTokenList: async () => {
    try {
      const response = await api.get("tokens").json<TokenListResponse>();
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
      const response = await api
        .get("tokens/search", { searchParams })
        .json<TokenListResponse>();
      return response;
    } catch (error) {
      console.error("Failed to search tokens:", error);
      throw error;
    }
  },
};
