import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import { MoveRight } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import OptimizedImage from "@/components/common/OptimizedImage";

interface ProductItem {
  id: string;
  name: string;
  description: string;
  icon: string;
}

interface SectionData {
  id: string;
  title: string;
  viewAllPath: string;
  items: ProductItem[];
}

interface PaymentSectionContainerProps {
  section: SectionData;
}

export default function ServiceSectionContainer({
  section,
}: PaymentSectionContainerProps) {
  const handleViewAll = () => {
    if (section.viewAllPath) {
      router.push({
        pathname: "/view-all-item",
        params: { categoryId: section.id, categoryName: section.title },
      });
    }
  };

  const renderItem = ({ item }: { item: ProductItem }) => (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() =>
        router.push({
          pathname: "/purchase-item",
          params: { productId: item.id },
        })
      }
      className="items-center justify-center p-1"
    >
      {item.icon ? (
        <View className="rounded-2xl overflow-hidden w-16 h-16 border-2 border-light-matte-black bg-light-primary-red/40">
          <OptimizedImage
            source={{ uri: item.icon }}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
          />
        </View>
      ) : (
        <View className="rounded-2xl border-2 border-light-matte-black w-16 aspect-square bg-light-primary-red/40" />
      )}
      <Text
        numberOfLines={2}
        ellipsizeMode="tail"
        className="text-[10px] text-center text-wrap max-w-16 mt-1"
      >
        {item.name}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View className="px-4">
      <View className="bg-light rounded-[14px] w-full p-[22px] gap-4 mb-4">
        <View className="flex-row">
          <Text className="text-light-matte-black text-sm">
            {section.title}
          </Text>
          {section.viewAllPath && (
            <TouchableOpacity
              activeOpacity={0.7}
              className="flex-row items-center justify-center border-2 ml-auto border-light-primary-red bg-light-primary-red/10 gap-2 rounded-full px-4 py-1"
              onPress={handleViewAll}
            >
              <Text className="text-light-matte-black text-sm font-bold">
                View All
              </Text>
              <MoveRight size={20} color="#c71c4b" />
            </TouchableOpacity>
          )}
        </View>
        <View>
          <FlashList
            data={section.items}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            numColumns={4}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingVertical: 4 }}
          />
        </View>
      </View>
    </View>
  );
}
