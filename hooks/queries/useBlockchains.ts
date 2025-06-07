import { blockchainApi } from "@/api/endpoints/blockchains";
import type { TBlockchain } from "@/api/types/blockchain";
import { useQuery } from "@tanstack/react-query";

interface TUseBlockchainsOptions {
  name?: string;
  chainId?: number;
  isEVM?: boolean;
  isActive?: boolean;
  take?: number;
  cursor?: string;
}

export const useBlockchains = (options?: TUseBlockchainsOptions) => {
  return useQuery<TBlockchain[]>({
    queryKey: ["blockchains", options],
    queryFn: async () => {
      try {
        if (
          options?.name ||
          options?.chainId ||
          options?.isEVM !== undefined ||
          options?.isActive !== undefined ||
          options?.cursor ||
          options?.take
        ) {
          const response = await blockchainApi.searchBlockchains(options);
          console.log("Raw API Response (Search):", response);
          return response;
        } else {
          const response = await blockchainApi.getBlockchainList();
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
