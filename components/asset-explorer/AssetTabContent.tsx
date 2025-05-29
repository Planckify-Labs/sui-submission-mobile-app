import { AssetListContentProps } from "@/constants/types/assetTypes";
import React from "react";
import { FlatList, Pressable, Text, View } from "react-native";

const AssetListContent = ({
  activeTab,
  userAssets,
  filteredUserAssets,
  filteredAvailableAssets,
  searchQuery,
  setActiveTab,
  renderUserAssetItem,
  renderAvailableAssetItem,
  selectionMode,
  isAssetAdded,
}: AssetListContentProps) => {
  if (activeTab === "your-assets") {
    return (
      <>
        {userAssets.length > 0 ? (
          <FlatList
            data={filteredUserAssets}
            renderItem={renderUserAssetItem}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 140 }}
            ListEmptyComponent={
              searchQuery ? (
                <View className="items-center justify-center py-5">
                  <Text className="text-light-matte-black/60 text-center">
                    No assets found matching your search
                  </Text>
                </View>
              ) : null
            }
          />
        ) : (
          <View className="flex-1 items-center justify-center">
            <Text className="text-light-matte-black/60 text-center mb-4">
              You haven't added any assets yet
            </Text>
            <Pressable
              onPress={() => setActiveTab("available-assets")}
              className="bg-light-primary-red px-4 py-2 rounded-lg"
            >
              <Text className="text-white font-bold">
                Browse Available Assets
              </Text>
            </Pressable>
          </View>
        )}
      </>
    );
  } else {
    return (
      <FlatList
        data={filteredAvailableAssets.filter(
          (asset) => !selectionMode || !isAssetAdded(asset.id),
        )}
        renderItem={renderAvailableAssetItem}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 140 }}
        ListEmptyComponent={
          <View className="items-center justify-center py-10">
            <Text className="text-light-matte-black/60 text-center">
              {searchQuery
                ? "No assets found matching your search"
                : "No assets available"}
            </Text>
          </View>
        }
      />
    );
  }
};

export default AssetListContent;
