import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import { MoveRight } from "lucide-react-native";
import React from "react";
import { Image, Text, TouchableOpacity, View } from "react-native";
import { usePaymentFeatured } from "@/hooks/queries/useProducts";

const paymentItems = [
  {
    name: "Pulsa & Data Package",
    displayName: "Pulsa & Data Package",
    icon: (
      <Image
        source={require("@/assets/icons/pulsa_data_package.png")}
        style={{ width: 40, height: 40 }}
        resizeMode="contain"
      />
    ),
    type: "pulsa-data" as const,
  },
  {
    name: "Gaming",
    displayName: "Gaming",
    icon: (
      <Image
        source={require("@/assets/icons/gaming_topup.png")}
        style={{ width: 40, height: 40 }}
        resizeMode="contain"
      />
    ),
    type: "category" as const,
  },
  {
    name: "Token PLN",
    displayName: "PLN",
    icon: (
      <Image
        source={require("@/assets/icons/pln.png")}
        style={{ width: 40, height: 40 }}
        resizeMode="contain"
      />
    ),
    type: "product" as const,
  },
];

export default function PaymentSection() {
  const { data: paymentFeatured } = usePaymentFeatured();

  const handleNavigate = (item: (typeof paymentItems)[0]) => {
    if (item.type === "pulsa-data") {
      const categoryId = paymentFeatured?.[item.name]?.id;
      if (categoryId) {
        router.push({
          pathname: "/pulsa-data",
          params: { categoryId },
        });
      }
    } else if (item.type === "category") {
      const categoryId = paymentFeatured?.[item.name]?.id;
      if (categoryId) {
        router.push({
          pathname: "/view-all-item",
          params: {
            categoryId,
            categoryName: item.displayName,
          },
        });
      }
    } else if (item.type === "product") {
      const productId = paymentFeatured?.[item.name]?.id;
      if (productId) {
        router.push({
          pathname: "/purchase-item",
          params: { productId },
        });
      }
    }
  };

  const renderPaymentItem = ({ item }: { item: (typeof paymentItems)[0] }) => (
    <TouchableOpacity
      activeOpacity={0.7}
      className="items-center"
      onPress={() => handleNavigate(item)}
    >
      <View className="rounded-2xl border-2 border-light-matte-black w-16 aspect-square bg-light-main-container items-center justify-center">
        {item.icon}
      </View>
      <Text className="text-[10px] text-center text-wrap max-w-16 mt-1">
        {item.displayName}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View className="px-4">
      <View className="bg-light rounded-[14px] w-full p-[22px] gap-4">
        <View className="flex-row px-[22px]-">
          <Text className="text-light-matte-black text-sm">Payments</Text>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => router.push("/service")}
            className="flex-row items-center justify-center border-2 ml-auto border-light-primary-red bg-light-primary-red/10 gap-2 rounded-full px-4 py-1"
          >
            <Text className="text-light-matte-black text-sm font-bold">
              View All
            </Text>
            <MoveRight size={20} color="#c71c4b" />
          </TouchableOpacity>
        </View>

        <View style={{ minHeight: 120 }}>
          <FlashList
            data={paymentItems}
            renderItem={renderPaymentItem}
            keyExtractor={(item) => item.name}
            numColumns={4}
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}
          />
        </View>
      </View>
    </View>
  );
}
