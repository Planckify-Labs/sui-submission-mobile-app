import { Image } from "expo-image";
import { Shield } from "lucide-react-native";
import React from "react";
import { TextInput, TouchableOpacity, View } from "react-native";

interface BrowserAddressBarProps {
  addressBarText: string;
  onChangeText: (text: string) => void;
  onSubmitEditing: () => void;
  addressBarRef: React.RefObject<TextInput | null>;
  isWalletConnected?: boolean;
}

export default function BrowserAddressBar({
  addressBarText,
  onChangeText,
  onSubmitEditing,
  addressBarRef,
  isWalletConnected = true,
}: BrowserAddressBarProps) {
  return (
    <View className="flex-row gap-3 px-4 py-2 bg-light-main-container items-center">
      <View className="flex-1 bg-light rounded-2xl flex-row items-center px-4 py-1">
        <Shield size={18} color="#9CA3AF" strokeWidth={2} />
        <TextInput
          ref={addressBarRef}
          value={addressBarText}
          onChangeText={onChangeText}
          onSubmitEditing={onSubmitEditing}
          placeholder="Search or enter website URL"
          className="flex-1 text-light-matte-black text-base"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          placeholderTextColor="#9CA3AF"
        />
      </View>

      <TouchableOpacity
        activeOpacity={0.7}
        className={`w-12 h-12 bg-light rounded-2xl items-center justify-center relative border-2 ${isWalletConnected ? "border-emerald-700" : "border-gray-400"}`}
      >
        <Image
          source={require("@/assets/images/takumipay-no-bg.png")}
          style={{ width: 20, height: 20 }}
          contentFit="contain"
        />
      </TouchableOpacity>
    </View>
  );
}
