import { tokenApi } from "@/api/endpoints/tokens";
import type { TToken, TTokenSearchParams } from "@/api/types/token";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";

const TOKEN_STORAGE_KEY = "cached_tokens";
const TOKEN_TIMESTAMP_KEY = "cached_tokens_timestamp";
const CACHE_INVALIDATION_TIME = 24 * 60 * 60 * 1000;
const BACKGROUND_REFRESH_INTERVAL = 5 * 60 * 1000;

export const useTokens = (options?: TTokenSearchParams) => {
  const queryClient = useQueryClient();

  const fetchAndCacheTokens = useCallback(async () => {
    try {
      const response = await tokenApi.getTokenList();
      await AsyncStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(response));
      await AsyncStorage.setItem(TOKEN_TIMESTAMP_KEY, Date.now().toString());
      queryClient.setQueryData(["tokens"], response);
      return response;
    } catch (error) {
      console.error("Failed to fetch and cache tokens:", error);
      return null;
    }
  }, [queryClient]);

  useEffect(() => {
    let backgroundRefreshInterval: ReturnType<typeof setInterval>;

    const setupBackgroundRefresh = async () => {
      try {
        const timestampStr = await AsyncStorage.getItem(TOKEN_TIMESTAMP_KEY);
        const now = Date.now();
        const timestamp = timestampStr ? parseInt(timestampStr, 10) : 0;

        if (!timestampStr || now - timestamp > CACHE_INVALIDATION_TIME) {
          await fetchAndCacheTokens();
        }
      } catch (error) {
        console.error("Failed to check token cache validity:", error);
      }

      backgroundRefreshInterval = setInterval(
        fetchAndCacheTokens,
        BACKGROUND_REFRESH_INTERVAL,
      );
    };

    setupBackgroundRefresh();

    return () => {
      if (backgroundRefreshInterval) {
        clearInterval(backgroundRefreshInterval);
      }
    };
  }, [fetchAndCacheTokens]);

  return useQuery<TToken[]>({
    queryKey: ["tokens", options],
    queryFn: async () => {
      try {
        if (
          options &&
          (options.name || options.symbol || options.contractAddress)
        ) {
          return await tokenApi.searchTokens(options);
        }

        const cachedData = await AsyncStorage.getItem(TOKEN_STORAGE_KEY);
        if (cachedData) {
          const parsedData: TToken[] = JSON.parse(cachedData);

          let filteredData = parsedData;
          if (options) {
            filteredData = parsedData.filter((token) => {
              if (
                options.blockchainId &&
                token.blockchainId !== options.blockchainId
              )
                return false;
              if (
                options.isStablecoin !== undefined &&
                token.isStablecoin !== options.isStablecoin
              )
                return false;
              if (
                options.isActive !== undefined &&
                token.isActive !== options.isActive
              )
                return false;
              return true;
            });
          }

          const timestampStr = await AsyncStorage.getItem(TOKEN_TIMESTAMP_KEY);
          const now = Date.now();
          const timestamp = timestampStr ? parseInt(timestampStr, 10) : 0;

          if (now - timestamp > BACKGROUND_REFRESH_INTERVAL) {
            fetchAndCacheTokens();
          }

          return filteredData;
        }

        return (await fetchAndCacheTokens()) || [];
      } catch (error) {
        console.error("Failed to fetch tokens:", error);

        try {
          const cachedData = await AsyncStorage.getItem(TOKEN_STORAGE_KEY);
          if (cachedData) {
            return JSON.parse(cachedData);
          }
        } catch (storageError) {
          console.error("Failed to read from token cache:", storageError);
        }

        throw error;
      }
    },
    staleTime: BACKGROUND_REFRESH_INTERVAL,
    gcTime: CACHE_INVALIDATION_TIME,
  });
};
