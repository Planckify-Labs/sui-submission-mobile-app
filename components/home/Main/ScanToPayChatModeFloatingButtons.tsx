import { BlurView } from "expo-blur";
import { router } from "expo-router";
import { AudioLines, QrCode } from "lucide-react-native";
import React from "react";
import {
  Platform,
  Pressable,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const PRESS_SPRING = { damping: 12, stiffness: 320, mass: 0.6 };
const RELEASE_SPRING = { damping: 14, stiffness: 220, mass: 0.6 };

interface ScanToPayChatModeFloatingButtonsProps {
  onChatModePress: () => void;
}

function ScanToPayLiquidButton() {
  const scale = useSharedValue(1);
  const sheenOpacity = useSharedValue(0);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const sheenStyle = useAnimatedStyle(() => ({
    opacity: sheenOpacity.value,
  }));

  return (
    <AnimatedPressable
      onPressIn={() => {
        scale.value = withSpring(1.08, PRESS_SPRING);
        sheenOpacity.value = withTiming(1, { duration: 120 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, RELEASE_SPRING);
        sheenOpacity.value = withTiming(0, { duration: 200 });
      }}
      onPress={() => router.push("/scan-to-pay")}
      style={containerStyle}
    >
      <BlurView
        intensity={20}
        experimentalBlurMethod="dimezisBlurView"
        className="overflow-hidden rounded-full"
      >
        <View className="bg-light-primary-red/40 px-8 py-3 rounded-full flex-row items-center gap-2 border border-white/30">
          {/* press sheen — brightens the whole pill while held */}
          <Animated.View
            pointerEvents="none"
            className="absolute inset-0 bg-white/25 rounded-full"
            style={sheenStyle}
          />
          <QrCode size={22} color="#fff" />
          <Text className="text-light font-bold text-md">Scan To Pay</Text>
        </View>
      </BlurView>
    </AnimatedPressable>
  );
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
        <ScanToPayLiquidButton />
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
