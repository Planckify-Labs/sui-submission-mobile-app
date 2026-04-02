import React, { memo } from "react";
import { Text, View } from "react-native";

interface DepositInfoCardProps {
  tokenSymbol: string;
  chainName: string;
}

export const DepositInfoCard = memo<DepositInfoCardProps>(
  ({ tokenSymbol, chainName }) => {
    return (
      <View className="bg-light rounded-xl p-5 mb-6 shadow-xs">
        <Text className="text-light-matte-black font-medium mb-3">
          Deposit Information
        </Text>
        <Text className="text-light-matte-black/70 text-sm mb-2">
          • Deposits are credited after network confirmation
        </Text>
        <Text className="text-light-matte-black/70 text-sm mb-2">
          • Minimum deposit: 1 {tokenSymbol || "token"}
        </Text>
        <Text className="text-light-matte-black/70 text-sm mb-2">
          • Network fees apply based on blockchain congestion
        </Text>
        <Text className="text-light-matte-black/70 text-sm">
          • Only send {tokenSymbol || "tokens"} on {chainName} network
        </Text>
      </View>
    );
  },
);
