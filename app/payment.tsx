import ChainSelector from "@/components/common/ChainSelector";
import LoadinngSpinnerPopup from "@/components/common/LoadinngSpinnerPopup";
import PinConfirmationModal from "@/components/common/PinConfirmationModal";
import TokenSelectorModal from "@/components/wallet/TokenSelectorModal";
import WalletSelectorModal from "@/components/wallet/WalletSelectorModal";
import { useProductVariantById } from "@/hooks/queries/useProducts";
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
  { symbol: "ETH", name: "Ethereum", balance: "1.2345" },
  { symbol: "USDT", name: "Tether USD", balance: "500.00" },
  { symbol: "USDC", name: "USD Coin", balance: "750.00" },
  { symbol: "LINK", name: "Chainlink", balance: "25.75" },
  { symbol: "DAI", name: "Dai Stablecoin", balance: "1000.00" },
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

  const { variantId } = useLocalSearchParams<{
    variantId: string;
  }>();

  const { data: variantData, isLoading: isLoadingVariant } = useProductVariantById(variantId);

  const tokenAmountNeeded = variantData?.ProductPrice?.[0]?.sellPrice
    ? (parseFloat(variantData.ProductPrice[0].sellPrice) / 16000000).toFixed(4)
    : "0.0000";

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
        `You have successfully purchased the item for ${variantData?.ProductPrice?.[0]?.sellPrice} USD using ${tokenAmountNeeded} ${selectedToken.symbol}`,
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
  }, [variantData?.ProductPrice?.[0]?.sellPrice, tokenAmountNeeded, selectedToken]);

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
            <View className="bg-white rounded-2xl p-4 mb-4 shadow-sm">
              <Text className="text-light-matte-black font-bold text-lg mb-3">
                Purchase Summary
              </Text>

              <View className="bg-light-main-container/50 rounded-xl p-3 mb-4">
                <View className="flex-row items-center mb-2">
                  <View className="w-12 h-12 bg-light-primary-red/10 rounded-lg mr-3 items-center justify-center">
                    <Text className="text-2xl">📦</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-light-matte-black font-bold text-base" numberOfLines={1}>
                      {variantData?.name || "Loading..."}
                    </Text>
                    <Text className="text-light-matte-black/60 text-sm" numberOfLines={2}>
                      {variantData?.description || "Loading..."}
                    </Text>
                  </View>
                </View>

                <View className="bg-white rounded-lg p-3 shadow-sm">
                  <View className="flex-row items-center justify-between mb-1">
                    <Text className="text-light-matte-black/70 text-sm">Price</Text>
                    <Text className="text-light-primary-red font-bold text-base">
                      {variantData?.ProductPrice?.[0]?.sellPrice
                        ? `Rp${parseInt(variantData.ProductPrice[0].sellPrice).toLocaleString("id-ID")}`
                        : "Loading..."}
                    </Text>
                  </View>
                </View>
              </View>

              <View className="bg-light-main-container/50 rounded-xl p-3">
                <Text className="text-light-matte-black font-medium text-sm mb-2">
                  Payment Details
                </Text>

                <View className="space-y-2">
                  <View className="flex-row justify-between items-center">
                    <Text className="text-light-matte-black/60 text-sm">
                      Paying with
                    </Text>
                    <View className="flex-row items-center">
                      <View className="bg-light-primary-red/10 w-5 h-5 rounded-full mr-2 items-center justify-center">
                        <Text className="text-light-primary-red text-xs font-bold">
                          {selectedToken.symbol.charAt(0)}
                        </Text>
                      </View>
                      <Text className="text-light-matte-black text-sm font-medium">
                        {tokenAmountNeeded} {selectedToken.symbol}
                      </Text>
                    </View>
                  </View>

                  <View className="flex-row justify-between items-center">
                    <Text className="text-light-matte-black/60 text-sm">
                      Rate
                    </Text>
                    <Text className="text-light-matte-black text-sm">
                      1 {selectedToken.symbol} ≈ Rp16,000,000
                    </Text>
                  </View>

                  <View className="h-px bg-light-matte-black/5 my-2" />

                  <View className="flex-row justify-between items-center">
                    <Text className="text-light-matte-black font-medium">
                      Total
                    </Text>
                    <View className="flex-row items-center">
                      <View className="bg-light-primary-red/10 w-6 h-6 rounded-full mr-2 items-center justify-center">
                        <Text className="text-light-primary-red text-xs font-bold">
                          {selectedToken.symbol.charAt(0)}
                        </Text>
                      </View>
                      <Text className="text-light-primary-red font-bold text-base">
                        {tokenAmountNeeded} {selectedToken.symbol}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>

            <View className="bg-white rounded-2xl p-4 mb-4 shadow-sm">
              <Text className="text-light-matte-black font-bold text-lg mb-4">
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
                    <View>
                      <Text className="text-light-matte-black font-medium">
                        {selectedToken.symbol} - {selectedToken.name}
                      </Text>
                      <Text className="text-light-matte-black/60 text-xs">
                        Balance: {selectedToken.balance} {selectedToken.symbol}
                      </Text>
                    </View>
                  </View>
                  <ChevronDown size={20} color="#c71c4b" />
                </Pressable>

                {parseFloat(selectedToken.balance) < parseFloat(tokenAmountNeeded) && (
                  <View className="mt-2 bg-light-primary-red/10 p-3 rounded-lg">
                    <Text className="text-light-primary-red text-sm">
                      Insufficient {selectedToken.symbol} balance. You need {tokenAmountNeeded} {selectedToken.symbol} for this transaction.
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </ScrollView>

          <TouchableOpacity
            activeOpacity={0.7}
            className="bg-light-primary-red p-5 rounded-full shadow-md"
            onPress={handlePaymentConfirmation}
            disabled={isLoading || isLoadingVariant || parseFloat(selectedToken.balance) < parseFloat(tokenAmountNeeded)}
          >
            <Text className="text-white font-bold text-center text-lg">
              {isLoading || isLoadingVariant 
                ? "Loading..." 
                : parseFloat(selectedToken.balance) < parseFloat(tokenAmountNeeded)
                  ? "Insufficient Balance"
                  : "Confirm & Pay"}
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
