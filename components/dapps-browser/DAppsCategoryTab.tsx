import { BlurView } from "expo-blur";
import React from "react";
import {
  Animated,
  LayoutChangeEvent,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import SingleLoadingSekeleton from "@/components/common/SingleLoadingSekeleton";
import { dappQueryKeys } from "@/constants/queryKeys/dappQueryKeys";
import { useDappCategories } from "@/hooks/queries/useDapps";
import useRQGlobalState from "@/hooks/useRQGlobalState";

interface FloatingDAppsCategoryTabProps {
  onLayout: (event: LayoutChangeEvent) => void;
  tabWidth: number;
  horizontalScrollX: Animated.Value;
}

export default function DAppsCategoryTab({
  onLayout,
  tabWidth,
  horizontalScrollX,
}: FloatingDAppsCategoryTabProps) {
  const { data: categories, isLoading } = useDappCategories();

  const { data: activeCategoryState, setNewData: setActiveCategoryState } =
    useRQGlobalState<{ activeCategory: string }>({
      queryKey: dappQueryKeys.activeCategory,
      initialData: { activeCategory: "" },
    });

  const activeCategory = activeCategoryState?.activeCategory || "";

  const handleTabChange = (categoryId: string) => {
    setActiveCategoryState({ activeCategory: categoryId });
  };

  const tabs =
    categories
      ?.filter((category) => category.isActive)
      ?.map((category) => ({
        id: category.id,
        label: category.name,
      })) || [];

  if (isLoading) {
    return (
      <BlurView
        intensity={30}
        experimentalBlurMethod="dimezisBlurView"
        className="overflow-hidden rounded-full absolute bottom-4 left-0 right-0 mx-4 border-4 border-light-main-container/80"
      >
        <View className="bg-mainborder-light-main-container/10 w-full flex-row items-center relative py-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <View
              key={index}
              className="flex-1 items-center justify-center px-2"
            >
              <SingleLoadingSekeleton
                width="80%"
                height={12}
                borderRadius={6}
                style={{ backgroundColor: "#E0E0E0" }}
              />
            </View>
          ))}
        </View>
      </BlurView>
    );
  }

  if (tabs.length === 0) {
    return null;
  }

  return (
    <BlurView
      intensity={30}
      experimentalBlurMethod="dimezisBlurView"
      className="overflow-hidden rounded-full absolute bottom-4 left-0 right-0 mx-4 border-4 border-light-main-container/80"
    >
      <View
        className="bg-mainborder-light-main-container/10 w-full flex-row items-center relative"
        onLayout={onLayout}
      >
        {tabs.map((tab, index) => (
          <TouchableOpacity
            key={tab.id}
            onPress={() => handleTabChange(tab.id)}
            activeOpacity={0.7}
            className="flex-1 py-2 items-center justify-center"
          >
            <Text
              className={`${activeCategory === tab.id ? "text-light-primary-red/75" : "text-light-matte-black/50"} text-center font-bold text-xs`}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}

        <Animated.View
          className="absolute bottom-0 h-1 bg-light-primary-red/75 left-0 right-0 rounded-t-md"
          style={{
            width: tabWidth,
            transform: [
              {
                translateX: horizontalScrollX.interpolate({
                  inputRange: tabs.map(
                    (_, index) =>
                      index *
                      require("react-native").Dimensions.get("window").width,
                  ),
                  outputRange: tabs.map((_, index) => index * tabWidth),
                  extrapolate: "clamp",
                }),
              },
            ],
          }}
        />
      </View>
    </BlurView>
  );
}
