import { BellOff } from "lucide-react-native";
import React, { memo } from "react";
import { Text, View } from "react-native";

export const EmptyState = memo(() => {
  return (
    <View className="flex-1 items-center justify-center px-8 py-20">
      <View className="w-20 h-20 rounded-full bg-light-main-container items-center justify-center mb-4">
        <BellOff size={40} color="#20222c30" />
      </View>
      <Text className="text-light-matte-black font-bold text-xl mb-2">
        No Notifications
      </Text>
      <Text className="text-light-matte-black/50 text-center text-sm">
        You&apos;re all caught up! Check back later for updates.
      </Text>
    </View>
  );
});

EmptyState.displayName = "EmptyState";
