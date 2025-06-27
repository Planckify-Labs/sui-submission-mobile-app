import React from "react";
import { ScrollView, View } from "react-native";
import SingleLoadingSekeleton from "../common/SingleLoadingSekeleton";
import PromotionBannerSkeleton from "./PromotionBannerSkeleton";
import ServiceSectionSkeleton from "./ServiceSectionSkeleton";

export default function ServiceScreenSkeleton() {
  return (
    <ScrollView 
      className="flex-1 bg-light-main-container"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 24 }}
    >
      <View className="px-4 pt-2 pb-4">
        <SingleLoadingSekeleton width={120} height={28} />
      </View>
      
      <View className="px-4 mb-6">
        <SingleLoadingSekeleton width="100%" height={44} borderRadius={8} />
      </View>
      
      <PromotionBannerSkeleton />
      
      <ServiceSectionSkeleton />
      <ServiceSectionSkeleton />
      <ServiceSectionSkeleton />
    </ScrollView>
  );
} 