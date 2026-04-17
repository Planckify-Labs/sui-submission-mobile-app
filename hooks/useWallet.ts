import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef } from "react";
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
import type { Namespace } from "@/services/chains/types";
import * as walletService from "@/services/walletService";
import { deriveWalletsFromMnemonic } from "@/services/walletKit/deriveAll";
import { walletKitRegistry } from "@/services/walletKit/registry";
import type { WalletKitAdapter } from "@/services/walletKit/types";
import { getPublicClient, getWalletClient } from "@/utils/clients";
import { createWalletFromParams } from "@/utils/walletUtils";
import {
  buildChainConfigFromBlockchain,
  groupWalletsIntoAccounts,
  walletForNamespace,
  walletIndexForAccountAndNamespace,
  type WalletAccount,
} from "./useWallet.helpers";
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
    // The underlying read is auth-gated (Face ID / BiometricPrompt).
    // Without these flags every useWallet consumer's mount re-runs the
    // query, which re-prompts. We load once per cold start and rely on
    // explicit `loadWallets()` / mutation-side setQueryData for updates.
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
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

  // Group TWallet rows derived from the same seed into a single
  // "account" entity. UI surfaces render the grouped list; the active
  // TWallet row inside an account is picked by the active chain's
  // namespace (see `activeAccount` + auto-switch effect below).
  const accounts = useMemo<WalletAccount[]>(
    () => groupWalletsIntoAccounts(wallets),
    [wallets],
  );

  const activeAccount = useMemo<WalletAccount | null>(() => {
    if (!activeWallet?.address) return null;
    return (
      accounts.find((a) =>
        a.wallets.some((w) => w.address === activeWallet.address),
      ) ?? null
    );
  }, [accounts, activeWallet?.address]);

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

  const { data: blockchains } = useBlockchainsWithStorage({ isActive: true });

  // Internal setter — always runs. Used by `addWallet` / `removeWallet`
  // where the busy-state gate would be wrong (adding a wallet is part
  // of the same user intent; removing forces the index to stay valid).
  //
  // Wallet → chain sync: when the selected wallet's namespace differs
  // from the current active chain's, flip the chain to the first
  // backend row matching that namespace. Honours the user's explicit
  // wallet pick (previously a passive effect fought it by re-picking
  // the chain's matching wallet inside the account, which reverted
  // taps to the "wrong" wallet).
  const setActiveWalletInternal = useCallback(
    (index: number) => {
      setActiveWalletMutation.mutate(index);
      const target = wallets[index];
      if (!target) return;
      if (target.namespace === activeChain.namespace) return;
      if (!blockchains) return;
      const targetChainRow = blockchains.find(
        (b) => (b.isEVM === false ? "solana" : "eip155") === target.namespace,
      );
      if (!targetChainRow) return;
      const targetChainConfig = buildChainConfigFromBlockchain(targetChainRow);
      setActiveChainMutation.mutate(targetChainConfig);
    },
    [
      wallets,
      activeChain.namespace,
      blockchains,
      setActiveWalletMutation,
      setActiveChainMutation,
    ],
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

  // Account-scoped setter: picks the wallet row inside the account that
  // matches the active chain's namespace. Falls back to `setActiveWallet`
  // so the busy-gate / chat-continuity prompts still fire when relevant.
  const setActiveAccount = useCallback(
    (accountId: string, opts?: { source?: "agent" | "generic" }) => {
      const idx = walletIndexForAccountAndNamespace(
        wallets,
        accountId,
        activeChain.namespace,
      );
      if (idx < 0) return;
      setActiveWallet(idx, opts);
    },
    [wallets, activeChain.namespace, setActiveWallet],
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

  // Batch-insert helper for multi-chain flows (spec §14.6). Used by
  // `CreateWalletSheet` and `ImportSeedPhraseSheet` where one mnemonic
  // derives N `TWallet` rows and we want a single biometric prompt
  // (TWV-2026-060) — not N. Takes wallets that have already been
  // derived by `deriveWalletsFromMnemonic`, skips duplicate-address
  // checks across the batch itself (every input is a fresh derive so
  // internal collisions are impossible by construction), but still
  // guards against collisions with the existing bundle. Returns `true`
  // iff at least one non-duplicate wallet was persisted.
  //
  // Active-wallet selection: after a successful save, the first non-
  // duplicate wallet is selected as active, preferring an `eip155`
  // row when present so agent / send flows default to the EVM chain
  // the rest of the app optimises for. Matches the intent of
  // `addWallet`'s "auto-select the added wallet" behavior.
  const addWallets = useCallback(
    async (walletsToAdd: TWallet[]): Promise<boolean> => {
      if (walletsToAdd.length === 0) return false;
      return await deferredTask(async () => {
        const existingAddrs = new Set(
          wallets.map((w) => w.address.toLowerCase()),
        );
        const fresh = walletsToAdd.filter(
          (w) => !existingAddrs.has(w.address.toLowerCase()),
        );
        if (fresh.length === 0) {
          console.error(
            "Duplicate Wallets: Every wallet in the batch is already imported.",
          );
          return false;
        }
        const updatedWallets = [...wallets, ...fresh];
        const success = await saveWallets(updatedWallets);
        if (success) {
          // Prefer an eip155 wallet from the fresh batch so downstream
          // EVM-first surfaces (agent, send) default sensibly.
          const preferredIdxInFresh = fresh.findIndex(
            (w) => w.namespace === "eip155",
          );
          const firstFreshIdx = wallets.length;
          const targetIdx =
            preferredIdxInFresh >= 0
              ? firstFreshIdx + preferredIdxInFresh
              : firstFreshIdx;
          setActiveWalletInternal(targetIdx);
        }
        return success;
      }, "Adding wallets");
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

  // Chain → wallet sync: pick a wallet whose namespace matches the
  // new chain so `activeWallet.namespace === activeChain.namespace`
  // always holds at steady state (send.tsx and other kit consumers
  // assert this invariant).
  //
  // Priority:
  //   1. Paired wallet inside the current account (shared seedPhrase).
  //      Keeps the user's notion of "this account" intact across
  //      chain flips — EVM row → Solana row on the same derived
  //      account.
  //   2. Any wallet in the bundle that matches the new namespace.
  //      Kicks in when the current account can't serve this chain
  //      (e.g. an imported private-key account that lives only on
  //      one chain). The user's active account silently drops to a
  //      compatible one rather than freezing them in a namespace
  //      mismatch ("Switching network…" spinner forever).
  //   3. No match anywhere — leave state as-is. The caller (screens)
  //      handles the mismatch with their own UI.
  const syncActiveWalletToChain = useCallback(
    (nextChain: ChainConfig) => {
      if (activeWallet?.namespace === nextChain.namespace) return;

      const pickFrom = (pool: TWallet[]): TWallet | undefined =>
        pool.find((w) => w.namespace === nextChain.namespace);

      const target =
        (activeAccount ? pickFrom(activeAccount.wallets) : undefined) ??
        pickFrom(wallets);
      if (!target) return;

      const idx = wallets.findIndex((w) => w.address === target.address);
      if (idx >= 0 && idx !== activeWalletIndex) {
        setActiveWalletMutation.mutate(idx);
      }
    },
    [
      activeAccount,
      activeWallet?.namespace,
      wallets,
      activeWalletIndex,
      setActiveWalletMutation,
    ],
  );

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
        syncActiveWalletToChain(apiChain);
        return true;
      } catch (error) {
        console.error("Failed to create chain from API data:", error);
        return false;
      }
    },
    [setActiveChainMutation, blockchains, syncActiveWalletToChain],
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

  // Direct ChainConfig setter — used by namespaces that aren't yet
  // represented in the backend `blockchains` feed (e.g. Solana in
  // v2.3; backend rows are a follow-up). Shares the same agent-busy
  // gate so switching between EVM and Solana mid-agent-task still
  // prompts the user.
  const changeActiveChainToConfig = useCallback(
    async (chain: ChainConfig): Promise<boolean> => {
      const commit = async () => {
        try {
          await setActiveChainMutation.mutateAsync(chain);
          syncActiveWalletToChain(chain);
          return true;
        } catch (error) {
          console.error("Failed to set active chain from config:", error);
          return false;
        }
      };
      if (!agentBusy.isBusy) return commit();
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
                resolve(await commit());
              },
            },
          ],
          { onDismiss: () => resolve(false) },
        );
      });
    },
    [agentBusy, setActiveChainMutation],
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

  // Rename every TWallet row inside an account in a SINGLE save — one
  // biometric prompt, one write. Without this, the UI had to loop
  // `renameWallet` per row and the user got prompted per namespace
  // (2× for an EVM + Solana pair), with confusing intermediate state
  // between prompts.
  const renameAccount = useCallback(
    async (accountId: string, newName: string): Promise<boolean> => {
      const account = accounts.find((a) => a.id === accountId);
      if (!account) return false;
      const targetAddresses = new Set(
        account.wallets.map((w) => w.address.toLowerCase()),
      );
      const updated = wallets.map((w) =>
        targetAddresses.has(w.address.toLowerCase())
          ? { ...w, name: newName }
          : w,
      );
      return await saveWallets(updated);
    },
    [accounts, wallets, saveWallets],
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

  // Phantom-style account backfill: for every mnemonic that already
  // owns at least one wallet, ensure a wallet exists on every
  // registered kit (EVM, Solana, …). Pre-Solana users who imported a
  // seed on EVM will see their paired Solana address show up once.
  //
  // Runs at most once per hook lifetime, after wallets are loaded and
  // quiet. Implementation notes:
  //   - `onceRef` prevents ANY repeat, even if wallets change mid-
  //     session (rename, add, delete). Those flows already maintain
  //     pairing invariants themselves (addWallets de-dupes).
  //   - `InteractionManager.runAfterInteractions` pushes the derive
  //     + save off the first-paint critical path so touch handlers on
  //     home don't starve while WebCrypto spins up the polyfill.
  const backfillOnceRef = useRef(false);
  useEffect(() => {
    if (backfillOnceRef.current) return;
    if (isLoading) return;
    if (wallets.length === 0) return;
    backfillOnceRef.current = true;

    const task = InteractionManager.runAfterInteractions(async () => {
      try {
        const bySeed = new Map<string, Set<Namespace>>();
        for (const w of wallets) {
          const seed = w.seedPhrase;
          if (typeof seed !== "string" || seed.length === 0) continue;
          const set = bySeed.get(seed) ?? new Set<Namespace>();
          set.add(w.namespace);
          bySeed.set(seed, set);
        }
        if (bySeed.size === 0) return;
        const registered = walletKitRegistry
          .getAll()
          .map((kit) => kit.namespace);
        const derived: TWallet[] = [];
        for (const [seed, have] of bySeed) {
          const missing = registered.filter((ns) => !have.has(ns));
          if (missing.length === 0) continue;
          const minted = await deriveWalletsFromMnemonic(seed, missing);
          derived.push(...minted);
        }
        if (derived.length > 0) await addWallets(derived);
      } catch (err) {
        if (__DEV__) console.warn("[useWallet] backfill failed:", err);
        backfillOnceRef.current = false; // let a future load retry
      }
    });

    return () => {
      if (typeof task === "object" && task && "cancel" in task) {
        (task as { cancel: () => void }).cancel();
      }
    };
  }, [wallets, isLoading, addWallets]);

  // Passive sync on first load / rehydrate only: if the persisted
  // `activeWallet` and `activeChain` disagree when the app boots
  // (e.g. storage written before we enforced the invariant), align
  // them once. Explicit `setActiveWalletInternal` and chain mutations
  // already sync inline — this effect intentionally does NOT re-fire
  // after user interactions (the `didInitialSyncRef` gate ensures it
  // only runs once, so wallet picks aren't fought by the effect).
  const didInitialSyncRef = useRef(false);
  useEffect(() => {
    if (didInitialSyncRef.current) return;
    if (!activeAccount) return;
    if (!activeWallet?.namespace) return;
    if (isLoading) return;
    if (!blockchains) return;

    if (activeWallet.namespace === activeChain.namespace) {
      didInitialSyncRef.current = true;
      return;
    }

    // Prefer syncing the wallet within the current account to the
    // chain's namespace (common case: user was on EVM, restored on
    // same account's EVM row). Fallback: flip chain when the account
    // has no matching wallet for the persisted chain.
    const target = activeAccount.wallets.find(
      (w) => w.namespace === activeChain.namespace,
    );
    if (target) {
      const idx = wallets.findIndex((w) => w.address === target.address);
      if (idx >= 0 && idx !== activeWalletIndex) {
        setActiveWalletMutation.mutate(idx);
      }
      didInitialSyncRef.current = true;
      return;
    }

    const targetChainRow = blockchains.find((b) => {
      const ns = b.isEVM === false ? "solana" : "eip155";
      return ns === activeWallet.namespace;
    });
    if (targetChainRow) {
      setActiveChainMutation.mutate(
        buildChainConfigFromBlockchain(targetChainRow),
      );
    }
    didInitialSyncRef.current = true;
  }, [
    activeAccount,
    activeChain.namespace,
    activeWallet?.namespace,
    wallets,
    activeWalletIndex,
    blockchains,
    isLoading,
    setActiveWalletMutation,
    setActiveChainMutation,
  ]);

  return {
    wallets,
    accounts,
    activeWallet,
    activeAccount,
    activeWalletIndex,
    isLoading,
    activeChain,
    setActiveWallet,
    setActiveAccount,
    loadWallets,
    saveWallets,
    addWallet,
    addWallets,
    updateWallet,
    removeWallet,
    changeActiveChain,
    changeActiveChainToConfig,
    getWalletAccount,
    getClientForActiveWallet,
    getPublicClientForActiveChain,
    getActiveWalletKit,
    getKitForWallet,
    renameWallet,
    renameAccount,
  };
}
