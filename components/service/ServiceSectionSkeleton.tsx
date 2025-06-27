import React from "react";
import { View } from "react-native";
import SingleLoadingSekeleton from "../common/SingleLoadingSekeleton";

export default function ServiceSectionSkeleton() {
  return (
    <View className="px-4 mb-6">
      <View className="flex-row items-center justify-between mb-4">
        <SingleLoadingSekeleton width={120} height={24} />
        <SingleLoadingSekeleton width={80} height={20} />
      </View>
      <View className="flex-row flex-wrap justify-between">
        {[...Array(4)].map((_, index) => (
          <View key={index} className="w-[48%] mb-4">
            <SingleLoadingSekeleton width="100%" height={120} borderRadius={8} />
            <View className="mt-2">
              <SingleLoadingSekeleton width="80%" height={18} />
              <SingleLoadingSekeleton width="60%" height={14} style={{ marginTop: 4 }} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
} 