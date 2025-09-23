import React from "react";
import { Dimensions, View } from "react-native";
import SingleLoadingSekeleton from "../common/SingleLoadingSekeleton";

const { width: screenWidth } = Dimensions.get("window");
const PROMO_CARD_WIDTH = screenWidth * 0.85;

export default function PromotionalCardSkeleton() {
  return (
    <View
      className="rounded-3xl p-6 mr-4"
      style={{
        width: PROMO_CARD_WIDTH,
        backgroundColor: "#E0E0E0",
      }}
    >
      <View className="flex-row items-start justify-between mb-4">
        <View className="flex-1">
          <View className="mb-2">
            <SingleLoadingSekeleton width={80} height={20} borderRadius={10} />
          </View>
          <SingleLoadingSekeleton
            width="80%"
            height={24}
            borderRadius={4}
            style={{ marginBottom: 4 }}
          />
          <SingleLoadingSekeleton width="60%" height={16} borderRadius={4} />
        </View>
        <View className="ml-4">
          <SingleLoadingSekeleton width={48} height={48} borderRadius={24} />
        </View>
      </View>

      <View className="space-y-2">
        <SingleLoadingSekeleton width="100%" height={14} borderRadius={4} />
        <SingleLoadingSekeleton width="85%" height={14} borderRadius={4} />
        <SingleLoadingSekeleton width="70%" height={14} borderRadius={4} />
      </View>
    </View>
  );
}
