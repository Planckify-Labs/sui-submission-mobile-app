import React, { memo } from "react";
import { Text, TextInput, View } from "react-native";

interface AmountInputSectionProps {
  amount: string;
  fiatAmount: string;
  tokenSymbol: string;
  onAmountChange: (value: string) => void;
  onFiatAmountChange: (value: string) => void;
}

export const AmountInputSection = memo<AmountInputSectionProps>(
  ({ amount, fiatAmount, tokenSymbol, onAmountChange, onFiatAmountChange }) => {
    return (
      <>
        <View className="mb-4 px-5">
          <Text className="text-light-matte-black/70 mb-2">Amount (Crypto)</Text>
          <View className="flex-row items-center">
            <TextInput
              className="bg-light-main-container p-4 rounded-xl text-light-matte-black flex-1 text-lg font-semibold"
              value={amount}
              onChangeText={onAmountChange}
              placeholder="0.0"
              placeholderTextColor="#20222c80"
              keyboardType="decimal-pad"
            />
            <Text className="absolute right-4 text-light-matte-black/70 font-medium">
              {tokenSymbol}
            </Text>
          </View>
        </View>

        <View className="mb-6 px-5">
          <Text className="text-light-matte-black/70 mb-2">Amount (Fiat)</Text>
          <View className="flex-row items-center">
            <TextInput
              className="bg-light-main-container p-4 rounded-xl text-light-matte-black flex-1 text-lg font-semibold"
              value={fiatAmount}
              onChangeText={onFiatAmountChange}
              placeholder="0.00"
              placeholderTextColor="#20222c80"
              keyboardType="decimal-pad"
            />
            <Text className="absolute right-4 text-light-matte-black/70 font-medium">
              USD
            </Text>
          </View>
        </View>
      </>
    );
  }
);
