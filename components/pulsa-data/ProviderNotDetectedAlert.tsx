import React, { memo } from "react";
import { Text, View } from "react-native";
import { usePhoneNumber } from "@/hooks/pulsa-data";

export const ProviderNotDetectedAlert = memo(
  function ProviderNotDetectedAlert() {
    const { showProviderNotDetected } = usePhoneNumber();

    if (!showProviderNotDetected) return null;

    return (
      <View className="bg-light-error/10 rounded-xl p-4 mb-4">
        <Text className="text-light-error font-medium text-sm">
          Provider not detected. We support Telkomsel, XL, Indosat, Tri, Axis,
          Smartfren, and by.U.
        </Text>
      </View>
    );
  },
);
