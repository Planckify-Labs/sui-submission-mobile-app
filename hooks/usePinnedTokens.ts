import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import { TToken } from "@/api/types/token";
import QKEY_PinnedTokens from "@/constants/queryKeys/pinnedTokensQueryKeys";
import useRQGlobalState from "./useRQGlobalState";

const storePinnedTokens = async (tokens: TToken[]): Promise<void> => {
  try {
    await AsyncStorage.setItem(
      QKEY_PinnedTokens.persistent,
      JSON.stringify(tokens),
    );
  } catch (error) {
    console.error("Error storing pinned token data:", error);
    throw new Error("Failed to storing pinned token data");
  }
};

const getPersistentPinnedTokens = async (): Promise<TToken[]> => {
  try {
    const storedPinnedTokens = await AsyncStorage.getItem(
      QKEY_PinnedTokens.persistent,
    );
    return JSON.parse(storedPinnedTokens || "[]");
  } catch (error) {
    console.error("Error verifying PIN:", error);
    return [];
  }
};

export function usePinnedTokens() {
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const { data: pinnedTokens = [], setNewData } = useRQGlobalState<TToken[]>({
    queryKey: [QKEY_PinnedTokens.pinned],
    initialData: [],
  });

  const initWithExistingPinnedTokens = useCallback(async (): Promise<
    TToken[] | undefined
  > => {
    setIsLoading(true);
    try {
      const storedPinnedTokens = await getPersistentPinnedTokens();
      setNewData(storedPinnedTokens);
      setIsLoading(false);
    } catch (error) {
      console.error("Error checking for existing pinned tokens:", error);
      return undefined;
    }
  }, [setNewData]);

  useEffect(() => {
    initWithExistingPinnedTokens();
  }, [initWithExistingPinnedTokens]);

  const setPinnedTokens = useCallback(
    async (tokens: TToken[]) => {
      await storePinnedTokens(tokens);
      setNewData(tokens);
    },
    [setNewData],
  );

  return {
    isLoading,
    setPinnedTokens,
    pinnedTokens,
  };
}
