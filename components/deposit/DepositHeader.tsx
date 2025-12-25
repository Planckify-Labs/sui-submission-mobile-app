import { router } from "expo-router";
import { ArrowLeft, Clock } from "lucide-react-native";
import React, { memo } from "react";
import { Text, TouchableOpacity, View } from "react-native";

export const DepositHeader = memo(() => {
  return (
    <View className="flex-row items-center justify-between mb-6">
      <View className="flex-row items-center">
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => router.back()}
          className="mr-4"
        >
          <ArrowLeft color="#c71c4b" size={24} />
        </TouchableOpacity>
        <Text className="text-light-matte-black text-xl font-bold">
          Deposit
        </Text>
      </View>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => router.push("/activities")}
        className="flex-row items-center gap-1.5 bg-light-main-container px-3 py-2 rounded-lg"
      >
        <Clock size={16} color="#c71c4b" />
        <Text className="text-light-primary-red text-xs font-semibold">
          History
        </Text>
      </TouchableOpacity>
    </View>
  );
});
