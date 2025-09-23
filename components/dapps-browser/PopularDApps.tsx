import React from "react";
import { FlatList, Text, View } from "react-native";
import { usePopularDapps } from "@/hooks/queries/useDapps";
import DAppCard from "./DAppCard";
import DAppCardSkeleton from "./DAppCardSkeleton";
import DappsErrorMessage from "./DappsErrorMessage";

interface PopularDAppsProps {
  onNavigateToDapp: (url: string) => void;
}

export default function PopularDApps({ onNavigateToDapp }: PopularDAppsProps) {
  const { data: popularDapps, isLoading, error, refetch } = usePopularDapps();

  const cardWidth = 200;

  const renderLoadingSkeletons = () =>
    Array.from({ length: 6 }, (_, index) => ({ id: `skeleton-${index}` }));

  const renderItem = ({ item }: { item: any }) => {
    if (item.id?.startsWith("skeleton-")) {
      return (
        <View style={{ width: cardWidth }}>
          <DAppCardSkeleton />
        </View>
      );
    }

    return (
      <View style={{ width: cardWidth }}>
        <View style={{ width: "100%" }}>
          <DAppCard dapp={item} isCompact={true} onPress={onNavigateToDapp} />
        </View>
      </View>
    );
  };

  if (error) {
    return (
      <View className="mb-6">
        <View className="px-4 mb-4">
          <Text className="text-light-matte-black font-bold text-lg">
            🔥 Popular DApps
          </Text>
          <Text className="text-light-matte-black/60 text-sm">
            Most loved applications across all categories
          </Text>
        </View>
        <DappsErrorMessage
          onRetry={refetch}
          message="Can't load popular DApps right now"
        />
      </View>
    );
  }

  return (
    <View className="mb-6">
      <View className="px-4 mb-4">
        <Text className="text-light-matte-black font-bold text-lg">
          🔥 Popular DApps
        </Text>
        <Text className="text-light-matte-black/60 text-sm">
          Most loved applications across all categories
        </Text>
      </View>
      <FlatList
        data={isLoading ? renderLoadingSkeletons() : popularDapps}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16 }}
        ItemSeparatorComponent={() => <View style={{ width: 16 }} />}
        numColumns={1}
      />
    </View>
  );
}
