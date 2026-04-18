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
import { transactionsQueryKeys } from "@/constants/queryKeys/transactionsQueryKeys";
import { useNonce, useVerifySignature } from "@/hooks/queries/useAuth";
import useRQGlobalState from "@/hooks/useRQGlobalState";
import { useWallet } from "@/hooks/useWallet";
import {
  formatChainLabel,
  getEvmChainId,
} from "@/services/walletKit/chainInfo";
import { walletKitRegistry } from "@/services/walletKit/registry";
import * as walletService from "@/services/walletService";
import { bytesToBase58 } from "@/services/chains/solana/codec";
import type { KeyPairSigner } from "@solana/kit";

interface NonceData {
  message: string;
}

export default function AuthScreen() {
  const [isPinModalVisible, setIsPinModalVisible] = useState(false);
  const [isStatementModalVisible, setIsStatementModalVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingSteps, setLoadingSteps] = useState<
    {
      message: string;
      completed: boolean;
    }[]
  >([
    { message: "Preparing to sign message...", completed: false },
    { message: "Signing message with your wallet...", completed: false },
    { message: "Verifying signature...", completed: false },
    { message: "Authentication successful!", completed: false },
  ]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  const queryClient = useQueryClient();
  const { deferredTask } = usePerformance();

  const {
    activeWallet,
    activeChain,
    getClientForActiveWallet,
    getWalletAccount,
    activeWalletIndex,
    isLoading: isWalletLoading,
  } = useWallet();

  const activeChainId = getEvmChainId(activeChain);
  const activeChainName = formatChainLabel(activeChain);

  // Branch the nonce fetch on wallet namespace.
  // EVM: pass numeric chainId (SIWE path).
  // Solana: pass chainSlug derived from cluster (SIWS path).
  //
  // Source of truth is the *wallet's* namespace, not `activeChain`.
  // `activeChain` briefly lags behind `activeWallet` on switch: the wallet
  // mutation commits first, then the chain mutation. Reading cluster from
  // `activeChain` mid-transition hands us an EVM chain and `solanaChainSlug`
  // becomes undefined — the nonce request then drops the query param,
  // falls through to the SIWE path on the server, and dies with
  // "Invalid Ethereum wallet address format". Default to mainnet when
  // the chain hasn't caught up; the user can still switch devnet via the
  // chain selector and re-trigger auth.
  const isSolana = activeWallet?.namespace === "solana";
  const solanaChainSlug = isSolana
    ? activeChain?.namespace === "solana" && activeChain.cluster === "devnet"
      ? "solana-devnet"
      : "solana-mainnet"
    : undefined;

  const nonceOpts = isSolana
    ? { chainSlug: solanaChainSlug }
    : { chainId: activeChainId };

  const { data: fetchedNonce } = useNonce(activeWallet?.address, nonceOpts);

  // Pre-warm the signer the moment this screen mounts so the later
  // "Sign & Continue" tap doesn't pay a fresh ~50–200 ms (Solana
  // Ed25519) / ~100–500 ms (EVM BIP-32) derivation on the main thread
  // inside `handleSignMessage`. By the time the user reads the copy
  // and taps the button, the signer is already cached.
  useEffect(() => {
    if (!activeWallet?.address) return;
    if (activeWallet.namespace === "solana") {
      void walletKitRegistry.get("solana").getSignerForWallet(activeWallet);
    } else if (activeWallet.namespace === "eip155") {
      // Sync derivation — caches into `accountCache` by address.
      walletService.getAccountForWallet(activeWallet);
    }
  }, [activeWallet]);

  const nonceQueryKey = isSolana
    ? ["auth", "nonce", activeWallet?.address, solanaChainSlug]
    : ["auth", "nonce", activeWallet?.address, activeChainId];

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

  const updateLoadingStep = useCallback((index: number, completed: boolean) => {
    setLoadingSteps((prev) =>
      prev.map((step, i) => (i === index ? { ...step, completed } : step)),
    );
    setCurrentStepIndex(index);
  }, []);

  const createDelay = useCallback((ms: number) => {
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve();
      }, ms);
    });
  }, []);

  const handleSignMessage = useCallback(async () => {
    if (!nonceData?.message) {
      console.error("Error: Failed to get authentication message");
      return;
    }

    setIsPinModalVisible(false);
    setIsLoading(true);

    await new Promise((resolve) => setTimeout(resolve, 300));

    try {
      updateLoadingStep(0, true);
      await createDelay(800);

      let signature: string;

      if (activeWallet?.namespace === "solana") {
        if (!activeWallet) {
          throw new Error("No active Solana wallet");
        }
        updateLoadingStep(1, true);
        signature = await deferredTask(async () => {
          const kit = walletKitRegistry.get("solana");
          const signer = (await kit.getSignerForWallet(
            activeWallet,
          )) as KeyPairSigner | null;
          if (!signer) throw new Error("No Solana signer available");
          const messageBytes = new TextEncoder().encode(nonceData.message);
          const [sigDict] = await signer.signMessages([
            { content: messageBytes, signatures: {} },
          ]);
          const sigBytes = sigDict[signer.address];
          if (!sigBytes || sigBytes.length !== 64) {
            throw new Error("Invalid Solana signature bytes");
          }
          return bytesToBase58(sigBytes);
        }, "Signing SIWS message");
      } else if (activeWallet?.namespace === "eip155") {
        const walletClient = await deferredTask(() => {
          const client = getClientForActiveWallet();
          if (!client) {
            throw new Error("Unable to initialize wallet client");
          }
          return client;
        }, "Initializing wallet client");

        const account = await deferredTask(async () => {
          const acc = await getWalletAccount(activeWalletIndex);
          if (!acc) {
            throw new Error("Wallet account not properly configured");
          }
          return acc;
        }, "Getting wallet account");

        updateLoadingStep(1, true);

        signature = await deferredTask(async () => {
          return await walletClient.signMessage({
            account,
            message: nonceData.message,
          });
        }, "Signing message");
      } else {
        throw new Error(
          `Unsupported wallet namespace for auth: ${activeWallet?.namespace}`,
        );
      }

      updateLoadingStep(2, true);
      await createDelay(800);

      await deferredTask(async () => {
        const authResponse = await verifySignature({
          message: nonceData.message,
          signature,
        });
        console.log("jwt token: ", authResponse.access_token);

        queryClient.invalidateQueries({ queryKey: ["auth"] });
        queryClient.invalidateQueries({ queryKey: transactionsQueryKeys.all });
      }, "Verifying signature");

      updateLoadingStep(3, true);
      await createDelay(1000);

      router.replace("/");
    } catch (error: any) {
      console.error("Authentication error:", error);
      console.error(
        "Authentication Failed:",
        error?.message || "Failed to authenticate with wallet",
      );
      setIsLoading(false);
    }
  }, [
    nonceData,
    getClientForActiveWallet,
    getWalletAccount,
    activeWalletIndex,
    verifySignature,
    queryClient,
    deferredTask,
    updateLoadingStep,
    createDelay,
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
        message={loadingSteps[currentStepIndex]?.message}
      />
    </SafeAreaView>
  );
}
