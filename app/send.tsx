import * as Clipboard from "expo-clipboard";
import { router, useLocalSearchParams } from "expo-router";
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
  Animated,
  Easing,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { erc20Abi, formatUnits, parseUnits } from "viem";
import type { TToken } from "@/api/types/token";
import ChainSelector from "@/components/common/ChainSelector";
import LoadinngSpinnerPopup from "@/components/common/LoadinngSpinnerPopup";
import OptimizedImage from "@/components/common/OptimizedImage";
import PinConfirmationModal from "@/components/common/PinConfirmationModal";
import TokenSelectorModal from "@/components/wallet/TokenSelectorModal";
import WalletSelectorModal from "@/components/wallet/WalletSelectorModal";
import { useIsAuthenticated } from "@/hooks/queries/useAuth";
import { useBlockchains } from "@/hooks/queries/useBlockchains";
import { useTokens } from "@/hooks/queries/useTokens";
import { useCreateTransaction } from "@/hooks/queries/useTransactions";
import { useWallet } from "@/hooks/useWallet";

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

  const { isAuthenticated } = useIsAuthenticated();
  const { mutateAsync: createTransaction } = useCreateTransaction();
  const { data: blockchains } = useBlockchains();
  const activeBackendChain = React.useMemo(
    () => blockchains?.find((b) => b.chainId === activeChain.chain.id) || null,
    [blockchains, activeChain.chain.id],
  );
  const { data: tokenList } = useTokens({
    blockchainId: activeBackendChain?.id,
  });

  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [balance, setBalance] = useState<bigint>(BigInt(0));
  const [walletModalVisible, setWalletModalVisible] = useState(false);
  const [recipientModalVisible, setRecipientModalVisible] = useState(false);
  const [isPinModalVisible, setIsPinModalVisible] = useState(false);
  const [isLoadingBalance, setIsLoadingBalance] = useState(true);
  const [isLoadingTokenBalance, setIsLoadingTokenBalance] = useState(false);
  const [tokenBalance, setTokenBalance] = useState<string>("0");
  const [transactionStatus, setTransactionStatus] = useState(
    "Preparing transaction...",
  );
  const [selectedToken, setSelectedToken] = useState<TToken | undefined>(
    undefined,
  );
  const [tokenModalVisible, setTokenModalVisible] = useState(false);

  const { recipientAddress } = useLocalSearchParams();

  const nativeDecimals = activeChain.chain.nativeCurrency.decimals ?? 18;

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

    if (recipientAddress) {
      setRecipient(recipientAddress as string);
    }
    if (!selectedToken && tokenList && tokenList.length > 0) {
      setSelectedToken(tokenList[0]);
    }
  }, [fetchBalance, recipientAddress, tokenList, selectedToken]);

  useEffect(() => {
    const backendId = activeBackendChain?.id;
    if (!backendId) return;

    if (!selectedToken) {
      if (tokenList && tokenList.length > 0) {
        setSelectedToken(tokenList[0]);
      }
      return;
    }

    if (selectedToken.blockchainId !== backendId) {
      if (tokenList && tokenList.length > 0) {
        setSelectedToken(tokenList[0]);
      } else {
        setSelectedToken(undefined);
      }
    }
  }, [
    activeBackendChain?.id,
    selectedToken?.blockchainId,
    tokenList,
    selectedToken,
  ]);

  useEffect(() => {
    const fetchTokenBal = async () => {
      if (!activeWallet?.address || !selectedToken) {
        setTokenBalance("0");
        return;
      }

      if (selectedToken.isNativeCurrency !== false) {
        setTokenBalance(formatUnits(balance ?? BigInt(0), nativeDecimals));
        return;
      }

      try {
        setIsLoadingTokenBalance(true);
        const publicClient = getPublicClientForActiveChain();
        const bal = await publicClient.readContract({
          address: selectedToken.contractAddress as `0x${string}`,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [activeWallet.address as `0x${string}`],
        });
        setTokenBalance(
          formatUnits(bal as bigint, selectedToken.decimals ?? 18),
        );
      } catch (e) {
        console.error("Error fetching token balance:", e);
        setTokenBalance("0");
      } finally {
        setIsLoadingTokenBalance(false);
      }
    };

    fetchTokenBal();
  }, [
    activeWallet?.address,
    selectedToken,
    getPublicClientForActiveChain,
    balance,
    nativeDecimals,
  ]);

  const handlePasteAddress = async () => {
    const text = await Clipboard.getStringAsync();
    if (text) setRecipient(text);
  };

  const handleMaxAmount = useCallback(async () => {
    if (!activeWallet?.address) return;
    if (!selectedToken?.isNativeCurrency) return;

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
      setAmount(formatUnits(maxAmount, nativeDecimals));
    } catch (error) {
      console.error("Error estimating gas:", error);
      const maxAmount =
        balance > estimatedGas ? balance - estimatedGas : BigInt(0);
      setAmount(formatUnits(maxAmount, nativeDecimals));
    }
  }, [
    activeWallet?.address,
    balance,
    getPublicClientForActiveChain,
    recipient,
    selectedToken?.isNativeCurrency,
    nativeDecimals,
  ]);

  const validateInputs = useCallback(() => {
    if (!recipient) {
      console.error("Error: Please enter a recipient address");
      return false;
    }

    if (!amount || parseFloat(amount) <= 0) {
      console.error("Error: Please enter a valid amount");
      return false;
    }

    if (selectedToken?.isNativeCurrency !== false) {
      const amountInWei = parseUnits(amount, nativeDecimals);
      if (amountInWei > balance) {
        console.error(
          "Insufficient Balance:",
          `You don't have enough ${activeChain.chain.nativeCurrency.symbol} to complete this transaction.`,
        );
        return false;
      }
    }

    return true;
  }, [
    amount,
    balance,
    recipient,
    activeChain.chain.nativeCurrency.symbol,
    selectedToken?.isNativeCurrency,
    nativeDecimals,
  ]);

  const handleSend = useCallback(async () => {
    if (!validateInputs()) return;

    setIsPinModalVisible(true);
  }, [validateInputs]);

  const handlePinConfirm = async (pin: string) => {
    console.log("Transaction confirmed with PIN:", pin);

    setIsPinModalVisible(false);
    setIsLoading(true);
    setTransactionStatus("Preparing transaction...");

    await new Promise((resolve) => setTimeout(resolve, 100));

    try {
      setTransactionStatus("Initializing wallet...");
      const walletClient = getClientForActiveWallet();
      if (!walletClient) {
        console.log("No wallet client available");
        console.error("Error: Unable to initialize wallet client");
        setIsLoading(false);
        return;
      }

      if (!walletClient.account) {
        console.log("No account available in wallet client");
        console.error("Error: Wallet account not properly configured");
        setIsLoading(false);
        return;
      }

      console.log("Wallet client ready for", activeWallet.address);

      try {
        setTransactionStatus("Building transaction...");

        let hash: `0x${string}`;
        if (selectedToken && selectedToken.isNativeCurrency === false) {
          const tokenAmount = parseUnits(amount, selectedToken.decimals);
          setTransactionStatus(
            `Sending ${amount} ${selectedToken.symbol} to the network...`,
          );
          hash = await walletClient.writeContract({
            abi: erc20Abi,
            address: selectedToken.contractAddress as `0x${string}`,
            functionName: "transfer",
            args: [recipient as `0x${string}`, tokenAmount],
            account: walletClient.account,
            chain: walletClient.chain,
          });
        } else {
          const value = parseUnits(amount, nativeDecimals);
          console.log("Sending transaction...");

          setTransactionStatus(
            `Sending ${amount} ${activeChain.chain.nativeCurrency.symbol} to the network...`,
          );
          hash = await walletClient.sendTransaction({
            account: walletClient.account,
            to: recipient as `0x${string}`,
            value,
            chain: walletClient.chain,
          });
        }

        console.log("Transaction sent with hash:", hash);
        setTransactionStatus("Transaction complete!");

        try {
          if (isAuthenticated && activeWallet?.address) {
            if (selectedToken && selectedToken.isNativeCurrency === false) {
              // Convert to raw token units (e.g., wei for 18 decimals)
              const rawAmount = parseUnits(
                amount,
                selectedToken.decimals,
              ).toString();
              await createTransaction({
                contractAddress: selectedToken.contractAddress,
                blockchainId: activeBackendChain?.id as string,
                type: "TRANSFER",
                amount: rawAmount,
                txHash: hash,
                fromAddress: activeWallet.address,
                toAddress: recipient,
              } as any);
            } else {
              const nativeTokenId = tokenList?.[0]?.id;
              if (nativeTokenId) {
                // Convert to raw token units (e.g., wei for 18 decimals)
                const rawAmount = parseUnits(amount, nativeDecimals).toString();
                await createTransaction({
                  tokenId: nativeTokenId,
                  type: "TRANSFER",
                  amount: rawAmount,
                  txHash: hash,
                  fromAddress: activeWallet.address,
                  toAddress: recipient,
                });
              }
            }
          }
        } catch (historyErr) {
          console.warn("Failed to create transfer history:", historyErr);
        }

        await new Promise((resolve) => setTimeout(resolve, 500));

        console.log(
          "Transaction Sent:",
          `Transaction has been submitted. Hash: ${hash}, Network: ${activeChain.chain.name}`,
        );
        router.back();
      } catch (txError: any) {
        console.error("Transaction execution error:", txError);
        console.error(
          "Transaction Failed:",
          txError?.message || "Failed to execute transaction",
        );
      }
    } catch (error: any) {
      console.error("Send transaction setup error:", error);
      console.error(
        "Transaction Setup Failed:",
        error?.message || "Failed to set up transaction",
      );
    } finally {
      setIsLoading(false);
    }
  };

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
    return parseFloat(formatUnits(rawBalance, nativeDecimals)).toFixed(4);
  };

  return (
    <>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView className="flex-1 bg-light-main-container" edges={["top"]}>
        <View className="flex-1 p-6">
          <View className="flex-row items-center mb-6">
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => router.back()}
              className="mr-4"
            >
              <ArrowLeft color="#c71c4b" size={24} />
            </TouchableOpacity>
            <Text className="text-light-matte-black text-xl font-bold">
              Send
            </Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View className="bg-light rounded-xl p-5 mb-6 shadow-sm">
              <View className="mb-6">
                <Text className="text-light-matte-black/70 mb-2">From</Text>
                <TouchableOpacity
                  activeOpacity={0.7}
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
                  <View className="items-end">
                    {isLoadingBalance ? (
                      <ActivityIndicator size="small" color="#c71c4b" />
                    ) : (
                      <>
                        <Text className="text-light-matte-black">
                          {formatBalance(balance)}{" "}
                          {activeChain.chain.nativeCurrency.symbol}
                        </Text>
                        {selectedToken &&
                          selectedToken.isNativeCurrency === false && (
                            <Text className="text-light-matte-black/70 text-xs">
                              {isLoadingTokenBalance
                                ? "Loading token..."
                                : `${parseFloat(tokenBalance).toFixed(4)} ${selectedToken.symbol}`}
                            </Text>
                          )}
                      </>
                    )}
                    <ChevronDown size={16} color="#c71c4b" />
                  </View>
                </TouchableOpacity>
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
                  <TouchableOpacity
                    activeOpacity={0.7}
                    className="bg-light-primary-red/10 p-3 rounded-xl"
                    onPress={handlePasteAddress}
                  >
                    <ClipboardCopy size={20} color="#c71c4b" />
                  </TouchableOpacity>
                </View>

                {wallets.length > 1 && (
                  <TouchableOpacity
                    activeOpacity={0.7}
                    className="bg-light-primary-red/10 py-2 px-4 rounded-full self-start"
                    onPress={() => setRecipientModalVisible(true)}
                  >
                    <Text className="text-light-primary-red text-xs font-medium">
                      My Wallets
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              <View className="mb-6">
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-light-matte-black/70">Amount</Text>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={handleMaxAmount}
                  >
                    <Text className="text-light-primary-red text-xs font-medium">
                      MAX
                    </Text>
                  </TouchableOpacity>
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
                  <TouchableOpacity
                    activeOpacity={0.7}
                    className="absolute right-2 px-2 py-1 rounded-lg bg-light-primary-red/10 flex-row items-center"
                    onPress={() => setTokenModalVisible(true)}
                  >
                    <View className="w-5 h-5 rounded-full mr-2 items-center justify-center overflow-hidden bg-light-primary-red/10">
                      {selectedToken?.logoUrl ? (
                        <OptimizedImage
                          source={{ uri: selectedToken.logoUrl }}
                          style={{ width: 20, height: 20 }}
                          contentFit="contain"
                        />
                      ) : (
                        <Text className="text-light-primary-red text-[10px] font-bold">
                          {(
                            selectedToken?.symbol ||
                            activeChain.chain.nativeCurrency.symbol
                          ).charAt(0)}
                        </Text>
                      )}
                    </View>
                    <Text className="text-light-matte-black/70 font-medium">
                      {selectedToken?.symbol ||
                        activeChain.chain.nativeCurrency.symbol}
                    </Text>
                  </TouchableOpacity>
                </View>

                {selectedToken && selectedToken.isNativeCurrency === false && (
                  <View className="flex-row justify-end mt-1">
                    <Text className="text-light-matte-black/60 text-xs">
                      Balance:{" "}
                      {isLoadingTokenBalance
                        ? "Loading..."
                        : `${parseFloat(tokenBalance).toFixed(4)} ${selectedToken.symbol}`}
                    </Text>
                  </View>
                )}
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

            <TouchableOpacity
              activeOpacity={0.7}
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
            </TouchableOpacity>
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

      <PinConfirmationModal
        visible={isPinModalVisible}
        onClose={() => setIsPinModalVisible(false)}
        onConfirm={handlePinConfirm}
        title="Confirm Transaction"
      />

      {tokenList && (
        <TokenSelectorModal
          visible={tokenModalVisible}
          tokens={tokenList}
          onClose={() => setTokenModalVisible(false)}
          selectedToken={selectedToken}
          onSelectToken={(t) => setSelectedToken(t)}
          title="Select Token"
        />
      )}
    </>
  );
}
