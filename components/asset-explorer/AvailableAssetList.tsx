import React from "react";
import { Text, View } from "react-native";
import type { TCryptoAsset } from "@/constants/types/assetTypes";
import AssetItem from "./AssetItem";
import AssetLoadingSkeletons from "./AssetLoadingSkeletons";

type TAvailableAssetListProps = {
  data: {
    filteredAssets: TCryptoAsset[];
    searchQuery: string;
  };
  state: {
    isLoading: boolean;
    selectionMode: boolean;
  };
  isAssetAdded: (id: string) => boolean;
  isAssetSelected: (id: string) => boolean;
  onAssetPress: (asset: TCryptoAsset) => void;
  onAssetLongPress: (asset: TCryptoAsset) => void;
  onAddPress: (asset: TCryptoAsset) => void;
};

const AvailableAssetList = ({
  data,
  state,
  isAssetAdded,
  isAssetSelected,
  onAssetPress,
  onAssetLongPress,
  onAddPress,
}: TAvailableAssetListProps) => {
  const { filteredAssets, searchQuery } = data;
  const { isLoading, selectionMode } = state;

  if (isLoading) {
    return <AssetLoadingSkeletons count={5} />;
  }

  if (filteredAssets.length === 0) {
    return (
      <View className="items-center justify-center py-10">
        <Text className="text-light-matte-black/60 text-center">
          {searchQuery
            ? "No assets found matching your search"
            : "No assets available"}
        </Text>
      </View>
    );
  }

  return (
    <View>
      {filteredAssets.map((item) => (
        <AssetItem
          key={item.id}
          item={item}
          state={{
            isAdded: isAssetAdded(item.id),
            isSelected: isAssetSelected(item.id),
            selectionMode,
          }}
          actions={{
            onPress: () => onAssetPress(item),
            onLongPress: () => onAssetLongPress(item),
            onAddPress: () => onAddPress(item),
          }}
        />
      ))}
    </View>
  );
};

export default AvailableAssetList;
