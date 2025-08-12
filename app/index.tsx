import ActivitySection from "@/components/home/ActivitySection";
import BalanceSection from "@/components/home/BalanceSection";
import Header from "@/components/home/Header";
import PaymentSection from "@/components/home/PaymentSection";
import PinnedTokens from "@/components/home/PinnedTokens";
import { BlurView } from "expo-blur";
import { router } from "expo-router";
import { QrCode } from "lucide-react-native";
import React from "react";
import {
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function Home() {
  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="#f5f6f9" />
      <SafeAreaView style={styles.container} edges={["top"]}>
        <ScrollView
          className="bg-light-main-container flex-1"
          contentContainerStyle={{ gap: 16 }}
          showsVerticalScrollIndicator={false}
        >
          <View className="flex-1 gap-4 py-4 pb-24">
            <Header />
            <BalanceSection />
            <PinnedTokens />
            <ActivitySection />
            <PaymentSection />
          </View>
        </ScrollView>
        <View className="absolute bottom-2 justify-center items-center w-full">
          <BlurView
            intensity={20}
            experimentalBlurMethod="dimezisBlurView"
            className="overflow-hidden rounded-full"
          >
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => router.push("/scan-to-pay")}
              className="bg-light-primary-red/40 px-10 py-4 rounded-full flex-row items-center gap-2"
            >
              <QrCode size={22} color="#fff" />
              <Text className="text-light font-bold text-xl">Scan To Pay</Text>
            </TouchableOpacity>
          </BlurView>
        </View>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f6f9",
  },
});
