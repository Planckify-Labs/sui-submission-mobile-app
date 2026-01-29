import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect } from "react";
import { StatusBar, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  PackageVariantList,
  PhoneNumberInput,
  ProviderNotDetectedAlert,
  ScreenHeader,
} from "@/components/pulsa-data";
import { useCategoryProducts } from "@/hooks/pulsa-data";
import { useProductsByCategory } from "@/hooks/queries/useProducts";

export default function PulsaDataScreen() {
  const { categoryId } = useLocalSearchParams<{ categoryId: string }>();
  const { setCategoryProducts } = useCategoryProducts();

  const { data: categoryProducts } = useProductsByCategory(categoryId ?? "");

  useEffect(() => {
    if (categoryProducts) {
      setCategoryProducts(categoryProducts);
    }
  }, [categoryProducts, setCategoryProducts]);

  const handleGoBack = useCallback(() => {
    router.back();
  }, []);

  return (
    <>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView className="flex-1 bg-light-main-container" edges={["top"]}>
        <View className="flex-1 px-6">
          <ScreenHeader title="Pulsa & Data Package" onBackPress={handleGoBack} />

          <PhoneNumberInput />

          <ProviderNotDetectedAlert />

          <View className="flex-1">
            <PackageVariantList />
          </View>
        </View>
      </SafeAreaView>
    </>
  );
}
