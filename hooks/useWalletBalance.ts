import { useFocusEffect } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import { formatUnits } from "viem";
import type { ChainConfig } from "@/constants/configs/chainConfig";
import QKEY_Wallets from "@/constants/queryKeys/walletQueryKeys";
import { getPublicClient } from "@/utils/clients";

export function useWalletBalance(
  address?: `0x${string}` | string,
  chain?: ChainConfig,
) {
  const enabled = Boolean(address && chain?.chain);
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => [QKEY_Wallets.balance, address, chain?.chain?.id] as const,
    [address, chain?.chain?.id],
  );

  const balanceQuery = useQuery({
    queryKey,
    queryFn: async () => {
      if (!address || !chain?.chain) return BigInt(0);
      const publicClient = getPublicClient(chain.chain);
      const balance = await publicClient.getBalance({
        address: address as `0x${string}`,
      });
      return balance;
    },
    enabled,
    refetchOnMount: true,
    refetchOnReconnect: true,
    staleTime: 15_000,
  });

  const refetchRef = useRef<() => void>(() => {});
  useEffect(() => {
    refetchRef.current = () => {
      queryClient.invalidateQueries({ queryKey });
    };
  }, [queryClient, queryKey]);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return undefined;
      refetchRef.current();
      return undefined;
    }, [enabled]),
  );

  useEffect(() => {
    if (!enabled) return;
    const handler = (state: AppStateStatus) => {
      if (state === "active") {
        refetchRef.current();
      }
    };
    const subscription = AppState.addEventListener("change", handler);
    return () => subscription.remove();
  }, [enabled]);

  const balanceFormatted = useMemo(() => {
    const decimals = chain?.chain.nativeCurrency?.decimals ?? 18;
    const asString = formatUnits(balanceQuery.data ?? BigInt(0), decimals);
    const [intPart, fracPart = ""] = asString.split(".");
    const truncated = fracPart.slice(0, 6);
    const trimmed = truncated.replace(/0+$/g, "");
    return trimmed ? `${intPart}.${trimmed}` : intPart;
  }, [balanceQuery.data, chain?.chain.nativeCurrency?.decimals]);

  return {
    balance: balanceFormatted,
    isLoading: balanceQuery.isLoading,
    isFetching: balanceQuery.isFetching,
    refetch: () => refetchRef.current(),
  };
}
