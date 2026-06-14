import React, { memo } from "react";
import { Text, TextInput, View } from "react-native";

interface AmountInputSectionProps {
  amount: string;
  tokenSymbol: string;
  tokenAmountNeeded: { human: number; raw: bigint } | null;
  onAmountChange: (value: string) => void;
}

export const AmountInputSection = memo<AmountInputSectionProps>(
  ({ amount, tokenSymbol, tokenAmountNeeded, onAmountChange }) => {
    return (
      <View className="mb-4 px-5">
        <Text className="text-light-matte-black/70 mb-2">Points</Text>
        <View className="flex-row items-center">
          <TextInput
            className="bg-light-main-container p-4 rounded-xl text-light-matte-black flex-1 text-lg font-semibold"
            value={amount}
            onChangeText={onAmountChange}
            placeholder="0"
            placeholderTextColor="#20222c80"
            keyboardType="decimal-pad"
          />
          <Text className="absolute right-4 text-light-matte-black/70 font-medium">
            points
          </Text>
        </View>
        {amount &&
        !isNaN(parseFloat(amount)) &&
        parseFloat(amount) > 0 &&
        parseFloat(amount) < 15000 ? (
          <Text className="text-red-500 text-xs mt-1.5 ml-1">
            Minimum 15,000 points
          </Text>
        ) : tokenAmountNeeded && tokenSymbol ? (
          <Text className="text-light-matte-black/50 text-xs mt-1.5 ml-1">
            {Number.isInteger(tokenAmountNeeded.human)
              ? tokenAmountNeeded.human.toLocaleString()
              : tokenAmountNeeded.human < 1
                ? tokenAmountNeeded.human.toFixed(6)
                : tokenAmountNeeded.human.toFixed(4)}{" "}
            {tokenSymbol} required
          </Text>
        ) : null}
      </View>
    );
  },
);

AmountInputSection.displayName = "AmountInputSection";
