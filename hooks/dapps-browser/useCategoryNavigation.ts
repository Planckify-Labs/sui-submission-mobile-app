import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  Animated,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
} from "react-native";
import { dappQueryKeys } from "@/constants/queryKeys/dappQueryKeys";
import { useDappCategories } from "@/hooks/queries/useDapps";
import useRQGlobalState from "@/hooks/useRQGlobalState";
import { SCREEN_WIDTH } from "../../constants/dapps-browser";

export const useCategoryNavigation = () => {
  const scrollViewRef = useRef<ScrollView>(null);

  const { data: categories, isLoading: categoriesLoading } =
    useDappCategories();

  const { data: activeCategoryState, setNewData: setActiveCategoryState } =
    useRQGlobalState<{ activeCategory: string }>({
      queryKey: dappQueryKeys.activeCategory,
      initialData: { activeCategory: "" },
    });

  const activeCategory = activeCategoryState?.activeCategory || "";

  const activeCategories = useMemo(
    () => categories?.filter((category) => category.isActive) || [],
    [categories],
  );

  const categoryIds = useMemo(
    () => activeCategories.map((category) => category.id),
    [activeCategories],
  );

  const currentIndex = useMemo(
    () => categoryIds.indexOf(activeCategory),
    [categoryIds, activeCategory],
  );

  useEffect(() => {
    if (!activeCategory && activeCategories.length > 0) {
      const firstCategory = activeCategories[0];
      if (firstCategory) {
        setActiveCategoryState({ activeCategory: firstCategory.id });
      }
    }
  }, [activeCategory, activeCategories, setActiveCategoryState]);

  useEffect(() => {
    if (scrollViewRef.current && currentIndex >= 0) {
      scrollViewRef.current.scrollTo({
        x: currentIndex * SCREEN_WIDTH,
        animated: true,
      });
    }
  }, [currentIndex]);

  const handleMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const scrollX = event.nativeEvent.contentOffset.x;
      const index = Math.round(scrollX / SCREEN_WIDTH);
      const newCategoryId = categoryIds[index];

      if (newCategoryId && newCategoryId !== activeCategory) {
        setActiveCategoryState({ activeCategory: newCategoryId });
      }
    },
    [activeCategory, setActiveCategoryState, categoryIds],
  );

  const handleTabChange = useCallback(
    (categoryId: string) => {
      if (categoryId !== activeCategory) {
        setActiveCategoryState({ activeCategory: categoryId });
      }
    },
    [activeCategory, setActiveCategoryState],
  );

  const createScrollHandler = useCallback(
    (horizontalScrollX?: Animated.Value) => {
      return horizontalScrollX
        ? Animated.event(
            [{ nativeEvent: { contentOffset: { x: horizontalScrollX } } }],
            { useNativeDriver: false },
          )
        : undefined;
    },
    [],
  );

  return {
    scrollViewRef,
    categories,
    categoriesLoading,
    activeCategories,
    categoryIds,
    activeCategory,
    currentIndex,
    handleMomentumScrollEnd,
    handleTabChange,
    createScrollHandler,
  };
};
