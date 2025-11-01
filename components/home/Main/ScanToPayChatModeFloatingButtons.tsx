import { BlurView } from "expo-blur";
import { router } from "expo-router";
import { AudioLines, MessageCircle, Mic, QrCode } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface ScanToPayChatModeFloatingButtonsProps {
  onChatModePress: () => void;
}

export default function ScanToPayChatModeFloatingButtons({
  onChatModePress,
}: ScanToPayChatModeFloatingButtonsProps) {
  return (
    <View className="absolute bottom-2 justify-center items-center w-full">
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
          className="items-center justify-center border-[6px] border-light bg-light-matte-black main rounded-full p-2 aspect-square flex"
        >
          <AudioLines size={20} color="#fff" stroke="#fff" strokeWidth={3} />
        </TouchableOpacity>
      </View>
    </View>
  );
}
