import React from "react";
import { StatusBar, StyleSheet, Text, View } from "react-native";
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
        <View className="bg-red-500 flex-1">
          <Text>Hello</Text>
          <Text>{privateKey}</Text>
          <Text>{mnemonic}</Text>
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
