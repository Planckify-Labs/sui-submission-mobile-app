import { router } from "expo-router";
import { ChevronRight, CirclePlus, Key, Wallet } from "lucide-react-native";
import React, { useRef } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function Login() {
  const { height } = useWindowDimensions();
  const scrollViewRef = useRef<ScrollView>(null);

  return (
    <>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="dark-content"
      />
      <SafeAreaView
        className="flex-1 bg-light-main-container"
        style={{ paddingTop: 0 }}
      >
        <View style={[StyleSheet.absoluteFill]} className="overflow-hidden">
          <View className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-light-primary-red/10" />
          <View className="absolute top-40 -left-40 w-80 h-80 rounded-full bg-light-primary-red/5" />
          <View className="absolute -bottom-10 -right-14 w-40 h-40 rounded-full bg-light-primary-red/10" />
        </View>

        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={[
            { minHeight: height },
            styles.scrollViewContent,
          ]}
          showsVerticalScrollIndicator={false}
          scrollEnabled={false}
          onContentSizeChange={(_, contentHeight) => {
            if (scrollViewRef.current) {
              scrollViewRef.current.setNativeProps({
                scrollEnabled: contentHeight > height,
              });
            }
          }}
        >
          <View className="flex-1 p-6">
            <View className="items-center mb-16">
              <View className="bg-light shadow-lg- py-5 justify-center items-center aspect-square rounded-3xl mb-6">
                <Image
                  source={require("@/assets/images/takumipay-no-bg.png")}
                  style={{ width: 65, height: 60 }}
                  className="object-contain w-full"
                />
              </View>

              <Text className="text-light-matte-black text-4xl font-bold text-center mb-2">
                TakumiPay
              </Text>
              <Text className="text-light-matte-black/70 text-base text-center max-w-72">
                Next-Gen AI Wallet for All Your Payment Needs
              </Text>
            </View>

            <View className="bg-light rounded-3xl p-6 shadow-md- mb-8">
              <Text className="text-light-matte-black/80 font-medium mb-4">
                GET STARTED
              </Text>

              <Pressable
                className="bg-light-primary-red mb-3 py-4 px-5 pl-6 rounded-xl flex-row items-center justify-between"
                onPress={() => router.push("/wallet-setup")}
              >
                <View className="flex-row items-center gap-3">
                  <CirclePlus color="#fff" size={30} className="mr-3" />
                  <View>
                    <Text className="text-light font-bold text-lg">
                      Create New Wallet
                    </Text>
                    <Text className="text-light/80 text-xs">
                      Generate a secure wallet
                    </Text>
                  </View>
                </View>
                <ChevronRight color="#fff" size={20} />
              </Pressable>

              <Pressable
                className="bg-light border border-light-matte-black/10 py-4 px-5 rounded-xl flex-row items-center justify-between"
                onPress={() => console.log("Login with Google")}
              >
                <View className="flex-row items-center">
                  <View className="w-11 h-11 bg-light-primary-red/10 rounded-full items-center justify-center mr-3">
                    <Image
                      source={require("@/assets/images/google-takumipay.png")}
                      style={{ width: 20, height: 20 }}
                    />
                  </View>
                  <Text className="text-light-matte-black font-medium">
                    Continue with Google
                  </Text>
                </View>
                <ChevronRight color="#20222c" size={18} />
              </Pressable>
            </View>

            <View className="bg-light rounded-3xl p-6 shadow-md- mb-6">
              <Text className="text-light-matte-black/80 font-medium mb-4">
                IMPORT EXISTING WALLET
              </Text>

              <View className="flex-row gap-3">
                <Pressable
                  className="flex-1 border border-light-matte-black/10 p-4 rounded-xl"
                  onPress={() => router.push("/import-seed-phrase")}
                >
                  <View className="items-center">
                    <View className="bg-light-primary-red/10 p-2 rounded-lg mb-2">
                      <Key color="#c71c4b" size={20} />
                    </View>
                    <Text className="text-light-matte-black font-medium text-sm">
                      Seed Phrase
                    </Text>
                  </View>
                </Pressable>

                <Pressable
                  className="flex-1 border border-light-matte-black/10 p-4 rounded-xl"
                  onPress={() => router.push("/import-private-key")}
                >
                  <View className="items-center">
                    <View className="bg-light-primary-red/10 p-2 rounded-lg mb-2">
                      <Wallet color="#c71c4b" size={20} />
                    </View>
                    <Text className="text-light-matte-black font-medium text-sm">
                      Private Key
                    </Text>
                  </View>
                </Pressable>
              </View>
            </View>

            <View className="items-center mt-auto">
              <Text className="text-light-matte-black/50 text-xs text-center max-w-80">
                By continuing, you agree to our Terms of Service and Privacy
                Policy
              </Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  scrollViewContent: {
    flexGrow: 1,
  },
});
