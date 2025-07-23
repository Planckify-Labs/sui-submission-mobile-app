import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import { MoveRight } from "lucide-react-native";
import React from "react";
import { Pressable, Text, View } from "react-native";

const paymentItems = [
  { name: "Pulsa" },
  { name: "Data Package" },
  { name: "PLN" },
  { name: "Games Top Up" },
  { name: "Top Up e-money" },
];

export default function PaymentSection() {
  const renderPaymentItem = ({ item }: { item: { name: string } }) => (
    <View className="items-center">
      <View className="rounded-2xl border-2 border-light-matte-black w-16 aspect-square bg-light-primary-red/40" />
      <Text className="text-[10px] text-center text-wrap max-w-16 mt-1">
        {item.name}
      </Text>
    </View>
  );

  return (
    <View className="px-4">
      <View className="bg-light rounded-[14px] w-full p-[22px] gap-4">
        <View className="flex-row px-[22px]-">
          <Text className="text-light-matte-black text-sm">Payments</Text>
          <Pressable
            onPress={() => router.push("/service")}
            className="flex-row items-center justify-center border-2 ml-auto border-light-primary-red bg-light-primary-red/10 gap-2 rounded-full px-4 py-1"
          >
            <Text className="text-light-matte-black text-sm font-bold">
              View All
            </Text>
            <MoveRight size={20} color="#c71c4b" />
          </Pressable>
        </View>

        <View style={{ minHeight: 120 }}>
          <FlashList
            data={paymentItems}
            renderItem={renderPaymentItem}
            keyExtractor={(item) => item.name}
            numColumns={4}
            estimatedItemSize={4}
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}
          />
        </View>
      </View>
    </View>
  );
}
