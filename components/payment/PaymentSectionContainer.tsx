import { ProductItem, SectionData } from "@/constants/dummyData/paymentScreen";
import { router } from "expo-router";
import { MoveRight } from "lucide-react-native";
import React from "react";
import { Pressable, Text, View } from "react-native";

interface PaymentSectionContainerProps {
  section: SectionData;
}

export default function PaymentSectionContainer({
  section,
}: PaymentSectionContainerProps) {
  const handleViewAll = () => {
    if (section.viewAllPath) {
      router.push(section.viewAllPath);
    }
  };

  return (
    <View className="px-4">
      <View className="bg-light rounded-[14px] w-full p-[22px] gap-4 mb-4">
        <View className="flex-row">
          <Text className="text-light-matte-black text-sm">
            {section.title}
          </Text>
          {section.viewAllPath && (
            <Pressable
              className="flex-row items-center justify-center border-2 ml-auto border-light-primary-red bg-light-primary-red/10 gap-2 rounded-full px-4 py-1"
              onPress={handleViewAll}
            >
              <Text className="text-light-matte-black text-sm font-bold">
                View All
              </Text>
              <MoveRight size={20} color="#c71c4b" />
            </Pressable>
          )}
        </View>
        <View className="flex-row gap-2 justify-between flex-wrap">
          {section.items.map((item: ProductItem) => (
            <Pressable
              key={item.id}
              onPress={() => router.push("/purchase-item")}
              className="max-w-24 grow"
            >
              <View className="rounded-2xl border-2 border-light-matte-black w-16 aspect-square bg-light-primary-red/40" />
              <Text className="text-[10px] text-center text-wrap max-w-16">
                {item.name}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}
