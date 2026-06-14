import React, { memo } from "react";
import { Text, TouchableOpacity } from "react-native";

interface DepositButtonProps {
  isLoading: boolean;
  onPress: () => void;
  label?: string;
  disabled?: boolean;
}

export const DepositButton = memo<DepositButtonProps>(
  ({ isLoading, onPress, label = "Add Points", disabled }) => {
    const isDisabled = isLoading || disabled;
    return (
      <TouchableOpacity
        activeOpacity={isDisabled ? 1 : 0.7}
        className={`p-4 rounded-xl mx-5 mb-5 ${isDisabled ? "bg-gray-400/35" : "bg-light-primary-red"}`}
        onPress={onPress}
        disabled={isDisabled}
      >
        <Text className="text-white font-bold text-center text-base">
          {isLoading ? "Processing..." : label}
        </Text>
      </TouchableOpacity>
    );
  },
);

DepositButton.displayName = "DepositButton";
