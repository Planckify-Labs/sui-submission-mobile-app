import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";
import { Alert, InteractionManager } from "react-native";
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
import { useAgentBusy } from "@/hooks/useAgentBusy";
import { storage } from "@/lib/storage/mmkv";
import * as walletService from "@/services/walletService";
import { walletKitRegistry } from "@/services/walletKit/registry";
import type { WalletKitAdapter } from "@/services/walletKit/types";
import { getPublicClient, getWalletClient } from "@/utils/clients";
import { createWalletFromParams } from "@/utils/walletUtils";
import { buildChainConfigFromBlockchain } from "./useWallet.helpers";
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
      if (!storedChain) return supportedChains[0];
      // Rehydration safety (§10): any persisted shape that predates the
      // `ChainConfig` discriminated union is missing `namespace`. Stamp
      // "eip155" before returning so the new narrowing doesn't trip on
      // upgrade from v2.2.x.
      const parsed = JSON.parse(storedChain) as Partial<ChainConfig> & {
        chain?: unknown;
      };
      if (!("namespace" in parsed) || !parsed.namespace) {
        return { ...parsed, namespace: "eip155" } as ChainConfig;
      }
      return parsed as ChainConfig;
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

  const agentBusy = useAgentBusy();

  // Internal setter — always runs. Used by `addWallet` / `removeWallet`
  // where the busy-state gate would be wrong (adding a wallet is part
  // of the same user intent; removing forces the index to stay valid).
  const setActiveWalletInternal = useCallback(
    (index: number) => {
      setActiveWalletMutation.mutate(index);
    },
    [setActiveWalletMutation],
  );

  // Exported setter — two-tier gating:
  //
  //   1. Busy gate (HARD, always-on): if the agent is mid-turn
  //      (streaming, awaiting approval, awaiting preview), switching
  //      silently would leak context across signers — the old
  //      wallet's JWT / active chain are captured in in-flight tool
  //      calls. This gate runs on EVERY caller regardless of source
  //      because wallet security doesn't care which screen you're on.
  //   2. Chat-continuity gate (SOFT, agent-only): if the agent is
  //      idle but the current wallet has a live chat (messages or an
  //      active conversation), the switch replaces the visible chat
  //      thread with the target wallet's thread. This is only
  //      relevant when the user is actually looking at the chat —
  //      i.e. the call originated from inside the agent screen.
  //      Pass `source: "agent"` to opt in. Other screens (wallet
  //      management, send, deposit, dapps browser) skip this prompt
  //      so picking a wallet there stays frictionless.
  //
  // Skipped entirely when the same wallet is selected, or from
  // `addWallet` / `removeWallet` which use `setActiveWalletInternal`.
  const setActiveWallet = useCallback(
    (index: number, opts?: { source?: "agent" | "generic" }) => {
      if (index === activeWalletIndex) return;

      if (agentBusy.isBusy) {
        Alert.alert(
          "Takumi Agent is working",
          agentBusy.copy ??
            "An agent task is in progress. Switching wallets will cancel it.",
          [
            { text: "Keep waiting", style: "cancel" },
            {
              text: "Cancel task & switch",
              style: "destructive",
              onPress: async () => {
                await agentBusy.cancel();
                setActiveWalletInternal(index);
              },
            },
          ],
        );
        return;
      }

      if (opts?.source === "agent" && agentBusy.hasActiveChat) {
        const targetName = wallets[index]?.name ?? "this wallet";
        Alert.alert(
          "Switch wallet?",
          `A new chat session will start with ${targetName}. Your current chat stays saved and you can return to it any time.`,
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Switch",
              onPress: () => setActiveWalletInternal(index),
            },
          ],
        );
        return;
      }

      setActiveWalletInternal(index);
    },
    [activeWalletIndex, agentBusy, setActiveWalletInternal, wallets],
  );

  const addWallet = useCallback(
    async (walletData: TWalletCreationParams) => {
      return await deferredTask(async () => {
        const wallet = await createWalletFromParams(walletData);
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
          setActiveWalletInternal(updatedWallets.length - 1);
        }
        return success;
      }, "Adding wallet");
    },
    [wallets, saveWallets, deferredTask, setActiveWalletInternal],
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
        setActiveWalletInternal(Math.max(0, updatedWallets.length - 1));
      }

      return success;
    },
    [wallets, activeWalletIndex, saveWallets, setActiveWalletInternal],
  );

  const { data: blockchains } = useBlockchainsWithStorage({ isActive: true });

  const changeActiveChainInternal = useCallback(
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

        // Namespace branch — the one place a namespace `if` is allowed
        // per §7.5 because it's mapping backend `Blockchain` rows into
        // the `ChainConfig` discriminated union (data shape), not
        // dispatching behavior. Dispatch stays in `WalletKitAdapter`.
        const apiChain = buildChainConfigFromBlockchain(blockchain);

        await setActiveChainMutation.mutateAsync(apiChain);
        return true;
      } catch (error) {
        console.error("Failed to create chain from API data:", error);
        return false;
      }
    },
    [setActiveChainMutation, blockchains],
  );

  // Exported chain switcher — same gate as `setActiveWallet`. Lower
  // risk than a wallet change (same signer, same JWT) but the agent
  // reasoned about balances / prices on the *old* chain, so a silent
  // swap would invalidate the mental model the user approved under.
  // Returns false if the user keeps waiting; matches the existing
  // Promise<boolean> contract callers already handle.
  const changeActiveChain = useCallback(
    async (chainId: number): Promise<boolean> => {
      if (!agentBusy.isBusy) {
        return changeActiveChainInternal(chainId);
      }
      return new Promise<boolean>((resolve) => {
        Alert.alert(
          "Takumi Agent is working",
          agentBusy.copy ??
            "An agent task is in progress. Switching chain will cancel it.",
          [
            {
              text: "Keep waiting",
              style: "cancel",
              onPress: () => resolve(false),
            },
            {
              text: "Cancel task & switch",
              style: "destructive",
              onPress: async () => {
                await agentBusy.cancel();
                const ok = await changeActiveChainInternal(chainId);
                resolve(ok);
              },
            },
          ],
          { onDismiss: () => resolve(false) },
        );
      });
    },
    [agentBusy, changeActiveChainInternal],
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

  // Legacy viem-typed accessors (§7.5). Kept for callers that still
  // have viem-shaped code; new callers should reach for
  // `getActiveWalletKit()` instead. Both early-return `null` when the
  // active chain isn't EVM so non-EVM screens no-op gracefully rather
  // than throwing.
  const getClientForActiveWallet = useCallback((): WalletClient | null => {
    if (!activeWallet?.address) return null;
    if (activeChain.namespace !== "eip155") return null;

    const account = walletService.getAccountForWallet(activeWallet);
    if (!account) return null;

    return getWalletClient(account as Account, activeChain.chain);
  }, [activeWallet, activeChain]);

  const getPublicClientForActiveChain = useCallback((): PublicClient | null => {
    if (activeChain.namespace !== "eip155") return null;
    return getPublicClient(activeChain.chain);
  }, [activeChain]);

  // Namespace-aware kit accessors (§7.5). These are the preferred entry
  // points for screens — they return the registered
  // `WalletKitAdapter` for the active namespace / the given wallet,
  // keeping dispatch out of UI code.
  const getActiveWalletKit = useCallback((): WalletKitAdapter => {
    if (!activeWallet?.namespace) throw new Error("No active wallet");
    return walletKitRegistry.get(activeWallet.namespace);
  }, [activeWallet]);

  const getKitForWallet = useCallback((w: TWallet): WalletKitAdapter => {
    return walletKitRegistry.get(w.namespace);
  }, []);

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
    getActiveWalletKit,
    getKitForWallet,
    renameWallet,
  };
}
