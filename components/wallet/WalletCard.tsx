import Chip from "@/components/common/Chip";
import { type TWallet } from "@/constants/walletData";
import { Check, Wallet as WalletIcon } from "lucide-react-native";
import React from "react";
import { Pressable, Text, View } from "react-native";

type WalletCardProps = {
  wallet: TWallet;
  isActive: boolean;
  onPress: () => void;
};

export default function WalletCard({
  wallet,
  isActive,
  onPress,
}: WalletCardProps) {
  return (
    <Pressable
      className={`p-4 rounded-xl mb-2 flex-row justify-between items-center ${
        isActive ? "bg-light-primary-red/10" : "bg-light-main-container"
      }`}
      onPress={onPress}
    >
      <View className="flex-row items-center">
        <WalletIcon size={20} color="#c71c4b" className="mr-3" />
        <View>
          <Text className="text-light-matte-black font-bold">
            {wallet.name}
          </Text>
          <View className="flex-row items-center">
            <Text className="text-light-matte-black/70">
              {wallet.address.substring(0, 8)}...
              {wallet.address.substring(wallet.address.length - 6)}
            </Text>
            <Chip label={wallet.type} size="small" style={{ marginLeft: 8 }} />
          </View>
        </View>
      </View>
      <View className="flex-row items-center">
        <Text className="text-light-matte-black font-medium mr-2">
          {wallet.balance}
        </Text>
        {isActive && (
          <View className="w-5 h-5 rounded-full items-center justify-center">
            <Check size={14} color="#c71c4b" strokeWidth={3} />
          </View>
        )}
      </View>
    </Pressable>
  );
}
