import { Image } from "expo-image";
import { Star } from "lucide-react-native";
import React, { memo } from "react";
import { Pressable, Text, View } from "react-native";
import type { TPromotionalItem } from "@/constants/dummyData/ecosystemList";

type FeaturedBannerProps = {
  item: TPromotionalItem;
  onPress: (url: string) => void;
  width: number;
};

const FeaturedBanner = memo<FeaturedBannerProps>(function FeaturedBanner({
  item,
  onPress,
  width,
}) {
  const handlePress = () => {
    onPress(item.url);
  };

  return (
    <Pressable
      onPress={handlePress}
      className="rounded-3xl overflow-hidden shadow-lg active:opacity-90"
      style={{
        width,
        backgroundColor: item.backgroundColor,
      }}
    >
      <View className="p-6 flex-row items-center justify-between">
        <View className="flex-1 pr-4">
          {item.isSponsored && (
            <View className="flex-row items-center mb-2">
              <Star size={14} color={item.textColor} fill={item.textColor} />
              <Text
                className="text-xs font-semibold ml-1"
                style={{ color: item.textColor }}
              >
                SPONSORED
              </Text>
            </View>
          )}
          <Text
            className="text-2xl font-bold mb-1"
            style={{ color: item.textColor }}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          <Text
            className="text-sm font-semibold mb-2 opacity-90"
            style={{ color: item.textColor }}
            numberOfLines={1}
          >
            {item.subtitle}
          </Text>
          <Text
            className="text-sm opacity-80"
            style={{ color: item.textColor }}
            numberOfLines={2}
          >
            {item.description}
          </Text>
        </View>
        <View className="w-20 h-20 rounded-2xl bg-white/20 items-center justify-center overflow-hidden">
          <Image
            source={{ uri: item.imageUrl }}
            style={{ width: 56, height: 56 }}
            contentFit="contain"
            transition={200}
          />
        </View>
      </View>
    </Pressable>
  );
});

export default FeaturedBanner;
