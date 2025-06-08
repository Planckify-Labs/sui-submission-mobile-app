import { blockchainApi } from "@/api/endpoints/blockchains";
import type {
  TBlockchain,
  TUseBlockchainsWithStorageOptions,
} from "@/api/types/blockchain";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

const BLOCKCHAIN_STORAGE_KEY = "cached_blockchains_with_storage";
const BLOCKCHAIN_TIMESTAMP_KEY = "cached_blockchains_with_storage_timestamp";
const CACHE_INVALIDATION_TIME = 24 * 60 * 60 * 1000;

export const useBlockchainsWithStorage = (
  options?: TUseBlockchainsWithStorageOptions,
) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const checkCacheValidity = async () => {
      try {
        const timestampStr = await AsyncStorage.getItem(
          BLOCKCHAIN_TIMESTAMP_KEY,
        );
        if (timestampStr) {
          const timestamp = parseInt(timestampStr, 10);
          const now = Date.now();

          if (now - timestamp > CACHE_INVALIDATION_TIME) {
            queryClient.invalidateQueries({ queryKey: ["blockchains"] });
            console.log("Blockchain cache invalidated due to age");
          }
        }
      } catch (error) {
        console.error("Failed to check blockchain cache validity:", error);
      }
    };

    checkCacheValidity();
  }, [queryClient]);

  return useQuery<TBlockchain[]>({
    queryKey: ["blockchains", options],
    queryFn: async () => {
      try {
        if (
          options?.forceRefresh ||
          options?.name ||
          options?.chainId ||
          options?.isEVM !== undefined ||
          options?.isActive !== undefined ||
          options?.cursor ||
          options?.take ||
          options?.isNativeCurrency
        ) {
          const response = await blockchainApi.searchBlockchains(options);
          console.log("Raw API Response (Search):", response);
          return response;
        }

        const cachedData = await AsyncStorage.getItem(BLOCKCHAIN_STORAGE_KEY);
        if (cachedData && !options?.forceRefresh) {
          console.log("Using cached blockchain data");
          return JSON.parse(cachedData);
        }

        const response = await blockchainApi.getBlockchainList();
        console.log("Raw API Response (All):", response);

        await AsyncStorage.setItem(
          BLOCKCHAIN_STORAGE_KEY,
          JSON.stringify(response),
        );
        await AsyncStorage.setItem(
          BLOCKCHAIN_TIMESTAMP_KEY,
          Date.now().toString(),
        );

        return response;
      } catch (error) {
        console.error("API Error:", error);

        try {
          const cachedData = await AsyncStorage.getItem(BLOCKCHAIN_STORAGE_KEY);
          if (cachedData) {
            console.log("Using cached blockchain data after API error");
            return JSON.parse(cachedData);
          }
        } catch (storageError) {
          console.error("Storage Error:", storageError);
        }

        throw error;
      }
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
};

export const useNativeTokensWithStorage = (
  options?: TUseBlockchainsWithStorageOptions,
) => {
  const {
    data: blockchains,
    isLoading,
    error,
  } = useBlockchainsWithStorage(options);

  const nativeTokens =
    blockchains?.flatMap(
      (blockchain) =>
        blockchain.tokens?.filter((token) => token.isNativeCurrency) || [],
    ) || [];

  return {
    data: nativeTokens,
    isLoading,
    error,
  };
};

export const useBlockchainByChainId = (chainId: number) => {
  const { data: blockchains, isLoading, error } = useBlockchainsWithStorage();

  const blockchain = blockchains?.find((chain) => chain.chainId === chainId);

  return {
    data: blockchain,
    isLoading,
    error,
  };
};

export const useNativeTokenForChainId = (chainId: number) => {
  const {
    data: blockchain,
    isLoading,
    error,
  } = useBlockchainByChainId(chainId);

  const nativeToken = blockchain?.tokens?.find(
    (token) => token.isNativeCurrency,
  );

  return {
    data: nativeToken,
    isLoading,
    error,
  };
};
