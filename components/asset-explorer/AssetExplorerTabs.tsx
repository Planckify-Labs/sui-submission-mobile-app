import { TAssetCategoryTabsProps } from "@/constants/types/assetTypes";
import React from "react";
import { Pressable, Text, View } from "react-native";

const AssetCategoryTabs = ({
  activeTab,
  setActiveTab,
  selectionMode,
}: TAssetCategoryTabsProps) => {
  if (selectionMode) return null;

  return (
    <View className="flex-row bg-light rounded-xl mb-4 shadow-sm overflow-hidden">
      <Pressable
        className={`flex-1 py-3 items-center ${
          activeTab === "your-assets" ? "bg-light-primary-red" : "bg-light"
        }`}
        onPress={() => setActiveTab("your-assets")}
      >
        <Text
          className={`font-bold ${
            activeTab === "your-assets"
              ? "text-white"
              : "text-light-matte-black"
          }`}
        >
          Your Assets
        </Text>
      </Pressable>
      <Pressable
        className={`flex-1 py-3 items-center ${
          activeTab === "available-assets" ? "bg-light-primary-red" : "bg-light"
        }`}
        onPress={() => setActiveTab("available-assets")}
      >
        <Text
          className={`font-bold ${
            activeTab === "available-assets"
              ? "text-white"
              : "text-light-matte-black"
          }`}
        >
          Available Assets
        </Text>
      </Pressable>
    </View>
  );
};

export default AssetCategoryTabs;
