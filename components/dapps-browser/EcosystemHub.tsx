import React, { memo } from "react";
import { Animated, ScrollView, Text, View } from "react-native";
import { TEcosystemHubProps } from "../../types/dapps-browser";
import DAppList, { TCategoryTab } from "./DAppList";
import PopularDApps from "./PopularDApps";
import PromotionalSlider from "./PromotionalSlider";

const EcosystemHub = memo<TEcosystemHubProps>(function EcosystemHub({
  onNavigateToDapp,
  activeCategory,
  onCategoryChange,
  horizontalScrollX,
}) {
  return (
    <ScrollView
      className="flex-1 bg-light-main-container"
      showsVerticalScrollIndicator={false}
    >
      <View className="px-4 pt-6 pb-4">
        <View className="items-center">
          <Text className="text-light-matte-black font-bold text-2xl mb-2">
            Ecosystem Hub
          </Text>
          <Text className="text-light-matte-black/60 text-center text-sm">
            Discover the best DApps across DeFi, DEX, and Gaming
          </Text>
        </View>
      </View>

      <PromotionalSlider onNavigateToDapp={onNavigateToDapp} />
      <PopularDApps onNavigateToDapp={onNavigateToDapp} />
      <DAppList
        onNavigateToDapp={onNavigateToDapp}
        horizontalScrollX={horizontalScrollX}
      />
    </ScrollView>
  );
});

export default EcosystemHub;
