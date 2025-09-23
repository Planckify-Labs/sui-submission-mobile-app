import { AlertCircle, RefreshCw } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface DappsErrorMessageProps {
  onRetry: () => void;
  message?: string;
}

export default function DappsErrorMessage({
  onRetry,
  message = "Can't load DApps right now",
}: DappsErrorMessageProps) {
  return (
    <View className="px-4 justify-center items-center">
      <View className="rounded-2xl p-6 items-center justify-center bg-white w-full border border-gray-100">
        <View className="w-14 h-14 bg-light-primary-red/5 rounded-2xl items-center justify-center mb-4">
          <AlertCircle size={24} color="#c71c4b" />
        </View>

        <Text className="text-gray-800 font-semibold text-base mb-1 text-center">
          Oops! Something went wrong
        </Text>

        <Text className="text-gray-600 text-xs text-center leading-4 mb-5 px-2">
          {message}
        </Text>

        <TouchableOpacity
          activeOpacity={0.7}
          className="bg-light-primary-red px-5 py-2.5 rounded-xl flex-row items-center shadow-sm"
          onPress={onRetry}
        >
          <RefreshCw size={14} color="white" style={{ marginRight: 6 }} />
          <Text className="text-white font-medium text-xs">Retry</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
