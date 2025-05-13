import { MoveRight } from "lucide-react-native";
import React from "react";
import { Pressable, Text, View } from "react-native";

export default function PaymentSection() {
  return (
    <View className="bg-light rounded-[14px] w-full p-[22px] gap-4">
      <View className="flex-row px-[22px]-">
        <Text className="text-light-matte-black text-sm">Payments</Text>
        <Pressable className="flex-row items-center justify-center border-2 ml-auto border-light-primary-red bg-light-primary-red/10 gap-2 rounded-full px-4 py-1">
          <Text className="text-light-matte-black text-sm font-bold">
            View All
          </Text>
          <MoveRight size={20} color="#c71c4b" />
        </Pressable>
      </View>
      <View className="flex-row gap-2 justify-between flex-wrap">
        {[
          {
            name: "Pulsa",
          },
          {
            name: "Data Package",
          },
          {
            name: "PLN",
          },
          {
            name: "Games Top Up",
          },
          {
            name: "Top Up e-money",
          },
        ].map((k) => (
          <View key={k.name} className="max-w-24 grow">
            <View className="rounded-2xl border-2 border-light-matte-black w-16 aspect-square bg-light-primary-red/40" />
            <Text className="text-[10px] text-center text-wrap max-w-16">
              {k.name}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
