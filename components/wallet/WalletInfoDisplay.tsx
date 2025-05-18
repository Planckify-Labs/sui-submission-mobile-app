import { type TWallet } from "@/constants/walletData";
import { Copy, Eye, EyeOff } from "lucide-react-native";
import React from "react";
import { Pressable, Text, View } from "react-native";

type TWalletInfoDisplayProps = {
  wallet: TWallet;
  showWalletInfo: boolean;
  onToggleVisibility: () => void;
  onCopy: (text: string, label: string) => void;
};

export default function WalletInfoDisplay({
  wallet,
  showWalletInfo,
  onToggleVisibility,
  onCopy,
}: TWalletInfoDisplayProps) {
  if (!wallet.type) return null;

  switch (wallet.type) {
    case "SeedPhrase":
      return (
        <View className="mb-4">
          <Text className="text-light-matte-black/70 mb-1">Seed Phrase</Text>
          <View className="bg-light-main-container p-4 rounded-xl">
            <Text className="text-light-matte-black mb-2">
              {showWalletInfo
                ? wallet.seedPhrase
                : "•••• •••• •••• •••• •••• •••• •••• •••• •••• •••• •••• ••••"}
            </Text>
            <View className="flex-row justify-end">
              <Pressable onPress={onToggleVisibility} className="mr-3">
                {showWalletInfo ? (
                  <EyeOff size={20} color="#c71c4b" />
                ) : (
                  <Eye size={20} color="#c71c4b" />
                )}
              </Pressable>
              {showWalletInfo && wallet.seedPhrase && (
                <Pressable
                  onPress={() => onCopy(wallet.seedPhrase || "", "Seed Phrase")}
                >
                  <Copy size={20} color="#c71c4b" />
                </Pressable>
              )}
            </View>
          </View>
        </View>
      );

    case "PrivateKey":
      return (
        <View className="mb-4">
          <Text className="text-light-matte-black/70 mb-1">Private Key</Text>
          <View className="flex-row items-center justify-between bg-light-main-container p-4 rounded-xl">
            <Text className="text-light-matte-black flex-1 mr-3">
              {showWalletInfo
                ? wallet.privateKey
                : "••••••••••••••••••••••••••••••••"}
            </Text>
            <View className="flex-row">
              <Pressable onPress={onToggleVisibility} className="mr-3">
                {showWalletInfo ? (
                  <EyeOff size={20} color="#c71c4b" />
                ) : (
                  <Eye size={20} color="#c71c4b" />
                )}
              </Pressable>
              {showWalletInfo && (
                <Pressable
                  onPress={() => onCopy(wallet.privateKey, "Private Key")}
                >
                  <Copy size={20} color="#c71c4b" />
                </Pressable>
              )}
            </View>
          </View>
        </View>
      );

    case "Social":
      return (
        <View className="mb-4">
          <Text className="text-light-matte-black/70 mb-1">
            Connected Account
          </Text>
          <View className="bg-light-main-container p-4 rounded-xl">
            <View className="flex-row items-center mb-3">
              <View className="w-8 h-8 bg-light-primary-red/10 rounded-full items-center justify-center mr-3">
                <Text className="text-light-primary-red font-bold">
                  {wallet.socialAccount?.provider.charAt(0) || "?"}
                </Text>
              </View>
              <View>
                <Text className="text-light-matte-black font-medium">
                  {wallet.socialAccount?.provider} Account
                </Text>
                <Text className="text-light-matte-black/70">
                  {wallet.socialAccount?.email}
                </Text>
              </View>
            </View>
            <Text className="text-light-matte-black/70 text-sm">
              This wallet is secured by your {wallet.socialAccount?.provider}{" "}
              account. You can access it by logging in with{" "}
              {wallet.socialAccount?.provider}.
            </Text>
          </View>
        </View>
      );

    default:
      return null;
  }
}
