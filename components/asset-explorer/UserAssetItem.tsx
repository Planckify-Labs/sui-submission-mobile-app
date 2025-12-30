import { Trash2 } from "lucide-react-native";
import React from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { TCryptoAsset } from "@/constants/types/assetTypes";
import OptimizedImage from "../common/OptimizedImage";

type UserAssetItemProps = {
  item: TCryptoAsset;
  removeAsset: (id: string) => void;
};

const UserAssetItem = ({ item, removeAsset }: UserAssetItemProps) => {
  return (
    <Pressable
      className="bg-light rounded-xl p-4 mb-3 shadow-sm"
      onPress={() => {
        console.log("Asset Details:", `View details for ${item.name}`);
      }}
    >
      <View className="flex-row justify-between items-center">
        <View className="flex-row items-center">
          <View className="w-10 h-10 rounded-full overflow-hidden items-center justify-center mr-3">
            <OptimizedImage
              source={{ uri: item.logo }}
              style={{ width: 30, height: 30 }}
              contentFit="contain"
              alt={`${item.name} logo`}
            />
          </View>
          <View>
            <Text className="text-light-matte-black font-bold">
              {item.name}
            </Text>
            <Text className="text-light-matte-black/60">{item.symbol}</Text>
          </View>
        </View>

        <Pressable
          hitSlop={10}
          onPress={() => removeAsset(item.id)}
          className="p-2"
        >
          <Trash2 size={18} color="#c71c4b" />
        </Pressable>
      </View>

      <View className="flex-row justify-between items-center mt-3 pt-3 border-t border-light-matte-black/10">
        <View>
          <Text className="text-light-matte-black/60 text-xs">Balance</Text>
          <Text className="text-light-matte-black font-medium">
            {item.balance} {item.symbol}
          </Text>
        </View>
        <View>
          <Text className="text-light-matte-black/60 text-xs">Value</Text>
          <Text className="text-light-matte-black font-medium">
            ${item.value}
          </Text>
        </View>
        <View>
          <Text className="text-light-matte-black/60 text-xs">24h</Text>
          <Text
            className={
              item.change.startsWith("+")
                ? "text-green-500 font-medium"
                : "text-red-500 font-medium"
            }
          >
            {item.change}
          </Text>
        </View>
      </View>
    </Pressable>
  );
};

export default UserAssetItem;
