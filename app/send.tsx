import LoadinngSpinnerPopup from "@/components/common/LoadinngSpinnerPopup";
import ChainSelector from "@/components/wallet/ChainSelector";
import WalletSelectorModal from "@/components/wallet/WalletSelectorModal";
import { useWallet } from "@/hooks/useWallet";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import {
  ArrowLeft,
  ChevronDown,
  ClipboardCopy,
  Info,
  Loader,
  Send,
} from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { formatUnits, parseUnits } from "viem";

export default function SendScreen() {
  const {
    wallets,
    activeWallet,
    activeWalletIndex,
    setActiveWallet,
    activeChain,
    getClientForActiveWallet,
    getPublicClientForActiveChain,
  } = useWallet();

  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [balance, setBalance] = useState<bigint>(BigInt(0));
  const [walletModalVisible, setWalletModalVisible] = useState(false);
  const [recipientModalVisible, setRecipientModalVisible] = useState(false);
  const [isLoadingBalance, setIsLoadingBalance] = useState(true);
  const [transactionStatus, setTransactionStatus] = useState(
    "Preparing transaction...",
  );

  const spinValue = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (isLoading) {
      Animated.loop(
        Animated.timing(spinValue, {
          toValue: 1,
          duration: 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ).start();
    } else {
      spinValue.setValue(0);
    }
  }, [isLoading, spinValue]);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const fetchBalance = useCallback(async () => {
    if (!activeWallet?.address) return;

    try {
      setIsLoadingBalance(true);
      const publicClient = getPublicClientForActiveChain();
      const walletBalance = await publicClient.getBalance({
        address: activeWallet.address as `0x${string}`,
      });
      setBalance(walletBalance);
    } catch (error) {
      console.error("Error fetching balance:", error);
    } finally {
      setIsLoadingBalance(false);
    }
  }, [getPublicClientForActiveChain, activeWallet?.address]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  const handlePasteAddress = async () => {
    const text = await Clipboard.getStringAsync();
    if (text) setRecipient(text);
  };

  const handleMaxAmount = useCallback(async () => {
    if (!activeWallet?.address) return;

    const publicClient = getPublicClientForActiveChain();
    const estimatedGas = await publicClient.estimateGas({
      account: activeWallet.address as `0x${string}`,
      to:
        (recipient as `0x${string}`) ||
        "0x0000000000000000000000000000000000000000",
      value: balance > BigInt(0) ? balance : BigInt(0),
    });
    try {
      const gasBuffer = (estimatedGas * BigInt(110)) / BigInt(100);
      const gasPrice = await publicClient.getGasPrice();
      const gasCost = gasBuffer * gasPrice;

      const maxAmount = balance > gasCost ? balance - gasCost : BigInt(0);
      setAmount(formatUnits(maxAmount, 18));
    } catch (error) {
      console.error("Error estimating gas:", error);
      const maxAmount =
        balance > estimatedGas ? balance - estimatedGas : BigInt(0);
      setAmount(formatUnits(maxAmount, 18));
    }
  }, [
    activeWallet?.address,
    balance,
    getPublicClientForActiveChain,
    recipient,
  ]);

  const validateInputs = useCallback(() => {
    if (!recipient) {
      Alert.alert("Error", "Please enter a recipient address");
      return false;
    }

    if (!amount || parseFloat(amount) <= 0) {
      Alert.alert("Error", "Please enter a valid amount");
      return false;
    }

    const amountInWei = parseUnits(amount, 18);
    if (amountInWei > balance) {
      Alert.alert(
        "Insufficient Balance",
        `You don't have enough ${activeChain.chain.nativeCurrency.symbol} to complete this transaction.`,
      );
      return false;
    }

    return true;
  }, [amount, balance, recipient, activeChain.chain.nativeCurrency.symbol]);

  const handleSend = useCallback(async () => {
    if (!validateInputs()) return;

    setIsLoading(true);
    setTransactionStatus("Preparing transaction...");

    await new Promise((resolve) => setTimeout(resolve, 100));

    try {
      setTransactionStatus("Initializing wallet...");
      const walletClient = getClientForActiveWallet();
      if (!walletClient) {
        console.log("No wallet client available");
        Alert.alert("Error", "Unable to initialize wallet client");
        setIsLoading(false);
        return;
      }

      if (!walletClient.account) {
        console.log("No account available in wallet client");
        Alert.alert("Error", "Wallet account not properly configured");
        setIsLoading(false);
        return;
      }

      console.log("Wallet client ready for", activeWallet.address);

      try {
        setTransactionStatus("Building transaction...");
        const value = parseUnits(amount, 18);

        console.log("Sending transaction...");

        setTransactionStatus(
          `Sending ${amount} ${activeChain.chain.nativeCurrency.symbol} to the network...`,
        );
        const hash = await walletClient.sendTransaction({
          account: walletClient.account,
          to: recipient as `0x${string}`,
          value,
          chain: walletClient.chain,
        });

        console.log("Transaction sent with hash:", hash);
        setTransactionStatus("Transaction complete!");

        await new Promise((resolve) => setTimeout(resolve, 500));

        Alert.alert(
          "Transaction Sent",
          `Transaction has been submitted.\nHash: ${hash}\nNetwork: ${activeChain.chain.name}`,
          [{ text: "OK", onPress: () => router.back() }],
        );
      } catch (txError: any) {
        console.error("Transaction execution error:", txError);
        Alert.alert(
          "Transaction Failed",
          txError?.message || "Failed to execute transaction",
        );
      }
    } catch (error: any) {
      console.error("Send transaction setup error:", error);
      Alert.alert(
        "Transaction Setup Failed",
        error?.message || "Failed to set up transaction",
      );
    } finally {
      setIsLoading(false);
    }
  }, [
    amount,
    recipient,
    activeWallet,
    activeChain,
    getClientForActiveWallet,
    validateInputs,
  ]);

  const handleSelectWallet = (index: number) => {
    setActiveWallet(index);
    setWalletModalVisible(false);
  };

  const handleSelectRecipient = (index: number) => {
    if (wallets[index]) {
      setRecipient(wallets[index].address);
      setRecipientModalVisible(false);
    }
  };

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
              Send
            </Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View className="bg-light rounded-xl p-5 mb-6 shadow-sm">
              <View className="mb-6">
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
                  <View className="flex-row items-center">
                    {isLoadingBalance ? (
                      <ActivityIndicator size="small" color="#c71c4b" />
                    ) : (
                      <Text className="text-light-matte-black mr-2">
                        {formatBalance(balance)}{" "}
                        {activeChain.chain.nativeCurrency.symbol}
                      </Text>
                    )}
                    <ChevronDown size={16} color="#c71c4b" />
                  </View>
                </Pressable>
              </View>

              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-light-matte-black font-medium">
                  Network
                </Text>
                <ChainSelector />
              </View>

              <View className="mb-6">
                <Text className="text-light-matte-black/70 mb-2">To</Text>
                <View className="flex-row items-center mb-2">
                  <TextInput
                    className="bg-light-main-container p-4 rounded-xl text-light-matte-black flex-1 mr-2"
                    value={recipient}
                    onChangeText={setRecipient}
                    placeholder="Enter wallet address"
                    placeholderTextColor="#20222c80"
                  />
                  <Pressable
                    className="bg-light-primary-red/10 p-3 rounded-xl"
                    onPress={handlePasteAddress}
                  >
                    <ClipboardCopy size={20} color="#c71c4b" />
                  </Pressable>
                </View>

                {wallets.length > 1 && (
                  <Pressable
                    className="bg-light-primary-red/10 py-2 px-4 rounded-full self-start"
                    onPress={() => setRecipientModalVisible(true)}
                  >
                    <Text className="text-light-primary-red text-xs font-medium">
                      My Wallets
                    </Text>
                  </Pressable>
                )}
              </View>

              <View className="mb-6">
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
                    {activeChain.chain.nativeCurrency.symbol}
                  </Text>
                </View>

                <View className="flex-row justify-end mt-2">
                  <Text className="text-light-matte-black/60 text-xs">
                    Balance:{" "}
                    {isLoadingBalance
                      ? "Loading..."
                      : `${formatBalance(balance)} ${activeChain.chain.nativeCurrency.symbol}`}
                  </Text>
                </View>
              </View>

              <View className="bg-light-primary-red/10 p-4 rounded-xl mb-6">
                <View className="flex-row items-start">
                  <Info size={18} color="#c71c4b" className="mr-2 mt-0.5" />
                  <Text className="text-light-matte-black/80 text-sm flex-1">
                    Double-check the recipient address before sending.
                    Transactions cannot be reversed.
                  </Text>
                </View>
              </View>
            </View>

            <Pressable
              className={`bg-light-primary-red py-4 rounded-full items-center ${isLoading ? "opacity-70" : ""}`}
              onPress={handleSend}
              disabled={isLoading}
            >
              {isLoading ? (
                <View className="flex-row items-center">
                  <Animated.View
                    style={{ transform: [{ rotate: spin }], marginRight: 8 }}
                  >
                    <Loader size={20} color="#ffffff" />
                  </Animated.View>
                  <Text className="text-light font-bold">Processing...</Text>
                </View>
              ) : (
                <View className="flex-row items-center">
                  <Send size={20} color="#ffffff" className="mr-2" />
                  <Text className="text-light font-bold text-lg">Send</Text>
                </View>
              )}
            </Pressable>
          </ScrollView>
        </View>
      </SafeAreaView>

      <LoadinngSpinnerPopup
        visible={isLoading}
        title="Processing Transaction"
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

      <WalletSelectorModal
        visible={recipientModalVisible}
        onClose={() => setRecipientModalVisible(false)}
        wallets={wallets}
        activeWalletIndex={-1}
        onSelectWallet={handleSelectRecipient}
        title="Select Recipient"
        disabledWalletIndex={activeWalletIndex}
        disabledLabel="Current wallet"
      />
    </>
  );
}
