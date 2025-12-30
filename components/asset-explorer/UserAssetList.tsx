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
      <View className="items-center justify-center py-5">
        <Text className="text-light-matte-black/60 text-center mb-4">
          You haven't added any assets yet
        </Text>
        <Pressable
          onPress={onNavigateToExplore}
          className="bg-light-primary-red px-4 py-2 rounded-lg"
        >
          <Text className="text-white font-bold">Browse Available Assets</Text>
        </Pressable>
      </View>
    );
  }

  if (filteredUserAssets.length === 0 && searchQuery) {
    return (
      <View className="items-center justify-center py-5">
        <Text className="text-light-matte-black/60 text-center">
          No assets found matching your search
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
