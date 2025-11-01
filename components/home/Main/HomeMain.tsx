import React from "react";
import { ScrollView, View } from "react-native";
import ActivitySection from "@/components/home/Main/ActivitySection";
import BalanceSection from "@/components/home/Main/BalanceSection";
import Header from "@/components/home/Main/Header";
import PaymentSection from "@/components/home/Main/PaymentSection";

export default function HomeMain() {
  return (
    <ScrollView
      className="bg-light-main-container flex-1"
      contentContainerStyle={{ gap: 16 }}
      showsVerticalScrollIndicator={false}
    >
      <View className="flex-1 gap-4 py-4 pb-24">
        <Header />
        <BalanceSection />
        <ActivitySection />
        <PaymentSection />
      </View>
    </ScrollView>
  );
}
