import { TWalletInfoProps } from "@/constants/types/networkTypes";
import React from "react";
import { Text, View } from "react-native";

const WalletInfo = ({ activeWallet }: TWalletInfoProps) => {
  return (
    <View className="bg-light rounded-xl p-4 mb-4 shadow-sm">
      <Text className="text-light-matte-black/60 mb-1">Current Wallet</Text>
      <Text className="text-light-matte-black font-bold mb-1">
        {activeWallet?.name || "My Wallet"}
      </Text>
      <Text
        className="text-light-matte-black/70 text-xs"
        numberOfLines={1}
        ellipsizeMode="middle"
      >
        {activeWallet?.address || "No wallet selected"}
      </Text>
    </View>
  );
};

export default WalletInfo;
