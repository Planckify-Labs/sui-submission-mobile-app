import { router } from "expo-router";
import { Plus } from "lucide-react-native";
import React, { lazy, Suspense, useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import Chip from "@/components/common/Chip";
import SecurityWarning from "@/components/common/SecurityWarning";
import { usePerformance } from "@/components/providers/PerformanceProvider";
import AddressDisplay from "@/components/wallet/AddressDisplay";
import WalletCard from "@/components/wallet/WalletCard";
import { TWallet } from "@/constants/types/walletTypes";
import { useWallet } from "@/hooks/useWallet";
import { authenticateUser } from "@/utils/authUtils";
import { copyToClipboard } from "@/utils/helperUtils";

const LazyWalletInfoDisplay = lazy(
  () => import("@/components/wallet/WalletInfoDisplay"),
);

const LazyLoadingPlaceholder = () => (
  <View className="bg-light-main-container p-4 rounded-xl mb-4">
    <ActivityIndicator size="small" color="#c71c4b" />
  </View>
);

export default function Wallet() {
  const { width } = useWindowDimensions();
  const isSmallScreen = width < 360;
  const [refreshing, setRefreshing] = useState(false);
  const {
    wallets,
    activeWallet,
    activeWalletIndex,
    isLoading,
    setActiveWallet,
    loadWallets,
    renameWallet,
  } = useWallet();
  const [showWalletInfo, setShowWalletInfo] = useState(false);
  const { isReady, deferredTask } = usePerformance();
  const { bottom } = useSafeAreaInsets();
  const bottomOffset = Platform.OS === "ios" ? 0 : bottom > 0 ? bottom : 0;
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadWallets();
    setRefreshing(false);
  }, [loadWallets]);

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
  }, [showWalletInfo, deferredTask]);

  useEffect(() => {
    if (isReady && !isLoading && wallets.length === 0) {
      router.replace("/login");
    }
  }, [isLoading, wallets, isReady]);

  const handleWalletSwitch = useCallback(
    async (index: number) => {
      await deferredTask(async () => {
        setActiveWallet(index);
        setShowWalletInfo(false);
      }, "Switching wallet");
    },
    [setActiveWallet, deferredTask],
  );

  const renderWalletItem = useCallback(
    ({ item, index }: { item: TWallet; index: number }) => (
      <WalletCard
        wallet={item}
        isActive={index === activeWalletIndex}
        onPress={() => handleWalletSwitch(index)}
        allowRename={true}
        onRename={async (newName: string) => {
          await renameWallet(index, newName);
          loadWallets();
        }}
      />
    ),
    [activeWalletIndex, handleWalletSwitch, renameWallet, loadWallets],
  );

  const getItemLayout = useCallback(
    (_: any, index: number) => ({
      length: 60,
      offset: 60 * index,
      index,
    }),
    [],
  );

  const keyExtractor = useCallback(
    (item: TWallet, index: number) => item.address || `wallet-${index}`,
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
          contentContainerStyle={{ padding: isSmallScreen ? 12 : 16 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={["#c71c4b"]}
            />
          }
        >
          <Text
            className={`text-light-matte-black ${isSmallScreen ? "text-xl" : "text-2xl"} font-bold mb-4`}
          >
            Wallet
          </Text>

          <View className="bg-light rounded-xl p-4 mb-4 shadow-sm">
            <Text className="text-light-matte-black font-medium mb-3">
              Your Wallets
            </Text>

            <FlatList
              data={wallets}
              renderItem={renderWalletItem}
              keyExtractor={keyExtractor}
              getItemLayout={getItemLayout}
              removeClippedSubviews={true}
              initialNumToRender={4}
              maxToRenderPerBatch={4}
              windowSize={5}
              scrollEnabled={false}
              updateCellsBatchingPeriod={50}
              ListFooterComponent={
                <TouchableOpacity
                  activeOpacity={0.7}
                  className="flex-row items-center justify-center p-3 border border-dashed border-light-matte-black/20 rounded-xl mt-2"
                  onPress={() => router.push("/login")}
                >
                  <Plus
                    size={isSmallScreen ? 16 : 18}
                    color="#c71c4b"
                    className="mr-2"
                  />
                  <Text className="text-light-primary-red font-medium">
                    Add New Wallet
                  </Text>
                </TouchableOpacity>
              }
            />
          </View>

          <View className="bg-light rounded-xl p-4 mb-4 shadow-sm">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-light-matte-black font-medium">
                Wallet Details
              </Text>
              <Chip label={activeWallet.source} />
            </View>

            <AddressDisplay
              address={activeWallet.address}
              onCopy={() => copyToClipboard(activeWallet.address, "Address")}
            />

            <Suspense fallback={<LazyLoadingPlaceholder />}>
              <LazyWalletInfoDisplay
                wallet={activeWallet}
                showWalletInfo={showWalletInfo}
                onToggleVisibility={handleToggleWalletInfo}
                onCopy={copyToClipboard}
              />
            </Suspense>

            {activeWallet.type !== "Social" && <SecurityWarning />}
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
