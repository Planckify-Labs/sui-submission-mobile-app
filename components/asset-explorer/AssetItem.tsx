import { Check, Plus, TrendingUp } from "lucide-react-native";
import React from "react";
import { Pressable, Text, View } from "react-native";
import OptimizedImage from "@/components/common/OptimizedImage";
import type { TAssetItemProps } from "@/constants/types/assetTypes";

const AssetItem = ({ item, state, actions }: TAssetItemProps) => {
  const { isAdded, isSelected, selectionMode } = state;
  const { onPress, onLongPress, onAddPress } = actions;

  return (
    <Pressable
      className={`flex-row items-center p-4 mb-2 rounded-2xl ${
        isSelected ? "bg-light-matte-black/5" : "bg-white"
      }`}
      style={{
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: isSelected ? 0 : 0.04,
        shadowRadius: 6,
        elevation: isSelected ? 0 : 2,
      }}
      onPress={onPress}
      onLongPress={onLongPress}
    >
      {/* Selection checkbox (left side when in selection mode) */}
      {selectionMode && (
        <View
          className={`w-6 h-6 rounded-full mr-3 items-center justify-center ${
            isSelected
              ? "bg-light-matte-black"
              : "border-2 border-light-matte-black/20"
          }`}
        >
          {isSelected && <Check size={14} color="white" strokeWidth={3} />}
        </View>
      )}

      {/* Token logo */}
      <View
        className="w-12 h-12 rounded-2xl items-center justify-center mr-3 bg-gray-50 overflow-hidden"
        style={{
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.08,
          shadowRadius: 4,
          elevation: 2,
        }}
      >
        <View className="w-8 h-8 rounded-full overflow-hidden justify-center items-center">
          <OptimizedImage
            source={{ uri: item.logo }}
            containerStyle={{ width: 32, height: 32 }}
            contentFit="cover"
            alt={`${item.name} logo`}
          />
        </View>
      </View>

      {/* Token info */}
      <View className="flex-1">
        <View className="flex-row items-center">
          <Text className="text-light-matte-black font-bold text-base">
            {item.name}
          </Text>
          {isAdded && (
            <View className="ml-2 px-2 py-0.5 rounded-full bg-green-500/10">
              <Text className="text-xs text-green-600 font-medium">Added</Text>
            </View>
          )}
        </View>
        <View className="flex-row items-center mt-0.5">
          <Text className="text-light-matte-black/50 text-sm font-medium">
            {item.symbol}
          </Text>
          <View className="w-1 h-1 rounded-full bg-light-matte-black/30 mx-2" />
          <Text className="text-light-matte-black/50 text-sm">
            {item.balance}
          </Text>
        </View>
      </View>

      {/* Right side - Value or Add button */}
      {!selectionMode && (
        <View className="items-end">
          <View className="flex-row items-center">
            <Text className="text-light-matte-black font-bold text-base">
              ${item.value}
            </Text>
          </View>
          <Pressable
            className="mt-1 w-8 h-8 rounded-xl bg-light-matte-black items-center justify-center active:scale-95"
            onPress={onAddPress}
            style={{
              shadowColor: "#20222c",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.2,
              shadowRadius: 4,
              elevation: 3,
            }}
          >
            <Plus size={16} color="white" strokeWidth={2.5} />
          </Pressable>
        </View>
      )}
    </Pressable>
  );
};

export default AssetItem;
