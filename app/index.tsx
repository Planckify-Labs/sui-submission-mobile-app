import ActivitySection from "@/components/home/ActivitySection";
import BalanceSection from "@/components/home/BalanceSection";
import PaymentSection from "@/components/home/PaymentSection";
import React from "react";
import { StatusBar, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { english, generateMnemonic, generatePrivateKey } from "viem/accounts";

export default function Home() {
  const privateKey = generatePrivateKey();
  console.log({ privateKey });

  const mnemonic = generateMnemonic(english);
  console.log({ mnemonic });
  return (
    <>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View className="bg-light-main-container flex-1 p-4 gap-4">
          <BalanceSection />
          <ActivitySection />
          <PaymentSection />
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
