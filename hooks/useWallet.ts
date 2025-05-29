import { usePerformance } from "@/components/providers/PerformanceProvider";
import { ChainConfig, supportedChains } from "@/constants/configs/chainConfig";
import QKEY_Wallets from "@/constants/queryKeys/walletQueryKeys";
import { TWallet, TWalletCreationParams } from "@/constants/types/walletTypes";
import * as walletService from "@/services/walletService";
import { getPublicClient, getWalletClient } from "@/utils/clients";
import { createWalletFromParams } from "@/utils/walletUtils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useMemo } from "react";
import { Alert, InteractionManager } from "react-native";
import { Account, PublicClient, WalletClient } from "viem";

export function useWallet() {
  const { deferredTask } = usePerformance();
  const queryClient = useQueryClient();

  const { data: wallets = [], isLoading } = useQuery({
    queryKey: [QKEY_Wallets.wallets],
    queryFn: async () => {
      return await deferredTask(async () => {
        return await walletService.loadWalletsFromStorage();
      }, "Loading wallets");
    },
  });

  const { data: activeWalletIndex = 0 } = useQuery({
    queryKey: [QKEY_Wallets.activeWalletIndex],
    queryFn: async () => {
      try {
        const storedIndex = await SecureStore.getItemAsync(
          "active_wallet_index",
        );
        return storedIndex ? parseInt(storedIndex, 10) : 0;
      } catch (error) {
        console.error("Failed to load active wallet index:", error);
        return 0;
      }
    },
    initialData: 0,
  });

  const { data: activeChain = supportedChains[0] } = useQuery({
    queryKey: [QKEY_Wallets.activeChain],
    queryFn: async () => {
      try {
        const storedChain = await SecureStore.getItemAsync("active_chain");
        if (storedChain) {
          return JSON.parse(storedChain) as ChainConfig;
        }
        return supportedChains[0];
      } catch (error) {
        console.error("Failed to load active chain:", error);
        return supportedChains[0];
      }
    },
    initialData: supportedChains[0],
  });

  const activeWallet = useMemo(
    () => wallets[activeWalletIndex] || ({} as TWallet),
    [wallets, activeWalletIndex],
  );

  const saveWalletsMutation = useMutation({
    mutationFn: async (updatedWallets: TWallet[]) => {
      const success = await walletService.saveWalletsToStorage(updatedWallets);
      if (!success) throw new Error("Failed to save wallets");
      return updatedWallets;
    },
    onSuccess: (data) => {
      queryClient.setQueryData([QKEY_Wallets.wallets], data);
    },
    onError: (error) => {
      console.error("Failed to save wallets:", error);
      Alert.alert("Error", "Failed to save wallet information");
    },
  });

  const setActiveWalletMutation = useMutation({
    mutationFn: async (index: number) => {
      await SecureStore.setItemAsync("active_wallet_index", index.toString());
      return index;
    },
    onSuccess: (index) => {
      queryClient.setQueryData([QKEY_Wallets.activeWalletIndex], index);
    },
    onError: (error) => {
      console.error("Failed to save active wallet index:", error);
    },
  });

  const setActiveChainMutation = useMutation({
    mutationFn: async (chain: ChainConfig) => {
      await SecureStore.setItemAsync("active_chain", JSON.stringify(chain));
      return chain;
    },
    onSuccess: (chain) => {
      queryClient.setQueryData([QKEY_Wallets.activeChain], chain);
    },
    onError: (error) => {
      console.error("Failed to save active chain:", error);
    },
  });

  const saveWallets = useCallback(
    async (updatedWallets: TWallet[]) => {
      try {
        await saveWalletsMutation.mutateAsync(updatedWallets);
        return true;
      } catch {
        return false;
      }
    },
    [saveWalletsMutation],
  );

  const setActiveWallet = useCallback(
    (index: number) => {
      setActiveWalletMutation.mutate(index);
    },
    [setActiveWalletMutation],
  );

  const addWallet = useCallback(
    async (walletData: TWalletCreationParams) => {
      return await deferredTask(async () => {
        const wallet = createWalletFromParams(walletData);
        if (!wallet) return false;

        const updatedWallets = [...wallets, wallet];
        const success = await saveWallets(updatedWallets);
        if (success) {
          setActiveWallet(updatedWallets.length - 1);
        }
        return success;
      }, "Adding wallet");
    },
    [wallets, saveWallets, deferredTask, setActiveWallet],
  );

  const updateWallet = useCallback(
    async (index: number, updatedWallet: TWallet) => {
      if (index < 0 || index >= wallets.length) return false;

      const updatedWallets = [...wallets];
      updatedWallets[index] = updatedWallet;
      return await saveWallets(updatedWallets);
    },
    [wallets, saveWallets],
  );

  const removeWallet = useCallback(
    async (index: number) => {
      if (index < 0 || index >= wallets.length) return false;

      const updatedWallets = wallets.filter((_, i) => i !== index);
      const success = await saveWallets(updatedWallets);

      if (success && activeWalletIndex >= updatedWallets.length) {
        setActiveWallet(Math.max(0, updatedWallets.length - 1));
      }

      return success;
    },
    [wallets, activeWalletIndex, saveWallets, setActiveWallet],
  );

  const changeActiveChain = useCallback(
    async (chainId: number) => {
      const chain = supportedChains.find(
        (c: ChainConfig) => c.chain.id === chainId,
      );
      if (chain) {
        try {
          await setActiveChainMutation.mutateAsync(chain);
          return true;
        } catch {
          return false;
        }
      }
      return false;
    },
    [setActiveChainMutation],
  );

  const getWalletAccount = useCallback(
    async (walletIndex: number) => {
      if (walletIndex < 0 || walletIndex >= wallets.length) return null;

      const wallet = wallets[walletIndex];

      return await deferredTask(() => {
        return walletService.getAccountForWallet(wallet);
      }, "Getting wallet account");
    },
    [wallets, deferredTask],
  );

  const loadWallets = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [QKEY_Wallets.wallets] });
  }, [queryClient]);

  const loadActiveChain = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [QKEY_Wallets.activeChain] });
  }, [queryClient]);

  const getClientForActiveWallet = useCallback((): WalletClient | null => {
    if (!activeWallet?.address) return null;

    const account = walletService.getAccountForWallet(activeWallet);
    if (!account) return null;

    return getWalletClient(account as Account, activeChain.chain);
  }, [activeWallet, activeChain]);

  const getPublicClientForActiveChain = useCallback((): PublicClient => {
    return getPublicClient(activeChain.chain);
  }, [activeChain]);

  useEffect(() => {
    InteractionManager.runAfterInteractions(() => {
      loadWallets();
      loadActiveChain();
      queryClient.invalidateQueries({
        queryKey: [QKEY_Wallets.activeWalletIndex],
      });
    });

    return () => {
      walletService.clearAccountCache();
    };
  }, [loadWallets, loadActiveChain, queryClient]);

  return {
    wallets,
    activeWallet,
    activeWalletIndex,
    isLoading,
    activeChain,
    setActiveWallet,
    loadWallets,
    saveWallets,
    addWallet,
    updateWallet,
    removeWallet,
    changeActiveChain,
    getWalletAccount,
    getClientForActiveWallet,
    getPublicClientForActiveChain,
  };
}
