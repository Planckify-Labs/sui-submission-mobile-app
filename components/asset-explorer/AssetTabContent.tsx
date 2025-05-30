import { AssetListContentProps } from "@/constants/types/assetTypes";
import React from "react";
import { Pressable, Text, View } from "react-native";

const AssetListContent = ({
  activeTab,
  userAssets,
  filteredUserAssets,
  filteredAvailableAssets,
  searchQuery,
  setActiveTab,
  renderUserAssetItem,
  renderAvailableAssetItem,
}: AssetListContentProps) => {
  if (activeTab === "your-assets") {
    return (
      <View>
        {userAssets.length > 0 ? (
          filteredUserAssets.length > 0 ? (
            <View>
              {filteredUserAssets.map((item) => (
                <React.Fragment key={item.id}>
                  {renderUserAssetItem({ item })}
                </React.Fragment>
              ))}
            </View>
          ) : (
            searchQuery ? (
              <View className="items-center justify-center py-5">
                <Text className="text-light-matte-black/60 text-center">
                  No assets found matching your search
                </Text>
              </View>
            ) : null
          )
        ) : (
          <View className="items-center justify-center py-5">
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
      </View>
    );
  } else {
    return (
      <View>
        {filteredAvailableAssets.length > 0 ? (
          <View>
            {filteredAvailableAssets.map(item =>(
              <React.Fragment key={item.id}>
                {renderAvailableAssetItem({ item })}
              </React.Fragment>
            ))}
          </View>
        ) : (
          <View className="items-center justify-center py-10">
            <Text className="text-light-matte-black/60 text-center">
              {searchQuery
                ? "No assets found matching your search"
                : "No assets available"}
            </Text>
          </View>
        )}
      </View>
    );
  }
};

export default AssetListContent;
