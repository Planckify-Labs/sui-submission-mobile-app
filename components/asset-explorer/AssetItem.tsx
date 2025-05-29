import { TCryptoAsset } from "@/constants/types/assetTypes";
import { Check } from "lucide-react-native";
import React from "react";
import { Pressable, Text, View } from "react-native";

type AssetItemProps = {
  item: TCryptoAsset;
  isAdded: boolean;
  isSelected: boolean;
  selectionMode: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onAddPress: () => void;
};

const AssetItem = ({
  item,
  isAdded,
  isSelected,
  selectionMode,
  onPress,
  onLongPress,
  onAddPress,
}: AssetItemProps) => {
  return (
    <Pressable
      className={`bg-light rounded-xl p-4 mb-3 shadow-sm ${
        isSelected ? "border-2 border-light-primary-red" : ""
      }`}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={500}
      disabled={isAdded && !selectionMode}
    >
      <View className="flex-row justify-between items-center">
        <View className="flex-row items-center">
          <View className="w-10 h-10 bg-light-primary-red/10 rounded-full items-center justify-center mr-3">
            <Text className="text-light-primary-red text-lg font-bold">
              {item.logo}
            </Text>
          </View>
          <View>
            <Text className="text-light-matte-black font-bold">
              {item.name}
            </Text>
            <Text className="text-light-matte-black/60">{item.symbol}</Text>
          </View>
        </View>

        {selectionMode ? (
          <View
            className={`w-6 h-6 rounded-full items-center justify-center ${
              isSelected
                ? "bg-light-primary-red"
                : "border border-light-matte-black/20"
            }`}
          >
            {isSelected && <Check size={14} color="#fff" strokeWidth={3} />}
          </View>
        ) : isAdded ? (
          <View className="bg-green-500/10 px-3 py-1 rounded-full flex-row items-center">
            <Check size={14} color="#22c55e" className="mr-1" />
            <Text className="text-green-500 text-xs font-medium">Added</Text>
          </View>
        ) : (
          <Pressable
            className="bg-light-primary-red/10 px-3 py-1 rounded-full"
            onPress={onAddPress}
          >
            <Text className="text-light-primary-red text-xs font-medium">
              Add
            </Text>
          </Pressable>
        )}
      </View>
    </Pressable>
  );
};

export default AssetItem;
