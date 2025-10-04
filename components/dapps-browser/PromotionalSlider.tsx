import { AlertCircle, RefreshCw } from "lucide-react-native";
import React, { memo, useCallback, useMemo } from "react";
import { Image, ScrollView, Text, TouchableOpacity, View } from "react-native";
import type { TDapp } from "@/api/types/dapp";
import { useSponsoredDapps } from "@/hooks/queries/useDapps";
import {
  COLORS,
  ICON_SIZES,
  PROMO_CARD_WIDTH,
} from "../../constants/dapps-browser";
import { TDAppNavigationProps } from "../../types/dapps-browser";
import PromotionalCardSkeleton from "./PromotionalCardSkeleton";

const PromotionalSlider = memo<TDAppNavigationProps>(
  function PromotionalSlider({ onNavigateToDapp }) {
    const {
      data: sponsoredDapps,
      isLoading,
      error,
      refetch,
    } = useSponsoredDapps();

    const renderPromotionalCard = useCallback(
      (item: TDapp) => {
        const handlePress = () => onNavigateToDapp(item.websiteUrl);

        return (
          <TouchableOpacity
            key={item.id}
            activeOpacity={0.8}
            onPress={handlePress}
            className="rounded-3xl p-6 mr-4"
            style={{
              width: PROMO_CARD_WIDTH,
              backgroundColor: item.bgColor || "#6366F1",
            }}
          >
            <View className="flex-row items-start justify-between mb-4">
              <View className="flex-1">
                {item.isSponsor && (
                  <View className="bg-white/20 px-3 py-1 rounded-full self-start mb-2">
                    <Text className="text-white text-xs font-medium">
                      Sponsored
                    </Text>
                  </View>
                )}
                <Text className="text-white font-bold text-xl mb-1">
                  {item.name}
                </Text>
                <Text className="text-white/80 text-sm font-medium">
                  {item.category?.name || "DApp"}
                </Text>
              </View>
              <View className="w-12 h-12 bg-white/20 rounded-full items-center justify-center">
                <Image
                  source={{ uri: item.logoUrl }}
                  style={{ width: 24, height: 24 }}
                  resizeMode="contain"
                />
              </View>
            </View>
            <Text className="text-white/90 text-sm leading-5">
              {item.description}
            </Text>
          </TouchableOpacity>
        );
      },
      [onNavigateToDapp],
    );

    const renderLoadingSkeletons = useMemo(
      () => (
        <>
          <PromotionalCardSkeleton />
          <PromotionalCardSkeleton />
          <PromotionalCardSkeleton />
        </>
      ),
      [],
    );

    const handleRetry = useCallback(() => {
      refetch();
    }, [refetch]);

    const renderErrorState = useMemo(
      () => (
        <View className="mb-6 px-2 justify-center items-center">
          <View className="rounded-2xl p-6 items-center justify-center bg-white w-full">
            <View className="w-14 h-14 bg-light-primary-red/5 rounded-2xl items-center justify-center mb-4">
              <AlertCircle size={ICON_SIZES.LARGE} color={COLORS.PRIMARY_RED} />
            </View>

            <Text className="text-gray-800 font-semibold text-base mb-1 text-center">
              Oops! Something went wrong
            </Text>

            <Text className="text-gray-600 text-xs text-center leading-4 mb-5 px-2">
              Can't load featured apps right now
            </Text>

            <TouchableOpacity
              activeOpacity={0.7}
              className="bg-light-primary-red px-5 py-2.5 rounded-xl flex-row items-center shadow-sm"
              onPress={handleRetry}
            >
              <RefreshCw
                size={14}
                color={COLORS.WHITE}
                style={{ marginRight: 6 }}
              />
              <Text className="text-white font-medium text-xs">Retry</Text>
            </TouchableOpacity>
          </View>
        </View>
      ),
      [handleRetry],
    );

    if (error) {
      return renderErrorState;
    }

    return (
      <View className="mb-6">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={PROMO_CARD_WIDTH + 16}
          decelerationRate="fast"
          contentContainerStyle={{ paddingHorizontal: 16 }}
        >
          {isLoading
            ? renderLoadingSkeletons
            : sponsoredDapps?.map(renderPromotionalCard)}
        </ScrollView>
      </View>
    );
  },
);

export default PromotionalSlider;
