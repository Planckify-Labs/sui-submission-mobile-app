import { ChevronRight, Trash2, TrendingDown, TrendingUp } from "lucide-react-native";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { TCryptoAsset } from "@/constants/types/assetTypes";
import OptimizedImage from "../common/OptimizedImage";

type UserAssetItemProps = {
  item: TCryptoAsset;
  removeAsset: (id: string) => void;
};

const UserAssetItem = ({ item, removeAsset }: UserAssetItemProps) => {
  const isPositiveChange = item.change.startsWith("+");

  return (
    <Pressable
      className="bg-white rounded-2xl p-4 mb-3"
      style={{
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
      }}
      onPress={() => {
        console.log("Asset Details:", `View details for ${item.name}`);
      }}
    >
      {/* Top section - Token info and delete */}
      <View className="flex-row items-center">
        {/* Token logo with gradient background */}
        <View
          className="w-14 h-14 rounded-2xl items-center justify-center mr-4 bg-gray-50 overflow-hidden"
          style={{
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.08,
            shadowRadius: 4,
            elevation: 2,
          }}
        >
          <View className="w-10 h-10 rounded-full overflow-hidden justify-center items-center">
            <OptimizedImage
              source={{ uri: item.logo }}
              containerStyle={{ width: 40, height: 40 }}
              contentFit="cover"
              alt={`${item.name} logo`}
            />
          </View>
        </View>

        {/* Token name and symbol */}
        <View className="flex-1">
          <Text className="text-light-matte-black font-bold text-lg">
            {item.name}
          </Text>
          <View className="flex-row items-center mt-0.5">
            <Text className="text-light-matte-black/50 font-medium">
              {item.symbol}
            </Text>
            <View
              className={`ml-2 px-2 py-0.5 rounded-full flex-row items-center ${
                isPositiveChange ? "bg-green-500/10" : "bg-red-500/10"
              }`}
            >
              {isPositiveChange ? (
                <TrendingUp size={10} color="#22c55e" />
              ) : (
                <TrendingDown size={10} color="#ef4444" />
              )}
              <Text
                className={`text-xs font-semibold ml-1 ${
                  isPositiveChange ? "text-green-600" : "text-red-500"
                }`}
              >
                {item.change}
              </Text>
            </View>
          </View>
        </View>

        {/* Delete button */}
        <Pressable
          hitSlop={10}
          onPress={() => removeAsset(item.id)}
          className="w-10 h-10 rounded-xl bg-light-primary-red/10 items-center justify-center active:bg-light-primary-red/20"
        >
          <Trash2 size={18} color="#c71c4b" />
        </Pressable>
      </View>

      {/* Bottom section - Balance and value */}
      <View className="flex-row items-center mt-4 pt-4 border-t border-light-matte-black/5">
        <View className="flex-1">
          <Text className="text-light-matte-black/40 text-xs font-medium uppercase tracking-wide">
            Balance
          </Text>
          <Text className="text-light-matte-black font-bold text-lg mt-0.5">
            {item.balance}{" "}
            <Text className="text-light-matte-black/40 text-sm font-normal">
              {item.symbol}
            </Text>
          </Text>
        </View>
        <View className="items-end flex-1">
          <Text className="text-light-matte-black/40 text-xs font-medium uppercase tracking-wide">
            Value
          </Text>
          <Text className="text-light-matte-black font-bold text-lg mt-0.5">
            ${item.value}
          </Text>
        </View>
        <ChevronRight
          size={20}
          color="#c71c4b"
          style={{ marginLeft: 8, opacity: 0.5 }}
        />
      </View>
    </Pressable>
  );
};

export default UserAssetItem;
