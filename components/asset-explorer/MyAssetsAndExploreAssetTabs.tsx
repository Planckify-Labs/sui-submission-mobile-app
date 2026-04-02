import { Coins, Compass } from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  LayoutChangeEvent,
  Pressable,
  Text,
  View,
} from "react-native";
import { TAssetCategoryTabsProps } from "@/constants/types/assetTypes";

const PADDING = 6; // p-1.5 = 6px

const MyAssetsAndExploreAssetTabs = ({
  activeTab,
  setActiveTab,
  selectionMode,
}: TAssetCategoryTabsProps) => {
  const slideAnim = useRef(new Animated.Value(0)).current;
  const [containerWidth, setContainerWidth] = useState(0);

  const tabWidth = containerWidth > 0 ? (containerWidth - PADDING * 2) / 2 : 0;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: activeTab === "my-assets" ? 0 : 1,
      useNativeDriver: true,
      tension: 80,
      friction: 10,
    }).start();
  }, [activeTab, slideAnim]);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    setContainerWidth(width);
  };

  if (selectionMode) return null;

  return (
    <View className="my-4">
      <View
        className="flex-row bg-white rounded-3xl p-1.5 relative"
        onLayout={onLayout}
        style={{
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.06,
          shadowRadius: 8,
          elevation: 2,
        }}
      >
        {containerWidth > 0 && (
          <Animated.View
            className="absolute top-1.5 bottom-1.5 rounded-2xl"
            style={{
              width: tabWidth,
              left: PADDING,
              backgroundColor:
                activeTab === "my-assets" ? "#c71c4b" : "#20222c",
              transform: [
                {
                  translateX: slideAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, tabWidth],
                  }),
                },
              ],
              shadowColor: activeTab === "my-assets" ? "#c71c4b" : "#20222c",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.25,
              shadowRadius: 8,
              elevation: 4,
            }}
          />
        )}

        <Pressable
          className="flex-1 py-3.5 items-center flex-row justify-center z-10"
          onPress={() => setActiveTab("my-assets")}
        >
          <Coins
            size={16}
            color={activeTab === "my-assets" ? "#fff" : "#20222c"}
            style={{ marginRight: 6 }}
          />
          <Text
            className={`font-semibold text-sm ${
              activeTab === "my-assets"
                ? "text-white"
                : "text-light-matte-black"
            }`}
          >
            My Assets
          </Text>
        </Pressable>

        <Pressable
          className="flex-1 py-3.5 items-center flex-row justify-center z-10"
          onPress={() => setActiveTab("explore-assets")}
        >
          <Compass
            size={16}
            color={activeTab === "explore-assets" ? "#fff" : "#20222c"}
            style={{ marginRight: 6 }}
          />
          <Text
            className={`font-semibold text-sm ${
              activeTab === "explore-assets"
                ? "text-white"
                : "text-light-matte-black"
            }`}
          >
            Explore
          </Text>
        </Pressable>
      </View>
    </View>
  );
};

export default MyAssetsAndExploreAssetTabs;
