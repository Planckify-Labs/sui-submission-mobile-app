import React, { memo } from "react";
import { Text, TouchableOpacity, View } from "react-native";

const QUICK_AMOUNTS = ["10", "25", "50", "100", "500"];

interface QuickAmountButtonsProps {
  onSelect: (value: string) => void;
}

export const QuickAmountButtons = memo<QuickAmountButtonsProps>(({ onSelect }) => {
  return (
    <View className="mb-6 px-5">
      <View className="flex-row flex-wrap gap-2">
        {QUICK_AMOUNTS.map((amount) => (
          <TouchableOpacity
            key={amount}
            activeOpacity={0.7}
            className="bg-light-main-container py-2.5 px-4 rounded-lg"
            onPress={() => onSelect(amount)}
          >
            <Text className="text-light-primary-red text-sm font-semibold">
              ${amount}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
});
