import { ArrowUpRight } from "lucide-react-native";
import React from "react";
import { Image, Text, TouchableOpacity, View } from "react-native";
import { TDapp } from "@/api/types/dapp";

interface DAppCardProps {
  dapp: TDapp;
  isCompact?: boolean;
  onPress: (url: string) => void;
}

export default function DAppCard({
  dapp,
  isCompact = false,
  onPress,
}: DAppCardProps) {
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => onPress(dapp.websiteUrl)}
      className={`bg-white rounded-2xl p-4 border border-gray-100 flex-1`}
    >
      <View className="flex-row items-center mb-2">
        <View className="w-10 h-10 rounded-full bg-light-main-container items-center justify-center mr-3">
          <Image
            source={{ uri: dapp.logoUrl }}
            style={{ width: 24, height: 24 }}
            resizeMode="contain"
          />
        </View>
        <View className="flex-1">
          <Text className="text-light-matte-black font-bold text-sm text-ellipsis w-fit">
            {dapp.name}
          </Text>
          {dapp.isPopular && (
            <View className="flex-row items-center mt-1">
              <Text className="text-light-primary-red text-xs font-medium ml-1">
                🔥 Popular
              </Text>
            </View>
          )}
        </View>
        <ArrowUpRight color="#c71c4b" size={16} />
      </View>
      <Text
        className="text-light-matte-black/60 text-xs leading-4 text-ellipsis"
        numberOfLines={isCompact ? 1 : 3}
      >
        {dapp.description}
      </Text>
    </TouchableOpacity>
  );
}
