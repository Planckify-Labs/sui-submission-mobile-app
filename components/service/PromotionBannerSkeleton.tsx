import React from "react";
import { View } from "react-native";
import SingleLoadingSekeleton from "../common/SingleLoadingSekeleton";

export default function PromotionBannerSkeleton() {
  return (
    <View className="mx-4 mb-6">
      <SingleLoadingSekeleton 
        width="100%" 
        height={120} 
        borderRadius={12} 
      />
    </View>
  );
} 