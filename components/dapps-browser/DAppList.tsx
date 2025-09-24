import { useQueries } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  Banknote,
  Gamepad2,
  Smartphone,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  Text,
  View,
} from "react-native";
import { dappApi } from "@/api/endpoints/dapps";
import type { TDapp, TDappCategory } from "@/api/types/dapp";
import { dappQueryKeys } from "@/constants/queryKeys/dappQueryKeys";
import { useDappCategories } from "@/hooks/queries/useDapps";
import useRQGlobalState from "@/hooks/useRQGlobalState";
import DAppCard from "./DAppCard";
import DAppCardSkeleton from "./DAppCardSkeleton";

export type TCategoryTab = string;

interface CategoryDAppsListProps {
  onNavigateToDapp: (url: string) => void;
  horizontalScrollX?: Animated.Value;
}

const { width: screenWidth } = Dimensions.get("window");

export default function DAppList({
  onNavigateToDapp,
  horizontalScrollX,
}: CategoryDAppsListProps) {
  const scrollViewRef = useRef<ScrollView>(null);
  const { data: categories, isLoading: categoriesLoading } =
    useDappCategories();

  const { data: activeCategoryState, setNewData: setActiveCategoryState } =
    useRQGlobalState<{ activeCategory: string }>({
      queryKey: dappQueryKeys.activeCategory,
      initialData: { activeCategory: "" },
    });

  const activeCategory = activeCategoryState?.activeCategory || "";

  const activeCategories =
    categories?.filter((category) => category.isActive) || [];
  const categoryIds = activeCategories.map((category) => category.id);
  const currentIndex = categoryIds.indexOf(activeCategory);

  useEffect(() => {
    if (!activeCategory && activeCategories.length > 0) {
      const firstCategory = activeCategories[0];
      if (firstCategory) {
        setActiveCategoryState({ activeCategory: firstCategory.id });
      }
    }
  }, [activeCategory, activeCategories, setActiveCategoryState]);

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

  useEffect(() => {
    if (scrollViewRef.current && currentIndex >= 0) {
      scrollViewRef.current.scrollTo({
        x: currentIndex * screenWidth,
        animated: true,
      });
    }
  }, [currentIndex]);

  const handleMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const scrollX = event.nativeEvent.contentOffset.x;
      const index = Math.round(scrollX / screenWidth);
      const newCategoryId = categoryIds[index];

      if (newCategoryId && newCategoryId !== activeCategory) {
        setActiveCategoryState({ activeCategory: newCategoryId });
      }
    },
    [activeCategory, setActiveCategoryState, categoryIds],
  );

  const handleScroll = horizontalScrollX
    ? Animated.event(
        [{ nativeEvent: { contentOffset: { x: horizontalScrollX } } }],
        { useNativeDriver: false },
      )
    : undefined;

  const CategoryPage = ({ category }: { category: TDappCategory }) => {
    const dapps = categoryDappsMap[category.id] || [];
    const categoryQuery = dappQueries.find(
      (_, index) => activeCategories[index]?.id === category.id,
    );
    const isLoadingThisCategory = categoryQuery?.isLoading || false;

    // Get category icon based on name
    const getCategoryIcon = (categoryName: string) => {
      const name = categoryName.toLowerCase();
      const iconProps = { size: 24, strokeWidth: 2 };

      if (name.includes("defi")) {
        return <Banknote {...iconProps} color="#3b82f6" />;
      } else if (name.includes("dex")) {
        return <ArrowLeftRight {...iconProps} color="#10b981" />;
      } else if (name.includes("gaming") || name.includes("game")) {
        return <Gamepad2 {...iconProps} color="#8b5cf6" />;
      }
      return <Smartphone {...iconProps} color="#c71c4b" />;
    };

    const getCategoryColor = (categoryName: string) => {
      const name = categoryName.toLowerCase();
      if (name.includes("defi")) {
        return "bg-blue-500/10";
      } else if (name.includes("dex")) {
        return "bg-green-500/10";
      } else if (name.includes("gaming")) {
        return "bg-purple-500/10";
      }
      return "bg-light-primary-red/10";
    };

    return (
      <View key={category.id} style={{ width: screenWidth }} className="pb-16">
        <View className="mx-4 mb-6">
          <View className="bg-gradient-to-r from-light-main-container to-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <View className="flex-row items-center mb-3">
              <View
                className={`${getCategoryColor(category.name)} p-3 rounded-2xl mr-4 shadow-sm`}
              >
                {getCategoryIcon(category.name)}
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

        <View className="px-4 gap-4">
          {isLoadingThisCategory ? (
            Array.from({ length: 3 }).map((_, index) => (
              <DAppCardSkeleton key={`skeleton-${category.id}-${index}`} />
            ))
          ) : dapps.length > 0 ? (
            dapps.map((dapp: TDapp) => (
              <DAppCard key={dapp.id} dapp={dapp} onPress={onNavigateToDapp} />
            ))
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
  };

  if (categoriesLoading) {
    return (
      <View style={{ width: screenWidth }} className="pb-16">
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
    );
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
      scrollEventThrottle={16}
      decelerationRate="fast"
      snapToInterval={screenWidth}
      snapToAlignment="start"
    >
      {activeCategories.map((category) => (
        <CategoryPage key={category.id} category={category} />
      ))}
    </ScrollView>
  );
}
