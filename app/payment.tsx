import ChainSelector from "@/components/common/ChainSelector";
import LoadinngSpinnerPopup from "@/components/common/LoadinngSpinnerPopup";
import PinConfirmationModal from "@/components/common/PinConfirmationModal";
import TokenSelectorModal from "@/components/wallet/TokenSelectorModal";
import WalletSelectorModal from "@/components/wallet/WalletSelectorModal";
import { useWallet } from "@/hooks/useWallet";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowLeft, ChevronDown } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { formatUnits } from "viem";

const SUPPORTED_TOKENS = [
  { symbol: "ETH", name: "Ethereum" },
  { symbol: "USDT", name: "Tether USD" },
  { symbol: "USDC", name: "USD Coin" },
  { symbol: "LINK", name: "Chainlink" },
  { symbol: "DAI", name: "Dai Stablecoin" },
];

export default function PaymentScreen() {
  const {
    wallets,
    activeWallet,
    activeWalletIndex,
    setActiveWallet,
    getPublicClientForActiveChain,
  } = useWallet();

  const [isLoading, setIsLoading] = useState(false);
  const [balance, setBalance] = useState<bigint>(BigInt(0));
  const [walletModalVisible, setWalletModalVisible] = useState(false);
  const [tokenModalVisible, setTokenModalVisible] = useState(false);
  const [isLoadingBalance, setIsLoadingBalance] = useState(true);
  const [selectedToken, setSelectedToken] = useState(SUPPORTED_TOKENS[0]);
  const [transactionStatus, setTransactionStatus] = useState("");
  const [pinModalVisible, setPinModalVisible] = useState(false);

  const itemPrice = "25.00";
  const tokenAmountNeeded = "0.000017";

  useEffect(() => {
    const fetchBalance = async () => {
      if (!activeWallet.address) return;

      setIsLoadingBalance(true);
      try {
        const publicClient = getPublicClientForActiveChain();
        if (!publicClient) return;

        const balanceValue = await publicClient.getBalance({
          address: activeWallet.address as `0x${string}`,
        });

        setBalance(balanceValue);
      } catch (error) {
        console.error("Error fetching balance:", error);
        Alert.alert("Error", "Failed to fetch wallet balance");
      } finally {
        setIsLoadingBalance(false);
      }
    };

    fetchBalance();
  }, [activeWallet, getPublicClientForActiveChain]);

  const handleSelectWallet = (index: number) => {
    setActiveWallet(index);
    setWalletModalVisible(false);
  };

  const handleSelectToken = (token: (typeof SUPPORTED_TOKENS)[0]) => {
    setSelectedToken(token);
    setTokenModalVisible(false);
  };

  const formatBalance = (rawBalance: bigint) => {
    return parseFloat(formatUnits(rawBalance, 18)).toFixed(4);
  };

  const handlePayment = useCallback(async () => {
    setIsLoading(true);
    setTransactionStatus("Preparing payment...");

    try {
      setTransactionStatus("Processing payment request...");
      await new Promise((resolve) => setTimeout(resolve, 1500));

      setTransactionStatus("Confirming transaction...");
      await new Promise((resolve) => setTimeout(resolve, 1500));

      setTransactionStatus("Finalizing purchase...");
      await new Promise((resolve) => setTimeout(resolve, 1000));

      Alert.alert(
        "Payment Successful",
        `You have successfully purchased the item for ${itemPrice} USD using ${tokenAmountNeeded} ${selectedToken.symbol}`,
        [{ text: "OK", onPress: () => router.back() }],
      );
    } catch (error) {
      console.error("Payment error:", error);
      Alert.alert(
        "Payment Failed",
        "An error occurred during the payment process",
      );
    } finally {
      setIsLoading(false);
    }
  }, [itemPrice, tokenAmountNeeded, selectedToken]);

  const { name, price, features } = useLocalSearchParams();

  const handlePaymentConfirmation = () => {
    setPinModalVisible(true);
  };

  const handlePaymentWithPin = async () => {
    setPinModalVisible(false);
    await handlePayment();
  };

  return (
    <>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView className="flex-1 bg-light-main-container" edges={["top"]}>
        <View className="flex-1 px-5 py-2">
          <View className="flex-row items-center mb-6">
            <Pressable onPress={() => router.back()} className="mr-4">
              <ArrowLeft color="#c71c4b" size={24} />
            </Pressable>
            <Text className="text-light-matte-black text-xl font-bold">
              Confirm Purchase
            </Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} className="mb-4">
            <View className="bg-white rounded-2xl p-5 mb-5 shadow-sm">
              <Text className="text-light-matte-black font-bold text-lg mb-5">
                Purchase Summary
              </Text>

              <View className="flex-row mb-4">
                <View className="w-20 h-20 bg-light-primary-red/10 rounded-xl mr-4 items-center justify-center">
                  <Text className="text-light-primary-red text-2xl">📦</Text>
                </View>
                <View className="flex-1 justify-center">
                  <Text className="text-light-matte-black font-bold text-lg">
                    {name || "Premium Service"}
                  </Text>
                  <Text className="text-light-matte-black/70">
                    {features || "Access to all premium features"}
                  </Text>
                </View>
              </View>

              <View className="space-y-3 mb-4">
                <View className="flex-row justify-between">
                  <Text className="text-light-matte-black/70">Price</Text>
                  <Text className="text-light-primary-red font-medium">
                    {price || "Rp25.000"}
                  </Text>
                </View>

                <View className="flex-row justify-between">
                  <Text className="text-light-matte-black/70">
                    Token Conversion
                  </Text>
                  <Text className="text-light-matte-black font-medium">
                    {tokenAmountNeeded} {selectedToken.symbol}
                  </Text>
                </View>

                <View className="flex-row justify-between">
                  <Text className="text-light-matte-black/70">Network Fee</Text>
                  <Text className="text-light-matte-black font-medium">
                    0.001 ETH
                  </Text>
                </View>
              </View>

              <View className="border-t border-light-matte-black/10 pt-4">
                <View className="flex-row justify-between">
                  <Text className="text-light-matte-black font-bold text-lg">
                    Total to Pay
                  </Text>
                  <Text className="text-light-primary-red font-bold text-lg">
                    {tokenAmountNeeded} {selectedToken.symbol}
                  </Text>
                </View>
              </View>
            </View>

            <View className="bg-white rounded-2xl p-5 mb-5 shadow-sm">
              <Text className="text-light-matte-black font-bold text-lg mb-5">
                Payment Method
              </Text>

              <View className="mb-5">
                <Text className="text-light-matte-black/70 text-sm mb-2">
                  Wallet
                </Text>
                <Pressable
                  className="bg-light-main-container p-4 rounded-xl flex-row items-center justify-between border border-light-main-container/20"
                  onPress={() => setWalletModalVisible(true)}
                >
                  <View className="flex-row items-center">
                    <View>
                      <Text className="text-light-matte-black font-medium">
                        {activeWallet.name || "My Wallet"}
                      </Text>
                      <Text className="text-light-matte-black/60 text-xs">
                        {activeWallet?.address?.substring(0, 6)}...
                        {activeWallet?.address?.substring(
                          activeWallet.address.length - 4,
                        )}
                      </Text>
                    </View>
                  </View>
                  <ChevronDown size={20} color="#c71c4b" />
                </Pressable>

                <View className="flex-row items-center justify-between mt-3">
                  <Text className="text-light-matte-black/60 text-xs">
                    Balance:{" "}
                    {isLoadingBalance
                      ? "Loading..."
                      : `${formatBalance(balance)} ${getPublicClientForActiveChain()?.chain?.nativeCurrency.symbol}`}
                  </Text>
                  <ChainSelector />
                </View>
              </View>

              <View>
                <Text className="text-light-matte-black/70 text-sm mb-2">
                  Payment Token
                </Text>
                <Pressable
                  className="bg-light-main-container p-4 rounded-xl flex-row items-center justify-between border border-light-main-container/20"
                  onPress={() => setTokenModalVisible(true)}
                >
                  <View className="flex-row items-center">
                    <View className="bg-light-primary-red/10 p-2 rounded-full mr-3">
                      <Text className="text-light-primary-red font-bold text-xs">
                        {selectedToken.symbol.charAt(0)}
                      </Text>
                    </View>
                    <Text className="text-light-matte-black font-medium">
                      {selectedToken.symbol} - {selectedToken.name}
                    </Text>
                  </View>
                  <ChevronDown size={20} color="#c71c4b" />
                </Pressable>
              </View>
            </View>
          </ScrollView>

          <TouchableOpacity
            activeOpacity={0.7}
            className="bg-light-primary-red p-5 rounded-full shadow-md"
            onPress={handlePaymentConfirmation}
            disabled={isLoading}
          >
            <Text className="text-white font-bold text-center text-lg">
              {isLoading ? "Processing..." : "Confirm & Pay"}
            </Text>
          </TouchableOpacity>

          <PinConfirmationModal
            visible={pinModalVisible}
            onClose={() => setPinModalVisible(false)}
            onConfirm={handlePaymentWithPin}
            title="Confirm Payment"
          />
        </View>

        <LoadinngSpinnerPopup
          visible={isLoading}
          title="Processing Payment"
          message={transactionStatus}
        />

        <WalletSelectorModal
          visible={walletModalVisible}
          onClose={() => setWalletModalVisible(false)}
          wallets={wallets}
          activeWalletIndex={activeWalletIndex}
          onSelectWallet={handleSelectWallet}
          title="Select Wallet"
        />

        <TokenSelectorModal
          visible={tokenModalVisible}
          onClose={() => setTokenModalVisible(false)}
          tokens={SUPPORTED_TOKENS}
          selectedToken={selectedToken}
          onSelectToken={handleSelectToken}
          title="Select Token"
        />
      </SafeAreaView>
    </>
  );
}
