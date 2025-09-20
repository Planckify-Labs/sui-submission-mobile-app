import { usePurchaseById } from "@/hooks/queries/usePurchases";
import { useLocalSearchParams } from "expo-router";
import React from "react";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ActivityDetailScreen() {
  const { purchaseId, transferId } = useLocalSearchParams<{ purchaseId: string,transferId: string }>();
  const { data: purchase, isLoading, error } = usePurchaseById(purchaseId);
  console.log("Purchase Data:", purchase);

  return (
    <SafeAreaView className="flex-1 bg-light-main-container">
     <View className="flex-1 items-center justify-center"> 
        <Text className="text-lg font-semibold text-light-matte-black">Activity Detail</Text>
        <Text className="text-light-matte-black/50 text-xs">{purchase?.productVariant?.name}</Text>
        <Text className="text-light-matte-black/50 text-xs">Purchase id: {purchaseId}</Text>
        <Text className="text-light-matte-black/50 text-xs">Transfer id: {transferId}</Text>
      </View>
    </SafeAreaView>
  );
}
