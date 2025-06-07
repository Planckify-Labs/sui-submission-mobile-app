import { tokenApi } from "@/api/endpoints/tokens";
import type { TToken } from "@/api/types/token";
import { useQuery } from "@tanstack/react-query";

export const BLOCKCHAIN_IDS = {
  ETHEREUM: "01JWN873AXDMDTY264P248RNEP",
  BSC: "01JWN873AXDMDTY264P248RNEP",
  POLYGON: "01JWN873AXDMDTY264P248RNEP",
} as const;

interface TUseTokensOptions {
  blockchainId?: string;
  symbol?: string;
  name?: string;
  isStablecoin?: boolean;
  isActive?: boolean;
}

export const useTokens = (options?: TUseTokensOptions) => {
  return useQuery<TToken[]>({
    queryKey: ["tokens", options],
    queryFn: async () => {
      try {
        if (options) {
          const response = await tokenApi.searchTokens(options);
          console.log("Raw API Response (Search):", response);
          return response;
        } else {
          const response = await tokenApi.getTokenList();
          console.log("Raw API Response (All):", response);
          return response;
        }
      } catch (error) {
        console.error("API Error:", error);
        throw error;
      }
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
};
