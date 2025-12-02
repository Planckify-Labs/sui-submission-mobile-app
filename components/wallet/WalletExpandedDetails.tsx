import React, { lazy, Suspense, useCallback } from "react";
import { ActivityIndicator, Animated, Text, View } from "react-native";
import Chip from "@/components/common/Chip";
import SecurityWarning from "@/components/common/SecurityWarning";
import { usePerformance } from "@/components/providers/PerformanceProvider";
import AddressDisplay from "@/components/wallet/AddressDisplay";
import type { TWallet } from "@/constants/types/walletTypes";
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

type WalletExpandedDetailsProps = {
  wallet: TWallet;
  showWalletInfo: boolean;
  setShowWalletInfo: (show: boolean) => void;
  animatedStyle?: object;
};

export default function WalletExpandedDetails({
  wallet,
  showWalletInfo,
  setShowWalletInfo,
  animatedStyle,
}: WalletExpandedDetailsProps) {
  const { deferredTask } = usePerformance();

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

  return (
    <Animated.View
      className="bg-light rounded-2xl p-4 shadow-sm overflow-hidden mx-4"
      style={animatedStyle}
    >
      <View className="flex-row justify-between items-center mb-4">
        <Text className="text-light-matte-black font-bold text-lg">
          Wallet Details
        </Text>
        <Chip label={wallet.source} />
      </View>

      <AddressDisplay
        address={wallet.address}
        onCopy={() => copyToClipboard(wallet.address, "Address")}
      />

      <Suspense fallback={<LazyLoadingPlaceholder />}>
        <LazyWalletInfoDisplay
          wallet={wallet}
          showWalletInfo={showWalletInfo}
          onToggleVisibility={handleToggleWalletInfo}
          onCopy={copyToClipboard}
        />
      </Suspense>

      {wallet.type !== "Social" && <SecurityWarning />}
    </Animated.View>
  );
}
