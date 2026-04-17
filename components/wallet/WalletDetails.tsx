import { useQuery } from "@tanstack/react-query";
import { Coins, KeyRound, Shield } from "lucide-react-native";
import React, { lazy, Suspense, useCallback, useMemo } from "react";
import { ActivityIndicator, Animated, Text, View } from "react-native";
import Chip from "@/components/common/Chip";
import { usePerformance } from "@/components/providers/PerformanceProvider";
import AddressDisplay from "@/components/wallet/AddressDisplay";
import type { TWallet } from "@/constants/types/walletTypes";
import { useWallet } from "@/hooks/useWallet";
import { chainCacheKey } from "@/hooks/useWallet.helpers";
import { walletKitRegistry } from "@/services/walletKit/registry";
import { authenticateUser } from "@/utils/authUtils";
import { copyToClipboard } from "@/utils/helperUtils";

const LazyWalletInfoDisplay = lazy(
  () => import("@/components/wallet/WalletInfoDisplay"),
);

const LazyLoadingPlaceholder = () => (
  <View className="py-8 items-center justify-center">
    <ActivityIndicator size="small" color="#c71c4b" />
  </View>
);

type TWalletDetails = {
  wallet: TWallet;
  showWalletInfo: boolean;
  setShowWalletInfo: (show: boolean) => void;
  animatedStyle?: object;
};

export default function WalletDetails({
  wallet,
  showWalletInfo,
  setShowWalletInfo,
  animatedStyle,
}: TWalletDetails) {
  const { deferredTask } = usePerformance();

  // §6.2: resolve the kit for the active wallet once; every balance +
  // formatting call flows through it so this component stays
  // namespace-agnostic.
  const { wallets, activeChain, getActiveWalletKit } = useWallet();
  const kit = useMemo(
    () => (wallet?.namespace ? getActiveWalletKit() : null),
    [getActiveWalletKit, wallet?.namespace],
  );

  // Paired wallets = rows sharing the same seedPhrase as the active
  // wallet. One account = N derived wallets (EVM + Solana today), so
  // we show every paired address here. Fall back to just this wallet
  // when seedPhrase is absent (imported private-key row).
  const pairedWallets = useMemo(() => {
    if (!wallet) return [] as TWallet[];
    const seed = wallet.seedPhrase;
    if (typeof seed !== "string" || seed.length === 0) return [wallet];
    const group = wallets.filter((w) => w.seedPhrase === seed);
    return group.length > 0 ? group : [wallet];
  }, [wallet, wallets]);

  const displayNameForNamespace = useCallback((ns: string | undefined) => {
    if (!ns) return "";
    try {
      const k = walletKitRegistry.get(ns as never);
      if (k.displayName) return k.displayName;
    } catch {
      // kit missing — fall through
    }
    return ns === "eip155" ? "Ethereum" : ns.charAt(0).toUpperCase() + ns.slice(1);
  }, []);

  // Balance is only meaningful when the active chain's namespace
  // matches the active wallet's namespace (e.g. wallet is Solana,
  // chain is Solana). Otherwise we skip the fetch — the UI renders a
  // dash so no namespace branch is needed in the display layer.
  const chainForWallet =
    wallet?.namespace && activeChain.namespace === wallet.namespace
      ? activeChain
      : null;

  const { data: balance } = useQuery({
    queryKey: [
      "wallet-details-native-balance",
      wallet?.address,
      wallet?.namespace,
      chainCacheKey(activeChain),
    ],
    queryFn: async () => {
      if (!kit || !chainForWallet || !wallet?.address) return null;
      return await kit.getNativeBalance(wallet.address, chainForWallet);
    },
    enabled: !!kit && !!chainForWallet && !!wallet?.address,
  });

  const formattedBalance = useMemo(() => {
    if (!kit || !chainForWallet) return "—";
    if (balance === null || balance === undefined) return "…";
    return kit.formatNativeAmount(balance, chainForWallet);
  }, [balance, chainForWallet, kit]);

  const handleToggleWalletInfo = useCallback(async () => {
    if (!showWalletInfo) {
      const isAuthenticated = await deferredTask(() =>
        authenticateUser("Authenticate to view wallet information"),
      );
      if (isAuthenticated) {
        setShowWalletInfo(true);
      }
    } else {
      setShowWalletInfo(false);
    }
  }, [showWalletInfo, deferredTask, setShowWalletInfo]);

  // Token list is EVM-only this spec (§11 R7 / N1). Solana wallets
  // render a single "coming soon" placeholder in place of the EVM
  // token/history list. This is the only allowed namespace `if` in
  // the display layer.
  const isSolanaWallet = wallet?.namespace === "solana";

  return (
    <Animated.View
      className="bg-light rounded-3xl overflow-hidden mx-4"
      style={[
        {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.04,
          shadowRadius: 4,
          elevation: 1,
        },
        animatedStyle,
      ]}
    >
      <View className="px-5 pt-5 pb-4">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center">
            <View className="w-10 h-10 rounded-2xl bg-light-primary-red/10 items-center justify-center mr-3">
              <KeyRound size={20} color="#c71c4b" />
            </View>
            <View>
              <Text className="text-light-matte-black font-bold text-base">
                Wallet Details
              </Text>
              <Text className="text-light-matte-black/50 text-xs mt-0.5">
                {wallet.name || "My Wallet"}
              </Text>
            </View>
          </View>
          <Chip label={wallet.source} size="small" />
        </View>
      </View>

      <View className="h-px bg-light-matte-black/5 mx-5" />

      <View className="px-5 py-4">
        <View className="mb-4">
          <View className="flex-row items-center mb-2">
            <Coins size={12} color="#c71c4b" />
            <Text className="text-light-matte-black/50 text-xs font-medium ml-1 uppercase tracking-wide">
              Native Balance
            </Text>
          </View>
          <View className="bg-light-main-container/50 p-4 rounded-2xl">
            <Text className="text-light-matte-black font-semibold text-base">
              {formattedBalance}
            </Text>
          </View>
        </View>

        {pairedWallets.map((w) => (
          <AddressDisplay
            key={`${w.namespace}-${w.address}`}
            address={w.address}
            chainLabel={displayNameForNamespace(w.namespace)}
            onCopy={() =>
              copyToClipboard(
                w.address,
                `${displayNameForNamespace(w.namespace)} Address`,
              )
            }
          />
        ))}

        <Suspense fallback={<LazyLoadingPlaceholder />}>
          <LazyWalletInfoDisplay
            wallet={wallet}
            showWalletInfo={showWalletInfo}
            onToggleVisibility={handleToggleWalletInfo}
            onCopy={copyToClipboard}
          />
        </Suspense>

        {isSolanaWallet && (
          <View className="mt-4 bg-light-main-container/50 p-4 rounded-2xl">
            <Text className="text-light-matte-black/60 text-xs text-center">
              Transaction history and tokens coming soon
            </Text>
          </View>
        )}
      </View>

      {wallet.type !== "Social" && (
        <View className="bg-light-main-container/60 px-5 py-4">
          <View className="flex-row items-center">
            <View className="w-8 h-8 rounded-xl bg-light-primary-red/10 items-center justify-center mr-3">
              <Shield size={14} color="#c71c4b" />
            </View>
            <Text className="text-light-matte-black/60 text-xs flex-1 leading-4">
              Never share your private key or seed phrase. TakumiPay will never
              ask for this information.
            </Text>
          </View>
        </View>
      )}
    </Animated.View>
  );
}
