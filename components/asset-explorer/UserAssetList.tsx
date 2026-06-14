import { Compass, SearchX, Wallet } from "lucide-react-native";
import React from "react";
import { Pressable, Text, View } from "react-native";
import type { TCryptoAsset } from "@/constants/types/assetTypes";
import UserAssetItem from "./UserAssetItem";

type TUserAssetListProps = {
  data: {
    userAssets: TCryptoAsset[];
    filteredUserAssets: TCryptoAsset[];
    searchQuery: string;
  };
  onNavigateToExplore: () => void;
  removeAsset: (id: string) => void;
};

const UserAssetList = ({
  data,
  onNavigateToExplore,
  removeAsset,
}: TUserAssetListProps) => {
  const { userAssets, filteredUserAssets, searchQuery } = data;

  if (userAssets.length === 0) {
    return (
      <View className="items-center justify-center py-12 px-6">
        <View className="w-20 h-20 rounded-3xl bg-light-primary-red/10 items-center justify-center mb-4">
          <Wallet size={36} color="#c71c4b" />
        </View>
        <Text className="text-light-matte-black font-bold text-xl mb-2 text-center">
          No Assets Yet
        </Text>
        <Text className="text-light-matte-black/50 text-center mb-6 leading-5">
          Start building your portfolio by exploring and adding tokens
        </Text>
        <Pressable
          onPress={onNavigateToExplore}
          className="bg-light-primary-red px-6 py-3.5 rounded-xl flex-row items-center"
          style={{
            shadowColor: "#c71c4b",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 4,
          }}
        >
          <Compass size={18} color="#fff" />
          <Text className="text-white font-bold ml-2">Explore Assets</Text>
        </Pressable>
      </View>
    );
  }

  if (filteredUserAssets.length === 0 && searchQuery) {
    return (
      <View className="items-center justify-center py-12 px-6">
        <View className="w-16 h-16 rounded-2xl bg-gray-100 items-center justify-center mb-4">
          <SearchX size={28} color="#9ca3af" />
        </View>
        <Text className="text-light-matte-black font-bold text-lg mb-1 text-center">
          No Results
        </Text>
        <Text className="text-light-matte-black/50 text-center">
          No assets match &quot;{searchQuery}&quot;
        </Text>
      </View>
    );
  }

  return (
    <View>
      {filteredUserAssets.map((item) => (
        <UserAssetItem key={item.id} item={item} removeAsset={removeAsset} />
      ))}
    </View>
  );
};

export default UserAssetList;
