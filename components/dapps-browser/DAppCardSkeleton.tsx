import React from "react";
import { View } from "react-native";
import SingleLoadingSkeleton from "@/components/common/SingleLoadingSkeleton";

export default function DAppCardSkeleton() {
  return (
    <View className="bg-white rounded-2xl p-4 border border-gray-100 min-w-[170px]">
      <View className="flex-row items-center mb-2">
        <View className="w-10 h-10 rounded-full bg-light-main-container items-center justify-center mr-3">
          <SingleLoadingSkeleton width={24} height={24} borderRadius={12} />
        </View>
        <View className="flex-1">
          <SingleLoadingSkeleton
            width="80%"
            height={14}
            borderRadius={4}
            style={{ marginBottom: 4 }}
          />
          <SingleLoadingSkeleton width={60} height={12} borderRadius={4} />
        </View>
        <SingleLoadingSkeleton width={16} height={16} borderRadius={4} />
      </View>
      <View className="space-y-2">
        <SingleLoadingSkeleton width="100%" height={12} borderRadius={4} />
        <SingleLoadingSkeleton width="85%" height={12} borderRadius={4} />
      </View>
    </View>
  );
}
