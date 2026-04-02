import { useFocusEffect } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import { erc20Abi, formatUnits } from "viem";
import { getPublicClient } from "@/utils/clients";
import { formatTokenAmount } from "@/utils/helperUtils";
import { useActiveNetwork } from "./useAssetExplorerState";
import { useBlockchainsWithStorage } from "./useBlockchainsWithStorage";
import { useUserAssets } from "./useUserAssets";
import { useWallet } from "./useWallet";

type TAssetBalance = {
  assetId: string;
  balance: string;
  isLoading: boolean;
};

export function useUserAssetsWithBalances() {
  const { userAssets, ...userAssetsMethods } = useUserAssets();
  const { activeWallet } = useWallet();
  const queryClient = useQueryClient();

  const { activeNetwork } = useActiveNetwork();
  const { data: blockchains } = useBlockchainsWithStorage();

  const selectedBlockchain = useMemo(() => {
    if (!blockchains || !activeNetwork) return null;
    return blockchains.find((b) => b.chainId.toString() === activeNetwork);
  }, [blockchains, activeNetwork]);

  const selectedChain = useMemo(() => {
    if (!selectedBlockchain) return null;
    return {
      id: selectedBlockchain.chainId,
      name: selectedBlockchain.name,
      nativeCurrency: {
        name: selectedBlockchain.tokens?.[0]?.name || "Ether",
        symbol: selectedBlockchain.tokens?.[0]?.symbol || "ETH",
        decimals: selectedBlockchain.tokens?.[0]?.decimals || 18,
      },
      rpcUrls: {
        default: { http: [selectedBlockchain.rpcUrl] },
        public: { http: [selectedBlockchain.rpcUrl] },
      },
    };
  }, [selectedBlockchain]);

  const queryKey = useMemo(
    () =>
      [
        "userAssetsBalances",
        activeWallet?.address,
        activeNetwork,
        userAssets.map((a) => a.id).join(","),
      ] as const,
    [activeWallet?.address, activeNetwork, userAssets],
  );

  const enabled = Boolean(
    activeWallet?.address && selectedChain && userAssets.length > 0,
  );

  const balancesQuery = useQuery({
    queryKey,
    queryFn: async (): Promise<TAssetBalance[]> => {
      if (!activeWallet?.address || !selectedChain) return [];

      const publicClient = getPublicClient(selectedChain);
      if (!publicClient) return [];

      const balancePromises = userAssets.map(async (asset) => {
        try {
          let balance: bigint;
          let decimals: number;

          if (
            !asset.contractAddress ||
            asset.contractAddress ===
              "0x0000000000000000000000000000000000000000"
          ) {
            // Native currency
            balance = await publicClient.getBalance({
              address: activeWallet.address as `0x${string}`,
            });
            decimals = selectedChain.nativeCurrency?.decimals ?? 18;
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
