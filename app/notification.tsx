import React from "react";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function NotificationScreen() {
  return (
    <SafeAreaView className="flex-1 bg-light-main-container">
      <View className="justify-center items-center flex-1">
        <Text className="text-lg font-medium">Notification</Text>
      </View>
    </SafeAreaView>
  );
}
