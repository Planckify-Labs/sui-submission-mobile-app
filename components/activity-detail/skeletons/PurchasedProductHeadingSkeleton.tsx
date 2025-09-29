import React from "react";
import { View } from "react-native";
import SingleLoadingSekeleton from "@/components/common/SingleLoadingSekeleton";

export default function PurchasedProductHeadingSkeleton() {
  return (
    <View className="bg-light- rounded-3xl p-6 mx-4 mb-6 shadow-sm">
      <View className="items-center">
        <View className="w-24 h-24 rounded-3xl mb-4 overflow-hidden bg-light-main-container border-4 border-light-matte-black">
          <SingleLoadingSekeleton
            width="100%"
            height="100%"
            borderRadius={20}
          />
        </View>

        <View className="mb-2">
          <SingleLoadingSekeleton width={180} height={32} borderRadius={8} />
        </View>

        <View className="mb-3">
          <SingleLoadingSekeleton width={220} height={16} borderRadius={4} />
        </View>

        <View className="mt-4">
          <View className="px-3 py-1 rounded-full bg-gray-100">
            <SingleLoadingSekeleton width={80} height={14} borderRadius={4} />
          </View>
        </View>
      </View>
    </View>
  );
}
