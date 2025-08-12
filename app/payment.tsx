import { exchangeRateApi } from "@/api/endpoints/exchange-rates";
import { CustomerInfoItem } from "@/api/types/booking";
import { TExchangeRate } from "@/api/types/exchange-rate";
import type { TToken } from "@/api/types/token";
import ChainSelector from "@/components/common/ChainSelector";
import LoadinngSpinnerPopup from "@/components/common/LoadinngSpinnerPopup";
import PinConfirmationModal from "@/components/common/PinConfirmationModal";
import TokenSelectorModal from "@/components/wallet/TokenSelectorModal";
import WalletSelectorModal from "@/components/wallet/WalletSelectorModal";
import { useTakumiPayContract } from "@/contracts/hooks/useTakumiPayContract";
import { useIsAuthenticated } from "@/hooks/queries/useAuth";
import { useBlockchains } from "@/hooks/queries/useBlockchains";
import { useCreateBooking } from "@/hooks/queries/useBookings";
import { useProductVariantById } from "@/hooks/queries/useProducts";
import { useTokens } from "@/hooks/queries/useTokens";
import { useWallet } from "@/hooks/useWallet";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowLeft, ChevronDown } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Address, erc20Abi, formatUnits } from "viem";

export default function PaymentScreen() {
  const {
    wallets,
    activeWallet,
    activeWalletIndex,
    setActiveWallet,
    getPublicClientForActiveChain,
    activeChain,
  } = useWallet();
  const { purchase, createPurchaseInput } = useTakumiPayContract();

  const { data: blockchains } = useBlockchains();
  const activeBlockchain = useMemo(() => {
    if (!blockchains || !activeChain) return null;
    return blockchains.find((b) => b.chainId === activeChain.chain.id);
  }, [blockchains, activeChain]);

  const [isLoading, setIsLoading] = useState(false);
  const [balance, setBalance] = useState<bigint>(BigInt(0));
  const [tokenBalance, setTokenBalance] = useState<string>("0");
  const [isLoadingTokenBalance, setIsLoadingTokenBalance] = useState(false);
  const [walletModalVisible, setWalletModalVisible] = useState(false);
  const [tokenModalVisible, setTokenModalVisible] = useState(false);
  const [isLoadingBalance, setIsLoadingBalance] = useState(true);
  const [selectedToken, setSelectedToken] = useState<TToken | null>(null);
  const [transactionStatus, setTransactionStatus] = useState("");
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [exchangeRate, setExchangeRate] = useState<TExchangeRate | null>(null);
  const [isLoadingRate, setIsLoadingRate] = useState(true);

  const { variantId, customerInfo } = useLocalSearchParams<{
    variantId: string;
    customerInfo: string;
  }>();

  const parsedCustomerInfo = useMemo<CustomerInfoItem[]>(() => {
    if (!customerInfo) return [];
    try {
      return JSON.parse(customerInfo);
    } catch (error) {
      console.error("Error parsing customer info:", error);
      return [];
    }
  }, [customerInfo]);

  const { data: variantData, isLoading: isLoadingVariant } =
    useProductVariantById(variantId);

  const { mutateAsync: createBooking } = useCreateBooking();

  const { data: tokens, isLoading: isLoadingTokens } = useTokens({
    blockchainId: activeBlockchain?.id,
    isStablecoin: true,
    isActive: true,
  });

  useEffect(() => {
    if (tokens && tokens.length > 0 && !selectedToken) {
      console.log("Setting default token:", tokens[0].symbol);
      setSelectedToken(tokens[0]);
    }
  }, [tokens, selectedToken]);

  const fetchExchangeRate = useCallback(async () => {
    if (!selectedToken) return;

    setIsLoadingRate(true);
    try {
      const response = await exchangeRateApi.getLatestExchangeRate({
        fromCurrency: selectedToken.symbol,
        toCurrency: "IDR",
      });
      setExchangeRate(response);
    } catch (error) {
      console.error("Error fetching exchange rate:", error);
      Alert.alert("Error", "Failed to fetch exchange rate");
    } finally {
      setIsLoadingRate(false);
    }
  }, [selectedToken]);

  useEffect(() => {
    if (selectedToken) {
      fetchExchangeRate();
    }
  }, [selectedToken, fetchExchangeRate]);

  const tokenAmountNeeded =
    variantData?.ProductPrice?.[0]?.sellPrice && exchangeRate
      ? (
          parseFloat(variantData.ProductPrice[0].sellPrice) / exchangeRate.rate
        ).toFixed(4)
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

  useEffect(() => {
    if (
      selectedToken &&
      activeBlockchain &&
      selectedToken.blockchainId !== activeBlockchain.id
    ) {
      console.log("Network changed, resetting selected token");
      setSelectedToken(null);

      if (tokens && tokens.length > 0) {
        console.log("Auto-selecting token for new network:", tokens[0].symbol);
        setSelectedToken(tokens[0]);
      }
    }
  }, [activeBlockchain, selectedToken, tokens]);

  const fetchTokenBalance = useCallback(async () => {
    if (!selectedToken || !activeWallet.address) return;

    setIsLoadingTokenBalance(true);
    try {
      const publicClient = getPublicClientForActiveChain();
      if (!publicClient) return;

      const balance = await publicClient.readContract({
        address: selectedToken.contractAddress as `0x${string}`,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [activeWallet.address as `0x${string}`],
      });

      setTokenBalance(formatUnits(balance as bigint, selectedToken.decimals));
    } catch (error) {
      console.error("Error fetching token balance:", error);
      Alert.alert("Error", "Failed to fetch token balance");
    } finally {
      setIsLoadingTokenBalance(false);
    }
  }, [selectedToken, activeWallet.address, getPublicClientForActiveChain]);

  useEffect(() => {
    if (selectedToken && activeWallet.address) {
      fetchTokenBalance();
    } else {
      setTokenBalance("0");
    }
  }, [selectedToken, activeWallet.address, fetchTokenBalance]);

  const handleSelectWallet = (index: number) => {
    setActiveWallet(index);
    setWalletModalVisible(false);
  };

  const handleSelectToken = (token: TToken) => {
    setSelectedToken(token);
    setTokenModalVisible(false);
  };

  const formatBalance = (rawBalance: bigint) => {
    return parseFloat(formatUnits(rawBalance, 18)).toFixed(4);
  };

  const handlePayment = useCallback(async () => {
    if (
      !activeWallet.address ||
      !variantData?.id ||
      !variantData.ProductPrice?.[0]?.id ||
      !selectedToken ||
      !activeBlockchain
    ) {
      Alert.alert("Error", "Missing required data for payment");
      return;
    }

    setIsLoading(true);
    setTransactionStatus("Submittingg your purchase...");

    try {
      const booking = await createBooking({
        walletAddress: activeWallet.address,
        productVariantId: variantId,
        productPriceId: variantData.ProductPrice[0].id,
        payment: {
          tokenAddress: selectedToken.contractAddress,
          blockchainId: activeBlockchain.id,
          exchangeRateId: exchangeRate?.id ?? 0,
        },
        customerInfo: parsedCustomerInfo,
      });

      setTransactionStatus("Processing payment request...");

      const purchaseInput = createPurchaseInput({
        bookingId: booking.id.toString(),
        tokenAddress: selectedToken.contractAddress as Address,
        amount: tokenAmountNeeded,
        decimals: selectedToken.decimals,
      });

      setTransactionStatus("Sending transaction...");
      const result = await purchase(purchaseInput);

      if (!result.success) {
        throw new Error("Transaction failed");
      }

      setTransactionStatus("Confirming transaction...");
      setTransactionStatus("Finalizing purchase...");

      const txHash = result.txHash;
      const txHashDisplay = txHash
        ? `${txHash.substring(0, 6)}...${txHash.substring(txHash.length - 4)}`
        : "";

      Alert.alert(
        "Payment Successful",
        `You have successfully purchased ${variantData.name} for ${tokenAmountNeeded} ${selectedToken.symbol}.\n\nBooking ID: ${booking.id}\nTransaction: ${txHashDisplay}`,
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
      setTransactionStatus("");
    }
  }, [
    activeWallet.address,
    variantId,
    variantData,
    tokenAmountNeeded,
    selectedToken,
    createBooking,
    activeBlockchain,
    parsedCustomerInfo,
    exchangeRate,
    purchase,
    createPurchaseInput,
  ]);

  const { isAuthenticated } = useIsAuthenticated();

  const handlePaymentConfirmation = () => {
    if (!isAuthenticated) {
      Alert.alert(
        "Authentication Required",
        "Please sign in with your wallet before proceeding with checkout.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Sign In", onPress: () => router.push("/auth") },
        ],
      );
      return;
    }
    setPinModalVisible(true);
  };

  const handlePaymentWithPin = async () => {
    setPinModalVisible(false);
    await handlePayment();
  };

  const buttonDisabled = useMemo(() => {
    const conditions = {
      isLoading: isLoading,
      isLoadingVariant: isLoadingVariant,
      isLoadingRate: isLoadingRate,
      isLoadingTokens: isLoadingTokens,
      noActiveWallet: !activeWallet.address,
      noSelectedToken: !selectedToken,
      noActiveBlockchain: !activeBlockchain,
      noVariantData: !variantData?.id || !variantData.ProductPrice?.[0]?.id,
      noExchangeRate: !exchangeRate?.rate,
      noTokensAvailable: tokens?.length === 0,
    };

    console.log("Button disable conditions:", conditions);

    return (
      conditions.isLoading ||
      conditions.isLoadingVariant ||
      conditions.isLoadingRate ||
      conditions.isLoadingTokens ||
      conditions.noActiveWallet ||
      conditions.noSelectedToken ||
      conditions.noActiveBlockchain ||
      conditions.noVariantData ||
      conditions.noExchangeRate ||
      conditions.noTokensAvailable
    );
  }, [
    isLoading,
    isLoadingVariant,
    isLoadingRate,
    isLoadingTokens,
    activeWallet.address,
    selectedToken,
    activeBlockchain,
    variantData,
    exchangeRate,
    tokens,
  ]);

  return (
    <>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView className="flex-1 bg-light-main-container" edges={["top"]}>
        <View className="flex-1 px-5 pt-2">
          <View className="flex-row items-center mb-6">
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => router.back()}
              className="mr-4"
            >
              <ArrowLeft color="#c71c4b" size={24} />
            </TouchableOpacity>
            <Text className="text-light-matte-black text-xl font-bold">
              Confirm Purchase
            </Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View className="bg-white rounded-2xl p-4 mb-4 shadow-sm">
              <Text className="text-light-matte-black font-bold text-lg mb-3">
                Purchase Details
              </Text>

              <View className="bg-light-main-container/50 rounded-xl p-3 mb-4">
                <View className="flex-row items-center mb-2">
                  <View className="w-12 h-12 bg-light-primary-red/10 rounded-lg mr-3 items-center justify-center overflow-hidden">
                    {variantData?.product?.imageUrl ? (
                      <Image
                        source={{ uri: variantData.product.imageUrl }}
                        className="w-full h-full"
                        resizeMode="cover"
                      />
                    ) : (
                      <Text className="text-2xl">📦</Text>
                    )}
                  </View>
                  <View className="flex-1">
                    <Text
                      className="text-light-matte-black font-bold text-base"
                      numberOfLines={1}
                    >
                      {variantData?.name || "Loading..."}
                    </Text>
                    <Text
                      className="text-light-matte-black/60 text-sm"
                      numberOfLines={2}
                    >
                      {variantData?.description || "Loading..."}
                    </Text>
                  </View>
                </View>

                <View className="bg-white rounded-lg p-3 shadow-sm">
                  <View className="flex-row items-center justify-between mb-1">
                    <Text className="text-light-matte-black/70 text-sm">
                      Price
                    </Text>
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
                          {selectedToken?.symbol?.charAt(0) || "?"}
                        </Text>
                      </View>
                      <Text className="text-light-matte-black text-sm font-medium">
                        {tokenAmountNeeded} {selectedToken?.symbol}
                      </Text>
                    </View>
                  </View>

                  <View className="flex-row justify-between items-center">
                    <Text className="text-light-matte-black/60 text-sm">
                      Rate
                    </Text>
                    <Text className="text-light-matte-black text-sm">
                      {isLoadingRate
                        ? "Loading..."
                        : `1 ${selectedToken?.symbol} ≈ Rp${exchangeRate?.toLocaleString() || "0"}`}
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
                          {selectedToken?.symbol?.charAt(0) || "?"}
                        </Text>
                      </View>
                      <Text className="text-light-primary-red font-bold text-base">
                        {tokenAmountNeeded} {selectedToken?.symbol}
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
                <TouchableOpacity
                  activeOpacity={0.7}
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
                </TouchableOpacity>

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
                <TouchableOpacity
                  activeOpacity={0.7}
                  className="bg-light-main-container p-4 rounded-xl flex-row items-center justify-between border border-light-main-container/20"
                  onPress={() => setTokenModalVisible(true)}
                >
                  <View className="flex-row items-center">
                    <View className="bg-light-primary-red/10 p-2 rounded-full mr-3">
                      <Text className="text-light-primary-red font-bold text-xs">
                        {selectedToken?.symbol?.charAt(0) || "?"}
                      </Text>
                    </View>
                    <View>
                      <Text className="text-light-matte-black font-medium">
                        {selectedToken
                          ? `${selectedToken.symbol} - ${selectedToken.name}`
                          : "Select a token"}
                      </Text>
                      <Text className="text-light-matte-black/60 text-xs">
                        {isLoadingTokenBalance
                          ? "Loading balance..."
                          : selectedToken
                            ? `Balance: ${parseFloat(tokenBalance).toFixed(4)} ${selectedToken.symbol}`
                            : "Select a token"}
                      </Text>
                    </View>
                  </View>
                  <ChevronDown size={20} color="#c71c4b" />
                </TouchableOpacity>

                {selectedToken && parseFloat(tokenAmountNeeded) > 0 && (
                  <View className="mt-2 bg-light-primary-red/10 p-3 rounded-lg">
                    <Text className="text-light-primary-red text-sm">
                      You need {tokenAmountNeeded} {selectedToken.symbol} for
                      this transaction.
                    </Text>
                  </View>
                )}
              </View>
            </View>
            <TouchableOpacity
              activeOpacity={0.7}
              className="p-4 rounded-full shadow-md bg-light-primary-red mb-4"
              onPress={handlePaymentConfirmation}
              disabled={buttonDisabled}
            >
              <Text className="font-bold text-center text-lg text-white">
                Checkout
              </Text>
            </TouchableOpacity>
          </ScrollView>

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
        {selectedToken && (
          <TokenSelectorModal
            visible={tokenModalVisible}
            onClose={() => setTokenModalVisible(false)}
            selectedToken={selectedToken}
            onSelectToken={handleSelectToken}
            title="Select Payment Token"
            stablecoinsOnly={true}
            blockchainId={activeBlockchain?.id}
          />
        )}
      </SafeAreaView>
    </>
  );
}
