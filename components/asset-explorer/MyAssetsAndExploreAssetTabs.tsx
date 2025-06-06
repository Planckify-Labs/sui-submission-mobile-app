import { TAssetCategoryTabsProps } from "@/constants/types/assetTypes";
import React from "react";
import { Pressable, Text, View } from "react-native";

const MyAssetsAndExploreAssetTabs = ({
  activeTab,
  setActiveTab,
  selectionMode,
}: TAssetCategoryTabsProps) => {
  if (selectionMode) return null;

  return (
    <View className="flex-row bg-light rounded-xl mb-4 shadow-sm overflow-hidden">
      <Pressable
        className={`flex-1 py-3 items-center ${
          activeTab === "my-assets" ? "bg-light-primary-red" : "bg-light"
        }`}
        onPress={() => setActiveTab("my-assets")}
      >
        <Text
          className={`font-bold ${
            activeTab === "my-assets" ? "text-white" : "text-light-matte-black"
          }`}
        >
          My Assets
        </Text>
      </Pressable>
      <Pressable
        className={`flex-1 py-3 items-center ${
          activeTab === "explore-assets" ? "bg-light-matte-black" : "bg-light"
        }`}
        onPress={() => setActiveTab("explore-assets")}
      >
        <Text
          className={`font-bold ${
            activeTab === "explore-assets"
              ? "text-white"
              : "text-light-matte-black"
          }`}
        >
          Explore Assets
        </Text>
      </Pressable>
    </View>
  );
};

export default MyAssetsAndExploreAssetTabs;
