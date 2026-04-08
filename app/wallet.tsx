import { router } from "expo-router";
import { ChevronRight, Plus, Wallet as WalletIcon } from "lucide-react-native";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import { usePerformance } from "@/components/providers/PerformanceProvider";
import WalletCompactCard from "@/components/wallet/WalletCompactCard";
import WalletDetails from "@/components/wallet/WalletDetails";
import WalletSwitcherModal from "@/components/wallet/WalletSwitcherModal";
import { TWallet } from "@/constants/types/walletTypes";
import { useWallet } from "@/hooks/useWallet";

const CARD_WIDTH = 160;

export default function Wallet() {
  const { width } = useWindowDimensions();
  const isSmallScreen = width < 360;
  const [refreshing, setRefreshing] = useState(false);
  const [showWalletInfo, setShowWalletInfo] = useState(false);
  const [showSwitcherModal, setShowSwitcherModal] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const detailsOpacity = useRef(new Animated.Value(1)).current;

  const {
    wallets,
    activeWallet,
    activeWalletIndex,
    isLoading,
    setActiveWallet,
    loadWallets,
    renameWallet,
  } = useWallet();
  const { isReady, deferredTask } = usePerformance();
  const { bottom } = useSafeAreaInsets();
  const bottomOffset = Platform.OS === "ios" ? 0 : bottom > 0 ? bottom : 0;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadWallets();
    setRefreshing(false);
  }, [loadWallets]);

  useEffect(() => {
    if (isReady && !isLoading && wallets.length === 0) {
      router.replace("/login");
    }
  }, [isLoading, wallets, isReady]);

  const handleWalletSwitch = useCallback(
    async (index: number) => {
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

      await deferredTask(async () => {
        setActiveWallet(index);
        setShowWalletInfo(false);
      }, "Switching wallet");
    },
    [setActiveWallet, deferredTask, detailsOpacity],
  );

  const renderCompactWalletItem = useCallback(
    ({ item }: { item: TWallet }) => {
      const originalIndex = wallets.findIndex(
        (w) => w.address === item.address,
      );
      return (
        <WalletCompactCard
          wallet={item}
          isActive={originalIndex === activeWalletIndex}
          onPress={() => handleWalletSwitch(originalIndex)}
          allowRename={true}
          onRename={async (newName: string) => {
            await renameWallet(originalIndex, newName);
            loadWallets();
          }}
        />
      );
    },
    [wallets, activeWalletIndex, handleWalletSwitch, renameWallet, loadWallets],
  );

  const keyExtractor = useCallback(
    (item: TWallet, index: number) => item.address || `wallet-${index}`,
    [],
  );

  const displayedWallets = useMemo(() => {
    if (wallets.length <= 3 || activeWalletIndex < 3)
      return wallets.slice(0, 3);
    const result = wallets.slice(0, 3);
    result[0] = wallets[activeWalletIndex];
    return result;
  }, [wallets, activeWalletIndex]);

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

  if (wallets.length === 0) {
    return null;
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
              You have {wallets.length} wallets
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
        </ScrollView>

        <WalletSwitcherModal
          visible={showSwitcherModal}
          onClose={() => setShowSwitcherModal(false)}
          wallets={wallets}
          activeWalletIndex={activeWalletIndex}
          onSelectWallet={handleWalletSwitch}
          onAddWallet={() => router.push("/login")}
        />
      </SafeAreaView>
    </>
  );
}
