import { blockchainApi } from "@/api/endpoints/blockchains";
import type {
  TBlockchain,
  TUseBlockchainsWithStorageOptions,
} from "@/api/types/blockchain";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";

const BLOCKCHAIN_STORAGE_KEY = "cached_blockchains_with_storage";
const BLOCKCHAIN_TIMESTAMP_KEY = "cached_blockchains_with_storage_timestamp";
const CACHE_INVALIDATION_TIME = 24 * 60 * 60 * 1000;
const BACKGROUND_REFRESH_INTERVAL = 5 * 60 * 1000;

export const useBlockchainsWithStorage = (
  options?: TUseBlockchainsWithStorageOptions,
) => {
  const queryClient = useQueryClient();

  const fetchAndCacheBlockchains = useCallback(async () => {
    try {
      const response = await blockchainApi.getBlockchainList();
      console.log("Background refresh: Fetched new blockchain data");

      await AsyncStorage.setItem(
        BLOCKCHAIN_STORAGE_KEY,
        JSON.stringify(response),
      );
      await AsyncStorage.setItem(
        BLOCKCHAIN_TIMESTAMP_KEY,
        Date.now().toString(),
      );

      queryClient.setQueryData(["blockchains"], response);
      return response;
    } catch (error) {
      console.error("Background refresh failed:", error);
      return null;
    }
  }, [queryClient]);

  useEffect(() => {
    let backgroundRefreshInterval: ReturnType<typeof setInterval>;

    const setupBackgroundRefresh = async () => {
      try {
        const timestampStr = await AsyncStorage.getItem(
          BLOCKCHAIN_TIMESTAMP_KEY,
        );
        const now = Date.now();
        const timestamp = timestampStr ? parseInt(timestampStr, 10) : 0;

        if (!timestampStr || now - timestamp > CACHE_INVALIDATION_TIME) {
          console.log("Cache invalid or expired, triggering refresh");
          await fetchAndCacheBlockchains();
        }
      } catch (error) {
        console.error("Failed to check cache validity:", error);
      }

      backgroundRefreshInterval = setInterval(async () => {
        console.log("Starting background refresh of blockchain data");
        await fetchAndCacheBlockchains();
      }, BACKGROUND_REFRESH_INTERVAL);
    };

    setupBackgroundRefresh();

    return () => {
      if (backgroundRefreshInterval) {
        clearInterval(backgroundRefreshInterval);
      }
    };
  }, [fetchAndCacheBlockchains]);

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
          console.log("Search query executed with options:", options);
          return response;
        }

        const cachedData = await AsyncStorage.getItem(BLOCKCHAIN_STORAGE_KEY);
        if (cachedData) {
          const parsedData = JSON.parse(cachedData);
          console.log("Using cached blockchain data");

          const timestampStr = await AsyncStorage.getItem(
            BLOCKCHAIN_TIMESTAMP_KEY,
          );
          const now = Date.now();
          const timestamp = timestampStr ? parseInt(timestampStr, 10) : 0;

          if (now - timestamp > BACKGROUND_REFRESH_INTERVAL) {
            console.log(
              "Cache older than refresh interval, triggering background update",
            );
            fetchAndCacheBlockchains();
          }

          return parsedData;
        }

        return (await fetchAndCacheBlockchains()) || [];
      } catch (error) {
        console.error("Query execution failed:", error);

        try {
          const cachedData = await AsyncStorage.getItem(BLOCKCHAIN_STORAGE_KEY);
          if (cachedData) {
            console.log("Using cached data as fallback after error");
            return JSON.parse(cachedData);
          }
        } catch (storageError) {
          console.error("Failed to read from cache:", storageError);
        }

        throw error;
      }
    },
    staleTime: BACKGROUND_REFRESH_INTERVAL,
    gcTime: CACHE_INVALIDATION_TIME,
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
