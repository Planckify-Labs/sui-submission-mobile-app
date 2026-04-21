import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import {
  ChevronRight,
  Info,
  Plus,
  Shield,
  Wallet as WalletIcon,
} from "lucide-react-native";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { runWithChainSwitchingOverlay } from "@/components/common/ChainSwitchingOverlay";
import { usePerformance } from "@/components/providers/PerformanceProvider";
import WalletCompactCard from "@/components/wallet/WalletCompactCard";
import WalletDetails from "@/components/wallet/WalletDetails";
import WalletSwitcherModal from "@/components/wallet/WalletSwitcherModal";
import { TWallet } from "@/constants/types/walletTypes";
import { usePinnedWallets } from "@/hooks/usePinnedWallets";
import { useWallet, warmWalletSigner } from "@/hooks/useWallet";
import { chainCacheKey } from "@/hooks/useWallet.helpers";

const CARD_WIDTH = 160;

export default function Wallet() {
  const { width } = useWindowDimensions();
  const isSmallScreen = width < 360;
  const [refreshing, setRefreshing] = useState(false);
  const [showWalletInfo, setShowWalletInfo] = useState(false);
  const [showSwitcherModal, setShowSwitcherModal] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const detailsOpacity = useRef(new Animated.Value(1)).current;
  const queryClient = useQueryClient();

  const {
    wallets,
    accounts,
    activeWallet,
    activeChain,
    isLoading,
    setActiveWallet,
    loadWallets,
    renameAccount,
    getActiveWalletKit,
  } = useWallet();

  // §6.2: kit resolves from the active wallet's namespace. Any balance
  // fetch at this layer goes through `kit.getNativeBalance`; formatting
  // goes through `kit.formatNativeAmount`. No viem imports here.
  // Downstream consumers (WalletDetails, WalletCard) own their own
  // `useQuery` against this same kit entry point so a single
  // pull-to-refresh invalidation refreshes both balance pills.
  const kit = useMemo(
    () => (activeWallet?.namespace ? getActiveWalletKit() : null),
    [activeWallet?.namespace, getActiveWalletKit],
  );

  // Balance context is only valid when the active chain's namespace
  // matches the active wallet's namespace. Mismatches render "—" in
  // the header pill without a namespace branch at the display layer.
  const chainForActiveWallet =
    kit && activeChain.namespace === activeWallet?.namespace
      ? activeChain
      : null;

  const { data: activeNativeBalance } = useQuery({
    queryKey: [
      "wallet-details-native-balance",
      activeWallet?.address,
      activeWallet?.namespace,
      chainCacheKey(activeChain),
    ],
    queryFn: async () => {
      if (!kit || !chainForActiveWallet || !activeWallet?.address) return null;
      return await kit.getNativeBalance(
        activeWallet.address,
        chainForActiveWallet,
      );
    },
    enabled: !!kit && !!chainForActiveWallet && !!activeWallet?.address,
  });

  const activeBalanceDisplay = useMemo(() => {
    if (!kit || !chainForActiveWallet) return "—";
    if (activeNativeBalance === null || activeNativeBalance === undefined)
      return "…";
    return kit.formatNativeAmount(activeNativeBalance, chainForActiveWallet);
  }, [activeNativeBalance, chainForActiveWallet, kit]);

  const { deferredTask } = usePerformance();
  const { bottom } = useSafeAreaInsets();
  const bottomOffset = Platform.OS === "ios" ? 0 : bottom > 0 ? bottom : 0;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadWallets();
    // Pull-to-refresh must also refresh native balances — the kit-
    // backed `useQuery` keys in `WalletDetails` / `WalletCard` use
    // stable prefixes so a single invalidation covers EVM and Solana
    // rows alike (acceptance bullet 2 of Task 15).
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["wallet-details-native-balance"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["wallet-card-native-balance"],
      }),
    ]);
    setRefreshing(false);
  }, [loadWallets, queryClient]);

  // Task 26 / §14.4: zero-wallet no longer redirects to `/login` —
  // rendering handles it inline via the empty-state CTA above. The
  // previous `router.replace("/login")` effect lived here and silently
  // rerouted users who deleted every wallet; removed per spec so the
  // inline "Add wallet" card can greet them instead.

  // Concurrent-switch guard — ref so rapid taps don't each pass the
  // state check (which would lag by a render). Without this, spamming
  // wallet cards fires N parallel `handleAccountSwitch` calls, each
  // spawning its own signer-warm + state-mutation + auth-query refetch
  // cascade (points/balance + redeem/history + transaction-history ×
  // N = 3N in-flight requests). React's response cascades back-to-back
  // freeze the thread. Guard locks the switch for the duration.
  const switchInFlightRef = useRef(false);

  const handleWalletSwitch = useCallback(
    async (walletIndex: number) => {
      if (switchInFlightRef.current) return;

      const targetWallet = wallets[walletIndex];
      if (!targetWallet) return;

      // No-op if already active — avoids firing the overlay and the
      // downstream mutation cascade for a tap on the already-selected
      // card.
      if (targetWallet.address === activeWallet?.address) {
        setShowWalletInfo(false);
        return;
      }

      switchInFlightRef.current = true;

      Animated.sequence([
        Animated.timing(detailsOpacity, {
          toValue: 0.5,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(detailsOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      try {
        await runWithChainSwitchingOverlay(
          `Switching to ${targetWallet.name}…`,
          async () => {
            await warmWalletSigner(targetWallet);
            await deferredTask(async () => {
              setActiveWallet(walletIndex);
              setShowWalletInfo(false);
            }, "Switching wallet");
            await new Promise((r) => setTimeout(r, 50));
          },
        );
      } finally {
        switchInFlightRef.current = false;
      }
    },
    [
      wallets,
      activeWallet?.address,
      setActiveWallet,
      deferredTask,
      detailsOpacity,
    ],
  );

  // Render every wallet row flat — EVM and Solana rows of the same
  // account are both visible regardless of the active chain. Rename
  // still operates at account level so both rows stay name-synced.
  const renderCompactWalletItem = useCallback(
    ({ item }: { item: TWallet }) => {
      const isActive = activeWallet?.address === item.address;
      const owningAccount = accounts.find((a) =>
        a.wallets.some((w) => w.address === item.address),
      );
      const walletIndex = wallets.findIndex((w) => w.address === item.address);
      return (
        <WalletCompactCard
          wallet={item}
          isActive={isActive}
          onPress={() => handleWalletSwitch(walletIndex)}
          allowRename={!!owningAccount}
          onRename={async (newName: string) => {
            if (!owningAccount) return;
            await renameAccount(owningAccount.id, newName);
            loadWallets();
          }}
        />
      );
    },
    [
      wallets,
      accounts,
      activeWallet?.address,
      handleWalletSwitch,
      renameAccount,
      loadWallets,
    ],
  );

  const keyExtractor = useCallback((item: TWallet) => item.address, []);

  const { pinnedAddresses } = usePinnedWallets();

  // Horizontal strip is the user's "pinned" set (max 3, in pin order).
  // When nothing is pinned we fall back to the first 3 wallets so the
  // strip isn't empty for users who haven't discovered pinning yet.
  const displayedWallets = useMemo(() => {
    if (pinnedAddresses.length > 0) {
      return pinnedAddresses
        .map((addr) => wallets.find((w) => w.address === addr))
        .filter((w): w is TWallet => !!w)
        .slice(0, 3);
    }
    if (wallets.length <= 3) return wallets;
    const activeIdx = wallets.findIndex(
      (w) => w.address === activeWallet?.address,
    );
    if (activeIdx < 0 || activeIdx < 3) return wallets.slice(0, 3);
    const result = wallets.slice(0, 3);
    result[0] = wallets[activeIdx];
    return result;
  }, [wallets, activeWallet?.address, pinnedAddresses]);

  const getItemLayout = useCallback(
    (_: any, index: number) => ({
      length: CARD_WIDTH + 12,
      offset: (CARD_WIDTH + 12) * index,
      index,
    }),
    [],
  );

  if (isLoading) {
    return (
      <SafeAreaView
        className="flex-1 bg-light-main-container justify-center items-center"
        edges={["top"]}
        style={{ paddingBottom: bottomOffset }}
      >
        <ActivityIndicator size="large" color="#c71c4b" />
        <Text className="text-light-matte-black mt-4">Loading wallets...</Text>
      </SafeAreaView>
    );
  }

  // Empty-state render (§14.4) — no auto-redirect. Users who have
  // deleted every wallet land here and see an inline CTA that opens the
  // same `AddWalletSheet` as the "+" button / WalletSwitcherModal.
  if (wallets.length === 0) {
    return (
      <>
        <StatusBar barStyle="dark-content" />
        <SafeAreaView
          className="flex-1 bg-light-main-container"
          edges={["top"]}
          style={{ paddingBottom: bottomOffset }}
        >
          <View className="mb-6 mx-4 mt-4">
            <View className="flex-row items-center justify-between mb-2">
              <Text
                className={`text-light-matte-black ${isSmallScreen ? "text-2xl" : "text-3xl"} font-bold tracking-tight`}
              >
                Wallets
              </Text>
              <TouchableOpacity
                activeOpacity={0.7}
                className="bg-light w-10 h-10 rounded-full items-center justify-center shadow-sm"
                onPress={() => router.push("/login")}
                style={{
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.05,
                  shadowRadius: 2,
                  elevation: 1,
                }}
              >
                <Plus size={20} color="#c71c4b" />
              </TouchableOpacity>
            </View>
          </View>

          <View className="flex-1 items-center justify-center px-8">
            <View className="w-16 h-16 rounded-full bg-light-primary-red/10 items-center justify-center mb-4">
              <WalletIcon size={32} color="#c71c4b" />
            </View>
            <Text className="text-light-matte-black text-lg font-bold mt-2">
              No wallets yet
            </Text>
            <Text className="text-light-matte-black/60 text-sm text-center mt-2">
              Add your first wallet to get started
            </Text>
            <TouchableOpacity
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Add wallet"
              className="bg-light-primary-red py-3 px-8 rounded-full mt-6"
              onPress={() => router.push("/login")}
            >
              <Text className="text-light font-bold">Add wallet</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </>
    );
  }

  return (
    <>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView
        className="flex-1 bg-light-main-container"
        edges={["top"]}
        style={{ paddingBottom: bottomOffset }}
      >
        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={["#c71c4b"]}
            />
          }
        >
          <View className="mb-6 mx-4">
            <View className="flex-row items-center justify-between mb-2">
              <Text
                className={`text-light-matte-black ${isSmallScreen ? "text-2xl" : "text-3xl"} font-bold tracking-tight`}
              >
                Wallets
              </Text>
              <TouchableOpacity
                activeOpacity={0.7}
                className="bg-light w-10 h-10 rounded-full items-center justify-center shadow-sm"
                onPress={() => router.push("/login")}
                style={{
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.05,
                  shadowRadius: 2,
                  elevation: 1,
                }}
              >
                <Plus size={20} color="#c71c4b" />
              </TouchableOpacity>
            </View>
            <Text className="text-light-matte-black/50 text-sm">
              You have {wallets.length}{" "}
              {wallets.length === 1 ? "wallet" : "wallets"}
            </Text>
          </View>

          <View className="mb-4">
            <FlatList
              ref={flatListRef}
              data={displayedWallets}
              renderItem={renderCompactWalletItem}
              keyExtractor={keyExtractor}
              getItemLayout={getItemLayout}
              horizontal
              showsHorizontalScrollIndicator={false}
              removeClippedSubviews={true}
              initialNumToRender={4}
              maxToRenderPerBatch={4}
              windowSize={5}
              contentContainerStyle={{
                paddingHorizontal: 12,
              }}
            />
          </View>

          <TouchableOpacity
            activeOpacity={0.7}
            className="bg-light rounded-2xl p-4 mb-4 flex-row items-center justify-between mx-4"
            onPress={() => setShowSwitcherModal(true)}
            style={{
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.04,
              shadowRadius: 8,
              elevation: 2,
            }}
          >
            <View className="flex-row items-center flex-1">
              <View className="w-10 h-10 rounded-full bg-light-primary-red/10 items-center justify-center mr-3">
                <WalletIcon size={20} color="#c71c4b" />
              </View>
              <View className="flex-1">
                <Text className="text-light-matte-black/50 text-xs mb-0.5">
                  Active Wallet
                </Text>
                <Text
                  className="text-light-matte-black font-semibold text-base"
                  numberOfLines={1}
                >
                  {activeWallet.name}
                </Text>
                <Text
                  className="text-light-matte-black/60 text-xs mt-0.5"
                  numberOfLines={1}
                >
                  {activeBalanceDisplay}
                </Text>
              </View>
            </View>
            <View className="flex-row items-center">
              <Text className="text-light-primary-red text-sm font-medium mr-1">
                View All
              </Text>
              <ChevronRight size={18} color="#c71c4b" />
            </View>
          </TouchableOpacity>

          <WalletDetails
            wallet={activeWallet}
            showWalletInfo={showWalletInfo}
            setShowWalletInfo={setShowWalletInfo}
            animatedStyle={{ opacity: detailsOpacity }}
          />

          <TouchableOpacity
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Agent Permissions"
            accessibilityHint="View and revoke permissions granted to the AI agent"
            className="bg-light rounded-2xl p-4 mt-4 mb-4 flex-row items-center justify-between mx-4"
            onPress={() =>
              // Cast: expo-router generates the typed routes file lazily
              // via the dev server. `/agent-permissions` is a new file
              // route that won't appear in the generated union until the
              // dev server runs.
              router.push("/agent-permissions" as never)
            }
            style={{
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.04,
              shadowRadius: 8,
              elevation: 2,
            }}
          >
            <View className="flex-row items-center flex-1">
              <View className="w-10 h-10 rounded-full bg-light-primary-red/10 items-center justify-center mr-3">
                <Shield size={20} color="#c71c4b" />
              </View>
              <View className="flex-1">
                <Text className="text-light-matte-black/50 text-xs mb-0.5">
                  Settings
                </Text>
                <Text
                  className="text-light-matte-black font-semibold text-base"
                  numberOfLines={1}
                >
                  Agent Permissions
                </Text>
              </View>
            </View>
            <ChevronRight size={18} color="#c71c4b" />
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="About Takumi Wallet"
            accessibilityHint="Show bundle IDs, signing certificate fingerprint, and official distribution links"
            className="bg-light rounded-2xl p-4 mb-4 flex-row items-center justify-between mx-4"
            onPress={() =>
              // Cast rationale: same as the Agent Permissions row —
              // `/about` is a new route and the typed-routes union only
              // refreshes once the dev server runs.
              router.push("/about" as never)
            }
            style={{
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.04,
              shadowRadius: 8,
              elevation: 2,
            }}
          >
            <View className="flex-row items-center flex-1">
              <View className="w-10 h-10 rounded-full bg-light-primary-red/10 items-center justify-center mr-3">
                <Info size={20} color="#c71c4b" />
              </View>
              <View className="flex-1">
                <Text className="text-light-matte-black/50 text-xs mb-0.5">
                  Settings
                </Text>
                <Text
                  className="text-light-matte-black font-semibold text-base"
                  numberOfLines={1}
                >
                  About
                </Text>
              </View>
            </View>
            <ChevronRight size={18} color="#c71c4b" />
          </TouchableOpacity>
        </ScrollView>

        <WalletSwitcherModal
          visible={showSwitcherModal}
          onClose={() => setShowSwitcherModal(false)}
          // Feed every wallet row flat — EVM and Solana rows show as
          // separate entries regardless of the active chain.
          wallets={wallets}
          activeWalletIndex={Math.max(
            0,
            wallets.findIndex((w) => w.address === activeWallet?.address),
          )}
          onSelectWallet={(index: number) => {
            handleWalletSwitch(index);
          }}
          onAddWallet={() => {
            // Route through /login so users can reach the "Register as
            // Merchant" CTA alongside "Create New Wallet" — the sole
            // entry point for both flows lives on the login screen.
            setShowSwitcherModal(false);
            router.push("/login");
          }}
        />
      </SafeAreaView>
    </>
  );
}
