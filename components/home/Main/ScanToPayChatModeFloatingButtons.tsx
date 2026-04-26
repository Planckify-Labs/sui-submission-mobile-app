import { BlurView } from "expo-blur";
import { router } from "expo-router";
import { AudioLines, QrCode } from "lucide-react-native";
import React from "react";
import { Platform, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface ScanToPayChatModeFloatingButtonsProps {
  onChatModePress: () => void;
}

export default function ScanToPayChatModeFloatingButtons({
  onChatModePress,
}: ScanToPayChatModeFloatingButtonsProps) {
  const { bottom } = useSafeAreaInsets();
  const getBottomOffset = () => {
    if (Platform.OS === "ios") return 8;
    if (bottom > 0) return bottom + 8;
    return 2;
  };
  const bottomOffset = getBottomOffset();

  return (
    <View
      className="absolute justify-center items-center w-full"
      style={{ bottom: bottomOffset }}
    >
      <View className="flex-row gap-3 items-center">
        <BlurView
          intensity={20}
          experimentalBlurMethod="dimezisBlurView"
          className="overflow-hidden rounded-full"
        >
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => router.push("/scan-to-pay")}
            className="bg-light-primary-red/40 px-10 py-4 rounded-full flex-row items-center gap-2"
          >
            <QrCode size={22} color="#fff" />
            <Text className="text-light font-bold text-xl">Scan To Pay</Text>
          </TouchableOpacity>
        </BlurView>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={onChatModePress}
          className="items-center justify-center border-[6px] border-light bg-light-matte-black main rounded-full p-2 aspect-square"
        >
          <AudioLines size={20} color="#fff" stroke="#fff" strokeWidth={3} />
        </TouchableOpacity>
      </View>
    </View>
  );
}
