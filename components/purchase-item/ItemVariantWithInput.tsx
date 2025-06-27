import { useProductById } from "@/hooks/queries/useProducts";
import { router } from "expo-router";
import { ArrowLeft, ChevronRight, Info } from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import { Image, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import ItemVariantWithInputSkeleton from "./ItemVariantWithInputSkeleton";

interface ItemVariantWithInputProps {
  productId?: string;
}

export default function ItemWithInput({ productId }: ItemVariantWithInputProps) {
  const isMounted = useRef(true);
  const { data: product, isLoading, error } = useProductById(productId || "");
  const [selectedItemVariant, setSelectedItemVariant] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  const getKeyboardType = (inputType: string | null) => {
    switch (inputType?.toUpperCase()) {
      case "NUMBER":
        return "number-pad";
      default:
        return "default";
    }
  };

  if (isLoading) {
    return <ItemVariantWithInputSkeleton />;
  }

  if (error || !product) {
    return (
      <View className="flex-1 justify-center items-center p-6">
        <Text className="text-light-matte-black text-lg font-bold mb-2">
          Could not load product
        </Text>
        <Text className="text-light-error text-center mb-6">
          {error instanceof Error ? error.message : "Unknown error"}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <View className="flex-1 p-6">
        <View className="flex-row items-center mb-6">
          <Pressable onPress={() => router.back()} className="mr-4">
            <ArrowLeft color="#c71c4b" size={24} />
          </Pressable>
          <Text className="text-light-matte-black text-xl font-bold">
            {product.name}
          </Text>
        </View>

        <View className="bg-light rounded-xl py-5 mb-6 shadow-sm">
          <View className="mb-6 px-5">
            <Text className="text-light-matte-black/70 mb-2">{product.inputDescription || "Input Value"}</Text>
            <View className="bg-light-main-container p-4 rounded-xl flex-row items-center justify-between">
              <View className="flex-1">
                <TextInput
                  value={inputValue}
                  onChangeText={setInputValue}
                  placeholder={`${product.inputDescription}`}
                  keyboardType={getKeyboardType(product.inputType)}
                  className="text-light-matte-black font-medium text-lg"
                  autoCapitalize="none"
                />
                <Text className="text-light-matte-black/60 text-xs">
                  {product.category?.name}
                </Text>
              </View>
              <View className="flex-row items-center">
                <Image
                  source={{ uri: product.imageUrl }}
                  className="w-8 h-8 mr-2"
                  style={{ resizeMode: "contain" }}
                />
              </View>
            </View>
          </View>

          <View className="bg-light-primary-red/10 p-4 mx-5 rounded-xl mb-6">
            <View className="flex-row items-center gap-2">
              <Info size={18} color="#c71c4b" className="mr-2" />
              <Text className="text-light-matte-black/80 text-sm flex-1">
                Have a postpaid number? Click here
              </Text>
              <ChevronRight size={16} color="#c71c4b" />
            </View>
          </View>

          <View>
            <Text className="text-light-matte-black/70 mx-5 mb-3">
              Recently used numbers
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mb-2"
            >
              <View className="mx-5 flex-row gap-2">
                {["085930970697", "088975163714", "081234567890"].map(
                  (number) => (
                    <TouchableOpacity
                      key={number}
                      className="bg-light-main-container border border-light-matte-black/10 rounded-xl p-3 mr-3"
                      onPress={() => setInputValue(number)}
                      activeOpacity={0.5}
                    >
                      <Text className="text-light-matte-black">{number}</Text>
                    </TouchableOpacity>
                  ),
                )}
              </View>
            </ScrollView>
          </View>
        </View>

        <View className="bg-light rounded-xl p-5 mb-6 shadow-sm">
          <Text className="text-light-matte-black font-bold text-lg mb-4">
            Options
          </Text>

          <View className="flex-row flex-wrap gap-2">
            {product.variants.map((variant) => {
              const price = variant.ProductPrice[0]?.sellPrice || "N/A";
              return (
                <Pressable
                  key={variant.id}
                  className={`bg-light-main-container border flex-1 min-w-[45%] ${
                    selectedItemVariant === variant.id
                      ? "border-light-primary-red bg-light-primary-red/5"
                      : "border-light-matte-black/10"
                  } rounded-xl p-3`}
                  onPress={() => setSelectedItemVariant(variant.id)}
                >
                  <View className="flex-row justify-between items-center mb-1">
                    <Text className="text-light-matte-black font-bold text-sm flex-1 mr-2">
                      {variant.name}
                    </Text>
                    <View className="bg-light-matte-black/10 px-2 py-1 rounded-full">
                      <Text className="text-light-matte-black/70 text-[10px]">
                        30 days
                      </Text>
                    </View>
                  </View>
                  <Text className="text-light-primary-red font-bold text-base">
                    Rp{parseInt(price).toLocaleString("id-ID")}
                  </Text>
                  <Text className="text-light-matte-black/70 text-[10px] mt-1">
                    {variant.description}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <Pressable
          className={`bg-light-primary-red py-4 rounded-full items-center ${!selectedItemVariant ? "opacity-50" : ""}`}
          disabled={!selectedItemVariant}
          onPress={() => selectedItemVariant && router.push({
            pathname: "/payment",
            params: {
              productId: product.id,
              variantId: selectedItemVariant
            }
          })}
        >
          <Text className="text-light font-bold text-lg">
            Continue to Payment
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
