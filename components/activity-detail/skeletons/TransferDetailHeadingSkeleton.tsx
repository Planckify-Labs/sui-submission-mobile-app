import React from "react";
import { View } from "react-native";
import SingleLoadingSekeleton from "@/components/common/SingleLoadingSekeleton";

export default function TransferDetailHeadingSkeleton() {
  return (
    <View className="items-center mb-6">
      <View className="w-24 h-24 rounded-3xl mb-4 overflow-hidden bg-light-main-container">
        <SingleLoadingSekeleton width="100%" height="100%" borderRadius={20} />
      </View>

      <View className="mb-2">
        <SingleLoadingSekeleton width={160} height={32} borderRadius={8} />
      </View>

      <View className="mb-3">
        <SingleLoadingSekeleton width={120} height={16} borderRadius={4} />
      </View>

      <View className="mb-3">
        <SingleLoadingSekeleton width={100} height={14} borderRadius={4} />
      </View>
    </View>
  );
}
