import ActivitySection from "@/components/home/ActivitySection";
import BalanceSection from "@/components/home/BalanceSection";
import Header from "@/components/home/Header";
import PaymentSection from "@/components/home/PaymentSection";
import { QrCode } from "lucide-react-native";
import React from "react";
import {
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function Home() {
  return (
    <>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={styles.container} edges={["top"]}>
        <ScrollView
          className="bg-light-main-container flex-1"
          contentContainerStyle={{ gap: 16 }}
          showsVerticalScrollIndicator={false}
        >
          <View className="flex-1 gap-4 p-4 pb-24">
            <Header />
            <BalanceSection />
            <ActivitySection />
            <PaymentSection />
          </View>
        </ScrollView>
        <View className="absolute bottom-2 justify-center items-center w-full">
          <Pressable className="bg-light-primary-red px-10 py-4 rounded-full flex-row items-center gap-2">
            <QrCode size={22} color="#fff" />
            <Text className="text-light font-bold text-2xl">Scan To Pay</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
});
