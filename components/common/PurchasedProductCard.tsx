import React from "react";
import { Image, Text, View } from "react-native";
import { TPurchaseCompleted } from "@/api/types/purchase";

interface PurchasedProductCardProps {
  purchase: TPurchaseCompleted;
}

export default function PurchasedProductCard({
  purchase,
}: PurchasedProductCardProps) {
  const product = purchase?.productVariant?.product;
  const variant = purchase?.productVariant;

  return (
    <View className="bg-light- rounded-3xl p-6 mx-4 mb-6 shadow-sm">
      <View className="items-center">
        <View className="w-24 h-24 rounded-3xl mb-4 overflow-hidden bg-light-main-container border-4 border-light-matte-black">
          {product.imageUrl ? (
            <Image
              source={{ uri: product.imageUrl }}
              className="w-full h-full"
              resizeMode="cover"
            />
          ) : (
            <View className="w-full h-full items-center justify-center">
              <Text className="text-light-matte-black/30 text-xs">
                No Image
              </Text>
            </View>
          )}
        </View>

        <Text className="text-light-matte-black font-extrabold text-2xl mb-2 text-center">
          {purchase.transaction.fiatCurrency}{" "}
          {Number(purchase.transaction.amountInFiat).toLocaleString()}
        </Text>

        <Text className="text-light-matte-black/70 text-sm mb-3 text-center">
          {variant.description}
        </Text>

        <View className="mt-4">
          <View
            className={`px-3 py-1 rounded-full ${
              purchase.status === "COMPLETED"
                ? "bg-green-100"
                : purchase.status === "PENDING"
                  ? "bg-yellow-100"
                  : "bg-red-100"
            }`}
          >
            <Text
              className={`text-xs font-medium ${
                purchase.status === "COMPLETED"
                  ? "text-emerald-700"
                  : purchase.status === "PENDING"
                    ? "text-yellow-700"
                    : "text-light-primary-red"
              }`}
            >
              {purchase.status}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}
