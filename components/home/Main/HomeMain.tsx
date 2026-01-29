import React, { useCallback, useRef, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import ActivitySection, {
  ActivitySectionRef,
} from "@/components/home/Main/ActivitySection";
import BalanceSection, {
  BalanceSectionRef,
} from "@/components/home/Main/BalanceSection";
import Header from "@/components/home/Main/Header";
import PaymentSection, {
  PaymentSectionRef,
} from "@/components/home/Main/PaymentSection";

export default function HomeMain() {
  const [refreshing, setRefreshing] = useState(false);
  const balanceSectionRef = useRef<BalanceSectionRef>(null);
  const activitySectionRef = useRef<ActivitySectionRef>(null);
  const paymentSectionRef = useRef<PaymentSectionRef>(null);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);

    // Call refetch on all components
    balanceSectionRef.current?.refetch();
    activitySectionRef.current?.refetch();
    paymentSectionRef.current?.refetch();

    // Wait a bit to ensure the refetch completes
    // This provides a better UX by not ending the refresh too quickly
    setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  }, []);

  return (
    <ScrollView
      className="bg-light-main-container flex-1"
      contentContainerStyle={{ gap: 16 }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#c71c4b"
          colors={["#c71c4b"]}
        />
      }
    >
      <View className="flex-1 gap-4 py-4 pb-24">
        <Header />
        <BalanceSection ref={balanceSectionRef} />
        <ActivitySection ref={activitySectionRef} />
        <PaymentSection ref={paymentSectionRef} />
      </View>
    </ScrollView>
  );
}
