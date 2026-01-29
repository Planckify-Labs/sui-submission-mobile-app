import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import { MoveRight } from "lucide-react-native";
import React, { forwardRef, useImperativeHandle } from "react";
import { Image, Text, TouchableOpacity, View } from "react-native";
import { usePaymentFeatured } from "@/hooks/queries/useProducts";

export type PaymentSectionRef = {
  refetch: () => void;
};

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

const PaymentSection = forwardRef<PaymentSectionRef>((_, ref) => {
  const { data: paymentFeatured, refetch } = usePaymentFeatured();

  useImperativeHandle(ref, () => ({
    refetch: () => refetch(),
  }));

  const handleNavigate = async (item: (typeof paymentItems)[0]) => {
    let id = paymentFeatured?.[item.name]?.id;

    if (!id) {
      const maxRetries = 3;
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        const { data: freshData } = await refetch();
        id = freshData?.[item.name]?.id;
        if (id) break;
      }
      if (!id) return;
    }

    if (item.type === "pulsa-data") {
      router.push({
        pathname: "/pulsa-data",
        params: { categoryId: id },
      });
    } else if (item.type === "category") {
      router.push({
        pathname: "/view-all-item",
        params: {
          categoryId: id,
          categoryName: item.displayName,
        },
      });
    } else if (item.type === "product") {
      router.push({
        pathname: "/purchase-item",
        params: { productId: id },
      });
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
});

PaymentSection.displayName = "PaymentSection";

export default PaymentSection;
