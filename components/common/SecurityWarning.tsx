import React from "react";
import { Text, View } from "react-native";
import { Shield } from "lucide-react-native";

type SecurityWarningProps = {
  message?: string;
};

export default function SecurityWarning({
  message = "Never share your private key or seed phrase with anyone. TakumiPay will never ask for this information.",
}: SecurityWarningProps) {
  return (
    <View className="bg-light-primary-red/10 p-4 rounded-xl mb-4">
      <View className="flex-row items-start">
        <Shield size={20} color="#c71c4b" className="mr-3 mt-1" />
        <Text className="text-light-matte-black flex-1">{message}</Text>
      </View>
    </View>
  );
}