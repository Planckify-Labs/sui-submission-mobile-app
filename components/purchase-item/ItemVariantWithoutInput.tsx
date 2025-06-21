import { router } from "expo-router";
import { ArrowLeft, Info } from "lucide-react-native";
import React, { useState } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import OptimizedImage from "../common/OptimizedImage";

export default function ItemWithoutInput() {
  const [selectedItemVariant, setSelectedItemVariant] = useState<string | null>(
    null,
  );

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <View className="flex-1 p-6">
        <View className="flex-row items-center mb-6">
          <Pressable onPress={() => router.back()} className="mr-4">
            <ArrowLeft color="#c71c4b" size={24} />
          </Pressable>
          <Text className="text-light-matte-black text-xl font-bold">
            Select Item
          </Text>
        </View>

        <View className="h-56 w-full bg-light rounded-xl overflow-hidden mb-6 shadow-sm">
          <OptimizedImage
            source={require("@/assets/images/takumipay-no-bg.png")}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
          />
        </View>

        <View className="bg-light rounded-xl p-5 mb-6 shadow-sm">
          <Text className="text-light-matte-black font-bold text-lg mb-4">
            Select Package
          </Text>

          <View className="flex-row flex-wrap justify-between">
            {[
              {
                value: "basic",
                name: "Basic Package",
                price: "Rp25.000",
                features: "Standard features",
              },
              {
                value: "premium",
                name: "Premium Package",
                price: "Rp50.000",
                features: "All features included",
              },
              {
                value: "family",
                name: "Family Package",
                price: "Rp75.000",
                features: "Up to 5 users",
              },
              {
                value: "business",
                name: "Business Package",
                price: "Rp100.000",
                features: "Enterprise support",
              },
            ].map((option) => (
              <Pressable
                key={option.value}
                className={`bg-light-main-container border ${
                  selectedItemVariant === option.value
                    ? "border-light-primary-red bg-light-primary-red/5"
                    : "border-light-matte-black/10"
                } rounded-xl p-4 mb-3 w-[48%]`}
                onPress={() => setSelectedItemVariant(option.value)}
              >
                <Text className="text-light-matte-black font-bold mb-1">
                  {option.name}
                </Text>
                <Text className="text-light-primary-red font-bold text-lg">
                  {option.price}
                </Text>
                <Text className="text-light-matte-black/70 text-xs mt-1">
                  {option.features}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View className="bg-light rounded-xl p-5 mb-6 shadow-sm">
          <Text className="text-light-matte-black font-bold text-lg mb-4">
            Item Details
          </Text>

          <View className="flex-row mb-4">
            <View className="w-20 h-20 bg-light-primary-red/10 rounded-xl mr-4 items-center justify-center">
              <Text className="text-light-primary-red text-2xl">📦</Text>
            </View>
            <View className="flex-1 justify-center">
              <Text className="text-light-matte-black font-bold text-lg">
                Premium Service
              </Text>
              <Text className="text-light-matte-black/70">
                Access to all premium features
              </Text>
            </View>
          </View>

          <View className="bg-light-primary-red/10 p-4 rounded-xl mb-4">
            <View className="flex-row items-start">
              <Info size={18} color="#c71c4b" className="mr-2 mt-0.5" />
              <Text className="text-light-matte-black/80 text-sm flex-1">
                This purchase will be linked to your account and cannot be
                transferred.
              </Text>
            </View>
          </View>

          <View className="border-t border-light-matte-black/10 pt-4 mt-2">
            <View className="flex-row justify-between mb-2">
              <Text className="text-light-matte-black/70">Provider</Text>
              <Text className="text-light-matte-black font-medium">
                TakumiPay Services
              </Text>
            </View>
            <View className="flex-row justify-between mb-2">
              <Text className="text-light-matte-black/70">Validity</Text>
              <Text className="text-light-matte-black font-medium">
                30 days
              </Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-light-matte-black/70">Auto-renewal</Text>
              <Text className="text-light-matte-black font-medium">No</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          activeOpacity={0.7}
          className={`bg-light-primary-red py-4 rounded-full items-center ${!selectedItemVariant ? "opacity-50" : ""}`}
          disabled={!selectedItemVariant}
          onPress={() => selectedItemVariant && router.push("/payment")}
        >
          <Text className="text-light font-bold text-lg">
            Continue to Payment
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
