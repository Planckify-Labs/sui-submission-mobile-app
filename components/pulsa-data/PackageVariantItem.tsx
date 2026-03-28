import React, { memo } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import type { TProductVariant } from "@/api/types/product";

interface PackageVariantItemProps {
  variant: TProductVariant;
  disabled: boolean;
  onPress: (variant: TProductVariant) => void;
}

function formatPrice(price: string): string {
  return parseInt(price).toLocaleString();
}

export const PackageVariantItem = memo(function PackageVariantItem({
  variant,
  disabled,
  onPress,
}: PackageVariantItemProps) {
  const price = variant.ProductPrice[0]?.sellPrice || "0";

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => onPress(variant)}
      disabled={disabled}
      className={`bg-light rounded-xl p-4 mb-3 ${disabled ? "opacity-50" : ""}`}
    >
      <View className="flex-row justify-between items-center">
        <View className="flex-1">
          <Text className="text-light-matte-black font-bold text-base">
            {variant.name}
          </Text>
          <Text className="text-light-matte-black/70 text-xs mt-1">
            {variant.description}
          </Text>
        </View>
        <Text className="text-light-primary-red font-bold text-base ml-2">
          {formatPrice(price)} points
        </Text>
      </View>
    </TouchableOpacity>
  );
});
