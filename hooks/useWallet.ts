import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";
import { InteractionManager } from "react-native";
import type { Account, PublicClient, WalletClient } from "viem";
import { usePerformance } from "@/components/providers/PerformanceProvider";
import {
  type ChainConfig,
  supportedChains,
} from "@/constants/configs/chainConfig";
import { transactionsQueryKeys } from "@/constants/queryKeys/transactionsQueryKeys";
import QKEY_Wallets from "@/constants/queryKeys/walletQueryKeys";
import type {
  TWallet,
  TWalletCreationParams,
} from "@/constants/types/walletTypes";
import { storage } from "@/lib/storage/mmkv";
import * as walletService from "@/services/walletService";
import { getPublicClient, getWalletClient } from "@/utils/clients";
import { createWalletFromParams } from "@/utils/walletUtils";
import { useBlockchainsWithStorage } from "./useBlockchainsWithStorage";

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
    queryFn: () => {
      const storedIndex = storage.getString("active_wallet_index");
      return storedIndex ? parseInt(storedIndex, 10) : 0;
    },
  });

  const { data: activeChain = supportedChains[0] } = useQuery({
    queryKey: [QKEY_Wallets.activeChain],
    queryFn: () => {
      const storedChain = storage.getString("active_chain");
      return storedChain
        ? (JSON.parse(storedChain) as ChainConfig)
        : supportedChains[0];
    },
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
      console.error("Error: Failed to save wallet information");
    },
  });

  const setActiveWalletMutation = useMutation({
    mutationFn: async (index: number) => {
      storage.set("active_wallet_index", index.toString());
      return index;
    },
    onSuccess: (index) => {
      queryClient.setQueryData([QKEY_Wallets.activeWalletIndex], index);
      queryClient.invalidateQueries({
        queryKey: transactionsQueryKeys.all,
        exact: false,
      });
    },
    onError: (error) => {
      console.error("Failed to save active wallet index:", error);
    },
  });

  const setActiveChainMutation = useMutation({
    mutationFn: async (chain: ChainConfig) => {
      storage.set("active_chain", JSON.stringify(chain));
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

        const walletExists = wallets.some(
          (existingWallet) =>
            existingWallet.address.toLowerCase() ===
            wallet.address.toLowerCase(),
        );

        if (walletExists) {
          console.error(
            "Duplicate Wallet: This wallet has already been imported.",
          );
          return false;
        }

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

  const { data: blockchains } = useBlockchainsWithStorage({ isActive: true });
  const changeActiveChain = useCallback(
    async (chainId: number) => {
      console.log("pressed chain id: ", chainId);
      try {
        if (!blockchains) return false;
        const blockchain = blockchains.find(
          (blockchain) => blockchain.chainId === chainId,
        );

        if (!blockchain) {
          console.error(`No blockchain found with chainId ${chainId}`);
          return false;
        }

        const apiChain: ChainConfig = {
          chain: {
            id: blockchain.chainId,
            name: blockchain.name,
            nativeCurrency: {
              name: blockchain.tokens?.[0]?.name || "Ether",
              symbol: blockchain.tokens?.[0]?.symbol || "ETH",
              decimals: blockchain.tokens?.[0]?.decimals || 18,
            },
            rpcUrls: {
              default: { http: [blockchain.rpcUrl] },
              public: { http: [blockchain.rpcUrl] },
            },
            blockExplorers: blockchain.blockExplorer
              ? {
                  default: {
                    name: blockchain.name,
                    url: blockchain.blockExplorer,
                  },
                }
              : undefined,
          },
          iconUrl: blockchain.tokens?.[0]?.logoUrl,
          isTestnet:
            blockchain.name.toLowerCase().includes("testnet") ||
            blockchain.name.toLowerCase().includes("sepolia") ||
            blockchain.name.toLowerCase().includes("goerli"),
        };

        await setActiveChainMutation.mutateAsync(apiChain);
        return true;
      } catch (error) {
        console.error("Failed to create chain from API data:", error);
        return false;
      }
    },
    [setActiveChainMutation, blockchains],
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

  const renameWallet = useCallback(
    async (index: number, newName: string) => {
      if (index < 0 || index >= wallets.length) return false;
      const updatedWallet = { ...wallets[index], name: newName };
      return await updateWallet(index, updatedWallet);
    },
    [wallets, updateWallet],
  );

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
    renameWallet,
  };
}
