import { RefreshCw } from "lucide-react-native";
import React, { memo } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { TErrorMessageProps } from "../../types/dapps-browser";

const DappsErrorMessage = memo<TErrorMessageProps>(function DappsErrorMessage({
  onRetry,
  message = "Something went wrong",
}) {
  return (
    <View className="px-4">
      <View className="bg-light-primary-red/10 border border-light-primary-red/20 rounded-2xl p-4">
        <Text className="text-light-matte-black font-semibold text-sm mb-2">
          {message}
        </Text>
        <Text className="text-light-matte-black/60 text-xs mb-3">
          Please check your connection and try again
        </Text>
        <TouchableOpacity
          onPress={onRetry}
          className="bg-light-primary-red rounded-xl py-2.5 px-4 flex-row items-center justify-center"
          activeOpacity={0.7}
        >
          <RefreshCw size={16} color="#ffffff" strokeWidth={2.5} />
          <Text className="text-white font-semibold text-sm ml-2">
            Try Again
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

export default DappsErrorMessage;
