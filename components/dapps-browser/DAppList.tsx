import { FlashList } from "@shopify/flash-list";
import { useQueries } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  Banknote,
  Gamepad2,
  Smartphone,
} from "lucide-react-native";
import React, { memo, useCallback, useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { dappApi } from "@/api/endpoints/dapps";
import type { TDapp, TDappCategory } from "@/api/types/dapp";
import { ICON_SIZES, SCREEN_WIDTH } from "../../constants/dapps-browser";
import { useCategoryNavigation } from "../../hooks/dapps-browser/useCategoryNavigation";
import { TCategoryDAppsListProps } from "../../types/dapps-browser";
import {
  getCategoryColor,
  getCategoryIcon,
} from "../../utils/dappsBrowserUtils";
import DAppCard from "./DAppCard";
import DAppCardSkeleton from "./DAppCardSkeleton";

export type TCategoryTab = string;

const DAppList = memo<TCategoryDAppsListProps>(function DAppList({
  onNavigateToDapp,
  horizontalScrollX,
}) {
  const {
    scrollViewRef,
    categoriesLoading,
    activeCategories,
    handleMomentumScrollEnd,
    createScrollHandler,
  } = useCategoryNavigation();

  const dappQueries = useQueries({
    queries: activeCategories.map((category) => ({
      queryKey: ["dapps", "category", category.id],
      queryFn: () => dappApi.getDappsByCategory(category.id),
      enabled: !!category.id,
    })),
  });

  const categoryDappsMap = useMemo(() => {
    const map: Record<string, TDapp[]> = {};
    activeCategories.forEach((category, index) => {
      const query = dappQueries[index];
      if (query.data) {
        map[category.id] = query.data;
      }
    });
    return map;
  }, [activeCategories, dappQueries]);

  const handleScroll = useMemo(
    () => createScrollHandler(horizontalScrollX),
    [createScrollHandler, horizontalScrollX],
  );

  const CategoryPage = useCallback(
    ({ category }: { category: TDappCategory }) => {
      const dapps = categoryDappsMap[category.id] || [];
      const categoryQuery = dappQueries.find(
        (_, index) => activeCategories[index]?.id === category.id,
      );
      const isLoadingThisCategory = categoryQuery?.isLoading || false;

      const renderCategoryIcon = () => {
        const iconInfo = getCategoryIcon(category.name);
        const iconProps = {
          size: ICON_SIZES.LARGE,
          strokeWidth: 2,
          color: iconInfo.color,
        };

        switch (iconInfo.type) {
          case "defi":
            return <Banknote {...iconProps} />;
          case "dex":
            return <ArrowLeftRight {...iconProps} />;
          case "gaming":
            return <Gamepad2 {...iconProps} />;
          default:
            return <Smartphone {...iconProps} />;
        }
      };

      return (
        <View
          key={category.id}
          style={{ width: SCREEN_WIDTH }}
          className="pb-16"
        >
          <View className="mx-4 mb-6">
            <View className="bg-gradient-to-r from-light-main-container to-white rounded-2xl p-5 border border-gray-100">
              <View className="flex-row items-center mb-3">
                <View
                  className={`${getCategoryColor(category.name)} p-3 rounded-2xl mr-4`}
                >
                  {renderCategoryIcon()}
                </View>
                <View className="flex-1">
                  <Text className="text-light-matte-black font-bold text-xl tracking-tight">
                    {category.name}
                  </Text>
                  <View className="h-1 bg-light-primary-red/20 rounded-full mt-1 w-12" />
                </View>
              </View>

              <Text className="text-light-matte-black/70 text-base leading-6 font-medium">
                {category.description}
              </Text>

              <View className="flex-row justify-between items-center mt-4 pt-3 border-t border-gray-100">
                <Text className="text-light-matte-black/40 text-xs font-semibold uppercase tracking-wider">
                  Explore DApps
                </Text>
                <View className="flex-row space-x-1">
                  <View className="w-2 h-2 bg-light-primary-red/30 rounded-full" />
                  <View className="w-2 h-2 bg-light-primary-red/50 rounded-full" />
                  <View className="w-2 h-2 bg-light-primary-red rounded-full" />
                </View>
              </View>
            </View>
          </View>

          <View className="px-4 flex-1">
            {isLoadingThisCategory ? (
              <View className="gap-4">
                {Array.from({ length: 3 }).map((_, index) => (
                  <DAppCardSkeleton key={`skeleton-${category.id}-${index}`} />
                ))}
              </View>
            ) : dapps.length > 0 ? (
              <FlashList
                data={dapps}
                renderItem={({ item }: { item: TDapp }) => (
                  <DAppCard dapp={item} onPress={onNavigateToDapp} />
                )}
                keyExtractor={(item: TDapp) => item.id}
                ItemSeparatorComponent={() => <View className="h-4" />}
                showsVerticalScrollIndicator={false}
              />
            ) : (
              <View className="flex-1 justify-center items-center py-8">
                <Text className="text-light-matte-black/60 text-center">
                  No DApps available in this category
                </Text>
              </View>
            )}
          </View>
        </View>
      );
    },
    [categoryDappsMap, dappQueries, activeCategories, onNavigateToDapp],
  );

  const LoadingSkeleton = useMemo(
    () => (
      <View style={{ width: SCREEN_WIDTH }} className="pb-16">
        <View className="mx-4 mb-6">
          <View className="bg-gradient-to-r from-light-main-container to-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <View className="flex-row items-center mb-3">
              <View className="bg-light-primary-red/10 p-3 rounded-2xl mr-4 shadow-sm">
                <View className="w-6 h-6 bg-gray-300 rounded animate-pulse" />
              </View>
              <View className="flex-1">
                <View className="h-6 bg-gray-300 rounded w-32 animate-pulse" />
                <View className="h-1 bg-light-primary-red/20 rounded-full mt-1 w-12" />
              </View>
            </View>
            <View className="h-4 bg-gray-300 rounded w-full animate-pulse mb-2" />
            <View className="h-4 bg-gray-300 rounded w-3/4 animate-pulse" />
            <View className="flex-row justify-between items-center mt-4 pt-3 border-t border-gray-100">
              <View className="h-3 bg-gray-300 rounded w-20 animate-pulse" />
              <View className="flex-row space-x-1">
                <View className="w-2 h-2 bg-light-primary-red/30 rounded-full" />
                <View className="w-2 h-2 bg-light-primary-red/50 rounded-full" />
                <View className="w-2 h-2 bg-light-primary-red rounded-full" />
              </View>
            </View>
          </View>
        </View>
        <View className="px-4 gap-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <DAppCardSkeleton key={`loading-skeleton-${index}`} />
          ))}
        </View>
      </View>
    ),
    [],
  );

  if (categoriesLoading) {
    return LoadingSkeleton;
  }

  if (!activeCategories.length) {
    return (
      <View className="flex-1 justify-center items-center">
        <Text className="text-light-matte-black/60 text-center">
          No categories available
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      ref={scrollViewRef}
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      onScroll={handleScroll}
      onMomentumScrollEnd={handleMomentumScrollEnd}
      scrollEventThrottle={8}
      decelerationRate="fast"
      snapToInterval={SCREEN_WIDTH}
      snapToAlignment="start"
    >
      {activeCategories.map((category) => (
        <CategoryPage key={category.id} category={category} />
      ))}
    </ScrollView>
  );
});

export default DAppList;
