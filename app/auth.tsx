import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { ArrowLeft, Shield, Wallet2 } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import { Image, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import LoadinngSpinnerPopup from "@/components/common/LoadinngSpinnerPopup";
import PinConfirmationModal from "@/components/common/PinConfirmationModal";
import SignMessageModal from "@/components/common/SignMessageModal";
import { usePerformance } from "@/components/providers/PerformanceProvider";
import { publicApi } from "@/constants/configs/ky";
import { transactionsQueryKeys } from "@/constants/queryKeys/transactionsQueryKeys";
import { useNonce, useVerifySignature } from "@/hooks/queries/useAuth";
import { useLoadingSteps } from "@/hooks/useLoadingSteps";
import useRQGlobalState from "@/hooks/useRQGlobalState";
import { useWallet } from "@/hooks/useWallet";
import {
  formatChainLabel,
  getNonceParams,
} from "@/services/walletKit/chainInfo";
import { walletKitRegistry } from "@/services/walletKit/registry";

interface NonceData {
  message: string;
}

export default function AuthScreen() {
  const [isPinModalVisible, setIsPinModalVisible] = useState(false);
  const [isStatementModalVisible, setIsStatementModalVisible] = useState(false);
  const {
    isLoading,
    currentMessage: loadingMessage,
    completeStep,
    start: startLoading,
    stop: stopLoading,
    delay,
  } = useLoadingSteps([
    "Preparing to sign message...",
    "Signing message with your wallet...",
    "Verifying signature...",
    "Authentication successful!",
  ]);

  const queryClient = useQueryClient();
  const { deferredTask } = usePerformance();

  const { activeWallet, activeChain, isLoading: isWalletLoading } = useWallet();

  const activeChainName = formatChainLabel(activeChain);

  // Nonce fetch params, keyed on the *wallet's* namespace (not
  // `activeChain`, which briefly lags a wallet switch — the wallet mutation
  // commits before the chain mutation). EVM authenticates with a numeric
  // chainId (SIWE); Solana/Sui with a chainSlug (SIWS). `getNonceParams`
  // owns that mapping and the race-safe mainnet fallback, so a
  // mid-transition chain can't drop the param and 400 the request with
  // "Invalid Ethereum wallet address format".
  const nonceParams = getNonceParams(activeWallet, activeChain);
  const nonceSelector = nonceParams.chainSlug ?? nonceParams.chainId;

  const { data: fetchedNonce } = useNonce(activeWallet?.address, nonceParams);

  // Pre-warm the signer the moment this screen mounts so the later
  // "Sign & Continue" tap doesn't pay a fresh derivation on the main
  // thread inside `handleSignMessage`. Each kit owns its dwell-site cache
  // (EVM the viem account; Solana/Sui the keypair signer), so we ask the
  // registry without branching on namespace.
  useEffect(() => {
    if (!activeWallet?.address) return;
    void walletKitRegistry
      .get(activeWallet.namespace)
      .getSignerForWallet(activeWallet);
  }, [activeWallet]);

  const nonceQueryKey = ["auth", "nonce", activeWallet?.address, nonceSelector];

  const { data: nonceData, setNewData: setNonceData } =
    useRQGlobalState<NonceData>({
      queryKey: nonceQueryKey,
      initialData: { message: "" },
    });

  // Sync fetched nonce into global state so handleSignMessage can read it
  useEffect(() => {
    if (fetchedNonce?.message && fetchedNonce.message !== nonceData?.message) {
      setNonceData({ message: fetchedNonce.message });
    }
  }, [fetchedNonce, nonceData?.message, setNonceData]);

  const { mutateAsync: verifySignature } = useVerifySignature();

  const handleSignMessage = useCallback(async () => {
    // Source-of-truth resolution: prefer the freshly-fetched nonce.
    // The `useRQGlobalState` mirror's queryKey shifts when
    // `activeWallet.namespace` / `activeChain.network` hydrate (Sui
    // wallet on first mount races with the network info), and the
    // brief window of empty initial data was firing this error.
    //
    // Fall back order:
    //   1. nonceData (global state mirror)
    //   2. fetchedNonce (useNonce result; same network round-trip)
    //   3. Inline fetch — bypasses React Query entirely so timing/key
    //      shifts can't strand the handler. Safe because the server
    //      `auth/nonce` is idempotent within the TTL.
    let message = nonceData?.message || fetchedNonce?.message;
    if (!message && activeWallet?.address) {
      try {
        const params = getNonceParams(activeWallet, activeChain);
        const query = params.chainSlug
          ? `?chainSlug=${encodeURIComponent(params.chainSlug)}`
          : params.chainId
            ? `?chainId=${params.chainId}`
            : "";
        const fresh = await publicApi
          .get(`auth/nonce/${activeWallet.address}${query}`)
          .json<{ nonce: string; message: string }>();
        message = fresh?.message;
      } catch (err) {
        console.error("Inline nonce fetch failed:", err);
      }
    }
    if (!message) {
      console.error(
        "Error: Failed to get authentication message",
        "namespace=",
        activeWallet?.namespace,
        "address=",
        activeWallet?.address?.slice(0, 12),
      );
      return;
    }

    setIsPinModalVisible(false);
    startLoading();

    await new Promise((resolve) => setTimeout(resolve, 300));

    try {
      completeStep(0);
      await delay(800);

      if (!activeWallet) {
        throw new Error("No active wallet for authentication");
      }

      completeStep(1);

      // Each kit owns its signing primitive + output encoding (EVM hex via
      // EIP-191; Solana base58; Sui base64 SIWS). Dispatch through the
      // registry so this stays chain-agnostic — the per-namespace branches
      // moved onto `kit.signAuthMessage`.
      const signature = await deferredTask(
        () =>
          walletKitRegistry
            .get(activeWallet.namespace)
            .signAuthMessage(activeWallet, message),
        "Signing authentication message",
      );

      completeStep(2);
      await delay(800);

      await deferredTask(async () => {
        const authResponse = await verifySignature({
          message: message,
          signature,
        });
        console.log("jwt token: ", authResponse.access_token);

        queryClient.invalidateQueries({ queryKey: ["auth"] });
        queryClient.invalidateQueries({ queryKey: transactionsQueryKeys.all });
      }, "Verifying signature");

      completeStep(3);
      await delay(1000);

      router.replace("/");
    } catch (error: any) {
      console.error("Authentication error:", error);
      console.error(
        "Authentication Failed:",
        error?.message || "Failed to authenticate with wallet",
      );
      stopLoading();
    }
  }, [
    nonceData,
    fetchedNonce,
    activeWallet,
    activeChain,
    verifySignature,
    queryClient,
    deferredTask,
    completeStep,
    startLoading,
    stopLoading,
    delay,
  ]);

  const startAuthentication = useCallback(() => {
    if (!activeWallet?.address) {
      console.error("Error: No wallet selected");
      return;
    }

    AsyncStorage.getItem(`auth_remember_choice_${activeWallet.address}`)
      .then((value) => {
        if (value === "true") {
          setIsPinModalVisible(true);
        } else {
          setIsStatementModalVisible(true);
        }
      })
      .catch(() => {
        setIsStatementModalVisible(true);
      });
  }, [activeWallet?.address]);

  const handleStatementConfirm = useCallback(
    async (rememberChoice: boolean) => {
      setIsStatementModalVisible(false);

      if (rememberChoice && activeWallet?.address) {
        await AsyncStorage.setItem(
          `auth_remember_choice_${activeWallet.address}`,
          "true",
        );
      }

      setIsPinModalVisible(true);
    },
    [activeWallet?.address],
  );

  return (
    <SafeAreaView className="flex-1 bg-light-main-container">
      <View className="flex-row items-center justify-between p-4 pb-2">
        <TouchableOpacity
          onPress={() => router.back()}
          className="w-11 h-11 items-center justify-center rounded-2xl bg-light shadow-sm"
          activeOpacity={0.7}
          style={{
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 4,
            elevation: 3,
          }}
        >
          <ArrowLeft size={22} color="#20222c" strokeWidth={2} />
        </TouchableOpacity>

        <View className="flex-1 items-center">
          <Text className="text-lg font-bold text-light-matte-black">
            Almost There! 🎉
          </Text>
          <Text className="text-light-matte-black/60 text-sm">
            One quick step to secure your account
          </Text>
        </View>

        <View className="w-11" />
      </View>

      <ScrollView
        className="flex-1 px-4"
        contentContainerStyle={{ paddingBottom: 20 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="items-center py-8 mb-6">
          <View className="relative mb-6">
            <View className="bg-light-primary-red/5 w-28 h-28 rounded-3xl items-center justify-center">
              <View className="bg-light-primary-red/10 w-24 h-24 rounded-2xl items-center justify-center">
                <View className="bg-light w-20 h-20 rounded-xl items-center justify-center shadow-sm">
                  <Image
                    source={require("@/assets/images/takumipay-logo.png")}
                    style={{ width: 50, height: 50 }}
                    resizeMode="contain"
                  />
                </View>
              </View>
            </View>
            <View className="absolute -top-2 -right-2 w-4 h-4 bg-light-primary-red rounded-full" />
            <View className="absolute -bottom-1 -left-1 w-3 h-3 bg-light-primary-red/60 rounded-full" />
          </View>

          <Text className="text-light-matte-black text-2xl font-bold mb-3 text-center">
            Secure Your Access
          </Text>

          <Text className="text-light-matte-black/60 text-center text-base leading-6 max-w-80">
            Sign a quick message to unlock your wallet safely and securely ✨
          </Text>
        </View>

        <View className="bg-light rounded-3xl p-6 mb-6 shadow-sm">
          <View className="flex-row items-center mb-4">
            <View className="bg-light-primary-red/10 p-3 rounded-2xl mr-4">
              <Wallet2 color="#c71c4b" size={24} strokeWidth={2} />
            </View>
            <View className="flex-1">
              <Text className="text-light-matte-black font-bold text-lg">
                {activeWallet?.name || "My Wallet"}
              </Text>
              <Text className="text-light-matte-black/50 text-sm">
                Connected and ready
              </Text>
            </View>
          </View>

          <View className="bg-light-main-container p-4 rounded-2xl mb-6">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-light-matte-black/70 text-sm">
                Wallet Address
              </Text>
              <View className="bg-light-primary-red/10 px-2 py-1 rounded-full">
                <Text className="text-light-primary-red text-xs font-medium">
                  Active
                </Text>
              </View>
            </View>
            <Text className="text-light-matte-black font-mono text-sm mb-3">
              {activeWallet?.address
                ? `${activeWallet.address.substring(0, 12)}...${activeWallet.address.substring(
                    activeWallet.address.length - 8,
                  )}`
                : "No wallet selected"}
            </Text>
            <View className="flex-row items-center">
              <View className="w-2 h-2 bg-green-500 rounded-full mr-2" />
              <Text className="text-light-matte-black/60 text-xs">
                {activeChainName || "Unknown Network"}
              </Text>
            </View>
          </View>

          {!isLoading ? (
            <TouchableOpacity
              className={`py-4 rounded-2xl items-center flex-row justify-center gap-3 ${isWalletLoading || !activeWallet?.address ? "bg-light-primary-red/50" : "bg-light-primary-red"}`}
              onPress={startAuthentication}
              activeOpacity={0.8}
              disabled={isWalletLoading || !activeWallet?.address}
              style={{
                shadowColor: "#c71c4b",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.15,
                shadowRadius: 12,
                elevation: 8,
              }}
            >
              <Shield color="#ffffff" size={20} strokeWidth={2} />
              <Text className="text-white font-bold text-base">
                {isWalletLoading ? "Loading Wallet..." : "Sign & Continue"}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View className="bg-light rounded-3xl p-4 shadow-sm">
          <View className="flex-row items-center justify-center">
            <Shield color="#059669" size={16} strokeWidth={2} />
            <Text className="text-light-matte-black/60 text-sm ml-2">
              Secure • No gas fees • Your keys stay safe
            </Text>
          </View>
        </View>
      </ScrollView>

      <SignMessageModal
        visible={isStatementModalVisible}
        onClose={() => setIsStatementModalVisible(false)}
        onConfirm={handleStatementConfirm}
      />

      <PinConfirmationModal
        visible={isPinModalVisible}
        onClose={() => setIsPinModalVisible(false)}
        onConfirm={handleSignMessage}
        title="Confirm Authentication"
      />

      <LoadinngSpinnerPopup
        visible={isLoading}
        title="Authenticating"
        message={loadingMessage}
      />
    </SafeAreaView>
  );
}
