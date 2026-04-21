import { router } from "expo-router";
import {
  ChevronRight,
  KeyRound,
  Plus,
  ShieldCheck,
  Store,
} from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
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
import ImportPrivateKeySheet from "@/components/wallet/create/ImportPrivateKeySheet";
import ImportSeedPhraseSheet from "@/components/wallet/create/ImportSeedPhraseSheet";
import {
  configureGoogleSignIn,
  useGoogleSignIn,
} from "@/hooks/queries/useGoogleAuth";
import { useWallet } from "@/hooks/useWallet";
import { bootstrapFirstLoginWallets } from "@/services/walletKit/bootstrap";
import {
  loadWalletsFromStorage,
  saveWalletsToStorage,
} from "@/services/walletService";

export default function Login() {
  const { height } = useWindowDimensions();
  const scrollViewRef = useRef<ScrollView>(null);
  const googleSignIn = useGoogleSignIn();
  const { addWallets } = useWallet();
  const [creating, setCreating] = useState(false);
  const [seedSheetVisible, setSeedSheetVisible] = useState(false);
  const [pkSheetVisible, setPkSheetVisible] = useState(false);

  // Configure Google Sign-In on mount
  useEffect(() => {
    configureGoogleSignIn();
  }, []);

  const handleCreateWallet = useCallback(async () => {
    if (creating) return;
    setCreating(true);
    try {
      const minted = await bootstrapFirstLoginWallets();
      if (minted.length === 0) {
        Alert.alert(
          "Create Failed",
          "Could not create a wallet. Please try again.",
        );
        return;
      }
      await addWallets(minted);
      router.replace("/");
    } catch (error) {
      console.error("create wallet failed:", error);
      Alert.alert(
        "Create Failed",
        "Could not create a wallet. Please try again.",
      );
    } finally {
      setCreating(false);
    }
  }, [creating, addWallets]);

  const handleSeedWalletsAdded = useCallback(() => {
    setSeedSheetVisible(false);
    router.replace("/");
  }, []);

  const handlePrivateKeyWalletAdded = useCallback((_: unknown) => {
    setPkSheetVisible(false);
    router.replace("/");
  }, []);

  const handleImportSeedPhraseInstead = useCallback(() => {
    setPkSheetVisible(false);
    setSeedSheetVisible(true);
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

            <View className="bg-light rounded-3xl p-6 shadow-md- mb-4">
              <Text className="text-light-matte-black/80 font-medium mb-4">
                GET STARTED
              </Text>

              <TouchableOpacity
                activeOpacity={0.7}
                className="bg-light border border-light-matte-black/10 py-4 px-5 rounded-xl flex-row items-center justify-between mb-3"
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

              <TouchableOpacity
                activeOpacity={0.7}
                className="bg-light-primary-red py-4 px-5 rounded-xl flex-row items-center justify-between mb-3"
                onPress={handleCreateWallet}
                disabled={creating}
              >
                <View className="flex-row items-center">
                  <View className="w-11 h-11 bg-light/20 rounded-full items-center justify-center mr-3">
                    {creating ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Plus color="#ffffff" size={20} />
                    )}
                  </View>
                  <Text className="text-light font-semibold">
                    {creating ? "Creating wallet…" : "Create New Wallet"}
                  </Text>
                </View>
                <ChevronRight color="#ffffff" size={18} />
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.7}
                className="bg-light-primary-red py-4 px-5 rounded-xl flex-row items-center justify-between"
                onPress={() => router.push("/merchant/signup-intro" as never)}
                disabled={creating}
              >
                <View className="flex-row items-center">
                  <View className="w-11 h-11 bg-light/20 rounded-full items-center justify-center mr-3">
                    <Store color="#ffffff" size={20} />
                  </View>
                  <Text className="text-light font-semibold">
                    Register as Merchant
                  </Text>
                </View>
                <ChevronRight color="#ffffff" size={18} />
              </TouchableOpacity>
            </View>

            <View className="bg-light rounded-3xl p-6 shadow-md- mb-8">
              <Text className="text-light-matte-black/80 font-medium mb-4">
                IMPORT EXISTING WALLET
              </Text>

              <TouchableOpacity
                activeOpacity={0.7}
                className="bg-light border border-light-matte-black/10 py-4 px-5 rounded-xl flex-row items-center justify-between mb-3"
                onPress={() => setSeedSheetVisible(true)}
                disabled={creating}
              >
                <View className="flex-row items-center">
                  <View className="w-11 h-11 bg-light-primary-red/10 rounded-full items-center justify-center mr-3">
                    <ShieldCheck color="#c71c4b" size={20} />
                  </View>
                  <View>
                    <Text className="text-light-matte-black font-medium">
                      Import Seed Phrase
                    </Text>
                    <Text className="text-light-matte-black/50 text-xs">
                      12 or 24 words — derives every chain
                    </Text>
                  </View>
                </View>
                <ChevronRight color="#20222c" size={18} />
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.7}
                className="bg-light border border-light-matte-black/10 py-4 px-5 rounded-xl flex-row items-center justify-between"
                onPress={() => setPkSheetVisible(true)}
                disabled={creating}
              >
                <View className="flex-row items-center">
                  <View className="w-11 h-11 bg-light-primary-red/10 rounded-full items-center justify-center mr-3">
                    <KeyRound color="#c71c4b" size={20} />
                  </View>
                  <View>
                    <Text className="text-light-matte-black font-medium">
                      Import Private Key
                    </Text>
                    <Text className="text-light-matte-black/50 text-xs">
                      One chain — EVM or Solana
                    </Text>
                  </View>
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

        <ImportSeedPhraseSheet
          visible={seedSheetVisible}
          onClose={() => setSeedSheetVisible(false)}
          onWalletsAdded={handleSeedWalletsAdded}
        />
        <ImportPrivateKeySheet
          visible={pkSheetVisible}
          onClose={() => setPkSheetVisible(false)}
          onWalletAdded={handlePrivateKeyWalletAdded}
          onImportSeedPhraseInstead={handleImportSeedPhraseInstead}
        />
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  scrollViewContent: {
    flexGrow: 1,
  },
});
