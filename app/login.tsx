import { router } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import React, { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  configureGoogleSignIn,
  useGoogleSignIn,
} from "@/hooks/queries/useGoogleAuth";
import {
  loadWalletsFromStorage,
  saveWalletsToStorage,
} from "@/services/walletService";
import { bootstrapFirstLoginWallets } from "@/services/walletKit/bootstrap";

export default function Login() {
  const { height } = useWindowDimensions();
  const scrollViewRef = useRef<ScrollView>(null);
  const googleSignIn = useGoogleSignIn();

  // Configure Google Sign-In on mount
  useEffect(() => {
    configureGoogleSignIn();
  }, []);

  const handleGoogleSignIn = async () => {
    try {
      const result = await googleSignIn.mutateAsync();

      // Show alert with user identity for testing
      Alert.alert(
        "Google Sign-In Successful!",
        `Welcome!\n\nUser ID: ${result.user.id}\nEmail: ${result.user.email || "N/A"}\nName: ${result.user.name || "N/A"}\nRole: ${result.user.role}`,
        [{ text: "OK" }],
      );

      // Spec §14.1 / §14.8: login is auth-only. Wallet bootstrap runs
      // post-auth when the user has zero wallets in secure storage.
      const wallets = await loadWalletsFromStorage();
      if (wallets.length === 0) {
        const minted = await bootstrapFirstLoginWallets();
        if (minted.length > 0) await saveWalletsToStorage(minted);
      }

      router.replace("/");
    } catch (error: any) {
      console.error("Google sign-in error:", error);
      if (error.message !== "Sign in cancelled") {
        Alert.alert(
          "Sign In Failed",
          "Failed to sign in with Google. Please try again.",
        );
      }
    }
  };

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
                Takumi Wallet
              </Text>
              <Text className="text-light-matte-black/70 text-base text-center max-w-72">
                Next-Gen AI Wallet for All Your Payment Needs
              </Text>
            </View>

            <View className="bg-light rounded-3xl p-6 shadow-md- mb-8">
              <Text className="text-light-matte-black/80 font-medium mb-4">
                GET STARTED
              </Text>

              <TouchableOpacity
                activeOpacity={0.7}
                className="bg-light border border-light-matte-black/10 py-4 px-5 rounded-xl flex-row items-center justify-between"
                onPress={handleGoogleSignIn}
                disabled={googleSignIn.isPending}
              >
                <View className="flex-row items-center">
                  <View className="w-11 h-11 bg-light-primary-red/10 rounded-full items-center justify-center mr-3">
                    {googleSignIn.isPending ? (
                      <ActivityIndicator size="small" color="#c71c4b" />
                    ) : (
                      <Image
                        source={require("@/assets/images/google-takumipay.png")}
                        style={{ width: 20, height: 20 }}
                      />
                    )}
                  </View>
                  <Text className="text-light-matte-black font-medium">
                    {googleSignIn.isPending
                      ? "Signing in..."
                      : "Continue with Google"}
                  </Text>
                </View>
                <ChevronRight color="#20222c" size={18} />
              </TouchableOpacity>
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
