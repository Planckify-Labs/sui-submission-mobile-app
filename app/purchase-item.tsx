import ItemWithInput from "@/components/purchase-item/ItemVariantWithInput";
import ItemVariantWithInputSkeleton from "@/components/purchase-item/ItemVariantWithInputSkeleton";
import ItemWithoutInput from "@/components/purchase-item/ItemVariantWithoutInput";
import ItemVariantWithoutInputSkeleton from "@/components/purchase-item/ItemVariantWithoutInputSkeleton";
import { useProductById } from "@/hooks/queries/useProducts";
import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { StatusBar, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function PurchaseItemScreen() {
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const [hasInput, setHasInput] = useState<boolean | null>(null);
  const { data: product, isLoading, error } = useProductById(productId);
  
  useEffect(() => {
    if (product && Object.keys(product).length > 0) {
      setHasInput(!!product.inputType);
    }
  }, [product]);

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-light-main-container" edges={["top"]}>
        <StatusBar barStyle="dark-content" />
        {hasInput === null ? (
          <ItemVariantWithoutInputSkeleton />
        ) : hasInput ? (
          <ItemVariantWithInputSkeleton />
        ) : (
          <ItemVariantWithoutInputSkeleton />
        )}
      </SafeAreaView>
    );
  }

  if (error || !product || Object.keys(product).length === 0) {
    return (
      <SafeAreaView className="flex-1 bg-light-main-container" edges={["top"]}>
        <View className="flex-1 justify-center items-center p-6">
          <Text className="text-light-matte-black text-lg font-bold mb-2">
            Could not load product
          </Text>
          <Text className="text-light-error text-center mb-6">
            {error instanceof Error ? error.message : "Unknown error"}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView className="flex-1 bg-light-main-container" edges={["top"]}>
        {hasInput === null ? (
          <ItemVariantWithoutInputSkeleton />
        ) : hasInput ? (
          <ItemWithInput productId={productId} />
        ) : (
          <ItemWithoutInput productId={productId} />
        )}
      </SafeAreaView>
    </>
  );
}
