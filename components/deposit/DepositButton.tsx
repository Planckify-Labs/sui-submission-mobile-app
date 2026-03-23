import React, { memo } from "react";
import { Text, TouchableOpacity } from "react-native";

interface DepositButtonProps {
  isLoading: boolean;
  onPress: () => void;
  label?: string;
}

export const DepositButton = memo<DepositButtonProps>(({ isLoading, onPress, label = "Add Points" }) => {
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      className="bg-light-primary-red p-4 rounded-xl mx-5 mb-5"
      onPress={onPress}
      disabled={isLoading}
    >
      <Text className="text-white font-bold text-center text-base">
        {isLoading ? "Processing..." : label}
      </Text>
    </TouchableOpacity>
  );
});
