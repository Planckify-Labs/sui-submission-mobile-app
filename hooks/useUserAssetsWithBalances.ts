import { useFocusEffect } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import { erc20Abi, formatUnits } from "viem";
import type { TCryptoAsset } from "@/constants/types/assetTypes";
import { formatTokenAmount } from "@/utils/helperUtils";
import { useUserAssets } from "./useUserAssets";
import { useWallet } from "./useWallet";

type AssetBalance = {
  assetId: string;
  balance: string;
  isLoading: boolean;
};

export function useUserAssetsWithBalances() {
  const { userAssets, ...userAssetsMethods } = useUserAssets();
  const { activeWallet, activeChain, getPublicClientForActiveChain } =
    useWallet();
  const queryClient = useQueryClient();

  const queryKey = useMemo(
    () =>
      [
        "userAssetsBalances",
        activeWallet?.address,
        activeChain?.chain?.id,
        userAssets.map((a) => a.id).join(","),
      ] as const,
    [activeWallet?.address, activeChain?.chain?.id, userAssets],
  );

  const enabled = Boolean(
    activeWallet?.address && activeChain?.chain && userAssets.length > 0,
  );

  const balancesQuery = useQuery({
    queryKey,
    queryFn: async (): Promise<AssetBalance[]> => {
      if (!activeWallet?.address || !activeChain?.chain) return [];

      const publicClient = getPublicClientForActiveChain();
      if (!publicClient) return [];

      const balancePromises = userAssets.map(async (asset) => {
        try {
          let balance: bigint;
          let decimals: number;

          if (
            !asset.contractAddress ||
            asset.contractAddress === "0x0000000000000000000000000000000000000000"
          ) {
            // Native currency
            balance = await publicClient.getBalance({
              address: activeWallet.address as `0x${string}`,
            });
            decimals = activeChain.chain.nativeCurrency?.decimals ?? 18;
          } else {
            // ERC-20 token
            balance = (await publicClient.readContract({
              address: asset.contractAddress as `0x${string}`,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [activeWallet.address as `0x${string}`],
            })) as bigint;

            // Use asset decimals if available, otherwise fetch from contract
            if (asset.decimals !== undefined) {
              decimals = asset.decimals;
            } else {
              try {
                decimals = (await publicClient.readContract({
                  address: asset.contractAddress as `0x${string}`,
                  abi: erc20Abi,
                  functionName: "decimals",
                })) as number;
              } catch {
                decimals = 18; // Fallback to 18 if decimals call fails
              }
            }
          }

          const formatted = formatUnits(balance, decimals);
          const balanceFormatted = formatTokenAmount(formatted, {
            simplify: false,
          });

          return {
            assetId: asset.id,
            balance: balanceFormatted,
            isLoading: false,
          };
        } catch (error) {
          console.error(`Error fetching balance for ${asset.symbol}:`, error);
          return {
            assetId: asset.id,
            balance: "0",
            isLoading: false,
          };
        }
      });

      return Promise.all(balancePromises);
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

  const userAssetsWithBalances = useMemo(() => {
    const balanceMap = new Map<string, string>();
    balancesQuery.data?.forEach((b) => {
      balanceMap.set(b.assetId, b.balance);
    });

    return userAssets.map((asset) => ({
      ...asset,
      balance: balanceMap.get(asset.id) ?? asset.balance,
    }));
  }, [userAssets, balancesQuery.data]);

  return {
    userAssets: userAssetsWithBalances,
    isLoadingBalances: balancesQuery.isLoading,
    isFetchingBalances: balancesQuery.isFetching,
    refetchBalances: () => refetchRef.current(),
    ...userAssetsMethods,
  };
}
