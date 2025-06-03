import LoadinngSpinnerPopup from "@/components/common/LoadinngSpinnerPopup";
import ChainSelector from "@/components/wallet/ChainSelector";
import TokenSelectorModal from "@/components/wallet/TokenSelectorModal";
import WalletSelectorModal from "@/components/wallet/WalletSelectorModal";
import { useWallet } from "@/hooks/useWallet";
import { router } from "expo-router";
import { ArrowLeft, ChevronDown, Wallet } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { formatUnits } from "viem";

const PAYMENT_PLATFORMS = [
  { id: "ovo", name: "OVO" },
  { id: "dana", name: "DANA" },
  { id: "gopay", name: "GoPay" },
  { id: "linkaja", name: "Link aja" },
];

const QUICK_AMOUNTS = ["10", "50", "100", "250", "500"];

const SUPPORTED_TOKENS = [
  { symbol: "ETH", name: "Ethereum" },
  { symbol: "USDT", name: "Tether USD" },
  { symbol: "USDC", name: "USD Coin" },
  { symbol: "LINK", name: "Chainlink" },
  { symbol: "DAI", name: "Dai Stablecoin" },
];

export default function Withdraw() {
  const {
    wallets,
    activeWallet,
    activeWalletIndex,
    setActiveWallet,
    getPublicClientForActiveChain,
  } = useWallet();

  const [selectedPlatform, setSelectedPlatform] = useState(
    PAYMENT_PLATFORMS[0],
  );
  const [phoneNumber, setPhoneNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [balance, setBalance] = useState<bigint>(BigInt(0));
  const [walletModalVisible, setWalletModalVisible] = useState(false);
  const [tokenModalVisible, setTokenModalVisible] = useState(false);
  const [isLoadingBalance, setIsLoadingBalance] = useState(true);
  const [selectedToken, setSelectedToken] = useState(SUPPORTED_TOKENS[0]);
  const [transactionStatus, setTransactionStatus] = useState("");

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

  const handleMaxAmount = useCallback(() => {
    if (isLoadingBalance) return;

    const formattedBalance = formatUnits(balance, 18);
    setAmount(parseFloat(formattedBalance).toString());
  }, [balance, isLoadingBalance]);

  const handleQuickAmount = (value: string) => {
    setAmount(value);
  };

  const validateInputs = useCallback(() => {
    if (!phoneNumber.trim()) {
      Alert.alert("Error", "Please enter a phone number");
      return false;
    }

    if (!amount || parseFloat(amount) <= 0) {
      Alert.alert("Error", "Please enter a valid amount");
      return false;
    }

    try {
      const amountValue = parseFloat(amount);
      const balanceValue = parseFloat(formatUnits(balance, 18));

      if (amountValue > balanceValue) {
        Alert.alert("Insufficient Balance", "You don't have enough funds");
        return false;
      }
    } catch (error) {
      console.error("Error validating inputs:", error);
      Alert.alert("Error", "Invalid amount format");
      return false;
    }

    return true;
  }, [phoneNumber, amount, balance]);

  const handleWithdraw = useCallback(async () => {
    if (!validateInputs()) return;

    setIsLoading(true);
    setTransactionStatus("Preparing withdrawal...");

    try {
      setTransactionStatus("Processing withdrawal request...");
      await new Promise((resolve) => setTimeout(resolve, 1500));

      setTransactionStatus("Confirming with payment provider...");
      await new Promise((resolve) => setTimeout(resolve, 1500));

      setTransactionStatus("Finalizing transaction...");
      await new Promise((resolve) => setTimeout(resolve, 1000));

      Alert.alert(
        "Withdrawal Successful",
        `You have successfully withdrawn ${amount} ${selectedToken.symbol} to ${selectedPlatform.name} account ${phoneNumber}`,
        [{ text: "OK", onPress: () => router.back() }],
      );
    } catch (error) {
      console.error("Withdrawal error:", error);
      Alert.alert(
        "Withdrawal Failed",
        "An error occurred during the withdrawal process",
      );
    } finally {
      setIsLoading(false);
    }
  }, [amount, phoneNumber, selectedPlatform, selectedToken, validateInputs]);

  const formatBalance = (rawBalance: bigint) => {
    return parseFloat(formatUnits(rawBalance, 18)).toFixed(4);
  };

  return (
    <>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView className="flex-1 bg-light-main-container" edges={["top"]}>
        <View className="flex-1 p-6">
          <View className="flex-row items-center mb-6">
            <Pressable onPress={() => router.back()} className="mr-4">
              <ArrowLeft color="#c71c4b" size={24} />
            </Pressable>
            <Text className="text-light-matte-black text-xl font-bold">
              Withdraw
            </Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View className="bg-light rounded-xl mb-6 shadow-sm">
              <View className="mb-6 p-5">
                <Text className="text-light-matte-black/70 mb-2">From</Text>
                <Pressable
                  className="bg-light-main-container p-4 rounded-xl flex-row items-center justify-between"
                  onPress={() => setWalletModalVisible(true)}
                >
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
                  <ChevronDown size={20} color="#c71c4b" />
                </Pressable>

                <View className="flex-row items-center justify-between mt-2">
                  <Text className="text-light-matte-black/60 text-xs">
                    Balance:{" "}
                    {isLoadingBalance
                      ? "Loading..."
                      : `${formatBalance(balance)} ${getPublicClientForActiveChain()?.chain?.nativeCurrency.symbol}`}
                  </Text>
                  <ChainSelector />
                </View>
              </View>

              <View className="mb-6 p-5">
                <Text className="text-light-matte-black/70 mb-2">Token</Text>
                <Pressable
                  className="bg-light-main-container p-4 rounded-xl flex-row items-center justify-between"
                  onPress={() => setTokenModalVisible(true)}
                >
                  <Text className="text-light-matte-black font-medium">
                    {selectedToken.symbol} - {selectedToken.name}
                  </Text>
                  <ChevronDown size={20} color="#c71c4b" />
                </Pressable>
              </View>

              <View className="mb-6">
                <Text className="text-light-matte-black/70 mb-2 mx-5">
                  To Platform
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  className="mb-4"
                >
                  <View className="mx-5 flex-row gap-2">
                    {PAYMENT_PLATFORMS.map((platform) => (
                      <Pressable
                        key={platform.id}
                        className={`p-3 rounded-xl items-center mr-3 w-24 ${
                          selectedPlatform.id === platform.id
                            ? "bg-light-primary-red/10"
                            : "bg-light-main-container"
                        }`}
                        onPress={() => setSelectedPlatform(platform)}
                      >
                        <View className="w-10 h-10 bg-light-primary-red/10 rounded-full items-center justify-center mb-2">
                          <Wallet size={20} color="#c71c4b" />
                        </View>
                        <Text
                          className={`text-xs font-medium ${
                            selectedPlatform.id === platform.id
                              ? "text-light-primary-red"
                              : "text-light-matte-black"
                          }`}
                        >
                          {platform.name}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>

                <View className="mx-5">
                  <Text className="text-light-matte-black/70 mb-2">
                    Phone Number
                  </Text>
                  <TextInput
                    className="bg-light-main-container p-4 rounded-xl text-light-matte-black"
                    value={phoneNumber}
                    onChangeText={setPhoneNumber}
                    placeholder="Enter phone number"
                    placeholderTextColor="#20222c80"
                    keyboardType="phone-pad"
                  />
                </View>
              </View>

              <View className="mb-6 p-5">
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-light-matte-black/70">Amount</Text>
                  <Pressable onPress={handleMaxAmount}>
                    <Text className="text-light-primary-red text-xs font-medium">
                      MAX
                    </Text>
                  </Pressable>
                </View>
                <View className="flex-row items-center">
                  <TextInput
                    className="bg-light-main-container p-4 rounded-xl text-light-matte-black flex-1"
                    value={amount}
                    onChangeText={setAmount}
                    placeholder="0.0"
                    placeholderTextColor="#20222c80"
                    keyboardType="decimal-pad"
                  />
                  <Text className="absolute right-4 text-light-matte-black/70">
                    {selectedToken.symbol}
                  </Text>
                </View>

                <View className="flex-row flex-wrap justify-between mt-3">
                  {QUICK_AMOUNTS.map((quickAmount) => (
                    <Pressable
                      key={quickAmount}
                      className="bg-light-main-container py-2 px-3 rounded-lg mb-2"
                      onPress={() => handleQuickAmount(quickAmount)}
                    >
                      <Text className="text-light-primary-red text-xs font-medium">
                        {quickAmount}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <Pressable
                className="bg-light-primary-red p-4 rounded-xl mx-5 mb-5"
                onPress={handleWithdraw}
                disabled={isLoading}
              >
                <Text className="text-white font-bold text-center">
                  {isLoading ? "Processing..." : "Withdraw"}
                </Text>
              </Pressable>
            </View>

            <View className="bg-light rounded-xl p-5 mb-6 shadow-sm">
              <Text className="text-light-matte-black font-medium mb-3">
                Withdrawal Information
              </Text>
              <Text className="text-light-matte-black/70 text-sm mb-2">
                • Withdrawals are processed within 24 hours
              </Text>
              <Text className="text-light-matte-black/70 text-sm mb-2">
                • Minimum withdrawal amount: 10 {selectedToken.symbol}
              </Text>
              <Text className="text-light-matte-black/70 text-sm mb-2">
                • Withdrawal fee: 1% of the amount
              </Text>
              <Text className="text-light-matte-black/70 text-sm">
                • Make sure the phone number is registered with the selected
                platform
              </Text>
            </View>
          </ScrollView>
        </View>

        <LoadinngSpinnerPopup
          visible={isLoading}
          title="Processing Withdrawal"
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
