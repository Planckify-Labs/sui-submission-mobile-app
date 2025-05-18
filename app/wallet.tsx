import Chip from "@/components/common/Chip";
import SecurityWarning from "@/components/common/SecurityWarning";
import AddressDisplay from "@/components/wallet/AddressDisplay";
import WalletCard from "@/components/wallet/WalletCard";
import WalletInfoDisplay from "@/components/wallet/WalletInfoDisplay";
import { useWallet } from "@/hooks/useWallet";
import { authenticateUser, copyToClipboard } from "@/utils/authUtils";
import { router } from "expo-router";
import { Plus } from "lucide-react-native";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function Wallet() {
  const {
    wallets,
    activeWallet,
    activeWalletIndex,
    isLoading,
    setActiveWallet,
  } = useWallet();
  const [showWalletInfo, setShowWalletInfo] = useState(false);

  const handleToggleWalletInfo = async () => {
    if (!showWalletInfo) {
      const isAuthenticated = await authenticateUser(
        "Authenticate to view wallet information",
      );
      if (isAuthenticated) {
        setShowWalletInfo(true);
      }
    } else {
      setShowWalletInfo(false);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView
        className="flex-1 bg-light-main-container justify-center items-center"
        edges={["top"]}
      >
        <ActivityIndicator size="large" color="#c71c4b" />
        <Text className="text-light-matte-black mt-4">Loading wallets...</Text>
      </SafeAreaView>
    );
  }

  return (
    <>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView className="flex-1 bg-light-main-container" edges={["top"]}>
        <ScrollView className="flex-1 p-6">
          <Text className="text-light-matte-black text-3xl font-bold mb-6">
            Wallet
          </Text>

          <View className="bg-light rounded-xl p-5 mb-6 shadow-sm">
            <Text className="text-light-matte-black font-medium mb-4">
              Your Wallets
            </Text>

            {wallets.map((wallet, index) => (
              <WalletCard
                key={index}
                wallet={wallet}
                isActive={index === activeWalletIndex}
                onPress={() => {
                  setActiveWallet(index);
                  setShowWalletInfo(false);
                }}
              />
            ))}

            <Pressable
              className="flex-row items-center justify-center p-4 border border-dashed border-light-matte-black/20 rounded-xl mt-2"
              onPress={() => router.push("/login")}
            >
              <Plus size={20} color="#c71c4b" className="mr-2" />
              <Text className="text-light-primary-red font-medium">
                Add New Wallet
              </Text>
            </Pressable>
          </View>

          <View className="bg-light rounded-xl p-5 mb-6 shadow-sm">
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

            <WalletInfoDisplay
              wallet={activeWallet}
              showWalletInfo={showWalletInfo}
              onToggleVisibility={handleToggleWalletInfo}
              onCopy={copyToClipboard}
            />

            {activeWallet.type !== "Social" && <SecurityWarning />}
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
