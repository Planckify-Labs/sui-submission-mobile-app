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
import { exchangeRateApi } from "@/api/endpoints/exchange-rates";
import { CustomerInfoItem } from "@/api/types/booking";
import { TExchangeRate } from "@/api/types/exchange-rate";
import type { TToken } from "@/api/types/token";
import ChainSelector from "@/components/common/ChainSelector";
import LoadinngSpinnerPopup from "@/components/common/LoadinngSpinnerPopup";
import PinConfirmationModal from "@/components/common/PinConfirmationModal";
import SpendingApprovalModal from "@/components/common/SpendingApprovalModal";
import TokenSelectorModal from "@/components/wallet/TokenSelectorModal";
import WalletSelectorModal from "@/components/wallet/WalletSelectorModal";
import { useTakumiWalletContract } from "@/contracts/hooks/useTakumiWalletContract";
import type { TCreateTransactionParams } from "@/contracts/types/TTakumiWallet";
import { useIsAuthenticated } from "@/hooks/queries/useAuth";
import { useBlockchains } from "@/hooks/queries/useBlockchains";
import { useCreateBooking } from "@/hooks/queries/useBookings";
import { usePaymentProcessorContract } from "@/hooks/queries/usePaymentProcessorContract";
import { useProductVariantById } from "@/hooks/queries/useProducts";
import { useCreatePurchase } from "@/hooks/queries/usePurchases";
import { useTokens } from "@/hooks/queries/useTokens";
import { useWallet } from "@/hooks/useWallet";

export default function PaymentScreen() {
  const {
    wallets,
    activeWallet,
    activeWalletIndex,
    setActiveWallet,
    getPublicClientForActiveChain,
    getClientForActiveWallet,
    activeChain,
  } = useWallet();
  const [purchaseAmount, setPurchaseAmount] = useState("");

  const { data: blockchains } = useBlockchains();
  const activeBlockchain = useMemo(() => {
    if (!blockchains || !activeChain) return null;
    return blockchains.find((b) => b.chainId === activeChain.chain.id);
  }, [blockchains, activeChain]);

  const { contractAddress: takumiWalletAddress, error: contractError } =
    usePaymentProcessorContract(activeBlockchain?.id);

  const { createTransaction, waitForTransaction } = useTakumiWalletContract({
    contractAddress: takumiWalletAddress as `0x${string}`,
  });

  const [isLoading, setIsLoading] = useState(false);
  const [balance, setBalance] = useState<bigint>(BigInt(0));
  const [tokenBalance, setTokenBalance] = useState<string>("0");
  const [isLoadingTokenBalance, setIsLoadingTokenBalance] = useState(false);
  const [walletModalVisible, setWalletModalVisible] = useState(false);
  const [tokenModalVisible, setTokenModalVisible] = useState(false);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [selectedToken, setSelectedToken] = useState<TToken | null>(null);
  const [transactionStatus, setTransactionStatus] = useState("");
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [approvalModalVisible, setApprovalModalVisible] = useState(false);
  const [isApprovingSpending, setIsApprovingSpending] = useState(false);
  const [exchangeRate, setExchangeRate] = useState<TExchangeRate | null>(null);
  const [isLoadingRate, setIsLoadingRate] = useState(false);

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
  const { mutateAsync: createPurchase } = useCreatePurchase();

  const { data: tokens } = useTokens({
    blockchainId: activeBlockchain?.id,
    isStablecoin: true,
    isActive: true,
  });

  useEffect(() => {
    if (tokens && tokens.length > 0 && !selectedToken) {
      const timer = setTimeout(() => {
        setSelectedToken(tokens[0]);
      }, 100);
      return () => clearTimeout(timer);
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
    } finally {
      setIsLoadingRate(false);
    }
  }, [selectedToken]);

  useEffect(() => {
    if (selectedToken) {
      const timer = setTimeout(() => {
        fetchExchangeRate();
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [selectedToken, fetchExchangeRate]);

  const calculatedPurchaseAmount = useMemo(() => {
    if (
      !variantData?.ProductPrice?.[0]?.sellPrice ||
      !exchangeRate?.rate ||
      !selectedToken
    ) {
      return "";
    }

    const priceInIDR = parseInt(variantData.ProductPrice[0].sellPrice);
    const tokenAmount = priceInIDR / exchangeRate.rate;
    const tokenAmountInWei = Math.floor(
      tokenAmount * Math.pow(10, selectedToken.decimals),
    );

    return tokenAmountInWei.toString();
  }, [
    variantData?.ProductPrice?.[0]?.sellPrice,
    exchangeRate?.rate,
    selectedToken,
  ]);

  useEffect(() => {
    if (calculatedPurchaseAmount) {
      setPurchaseAmount(calculatedPurchaseAmount);
    }
  }, [calculatedPurchaseAmount]);

  const fetchBalance = useCallback(async () => {
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
    } finally {
      setIsLoadingBalance(false);
    }
  }, [activeWallet.address, getPublicClientForActiveChain]);

  useEffect(() => {
    if (activeWallet.address) {
      const timer = setTimeout(() => {
        fetchBalance();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [activeWallet.address, fetchBalance]);

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

      const formattedBalance = formatUnits(
        balance as bigint,
        selectedToken.decimals,
      );
      setTokenBalance(formattedBalance);
    } catch (error) {
      console.error("Error fetching token balance:", error);
      setTokenBalance("0");
    } finally {
      setIsLoadingTokenBalance(false);
    }
  }, [selectedToken, activeWallet.address, getPublicClientForActiveChain]);

  useEffect(() => {
    if (selectedToken && activeWallet.address) {
      const timer = setTimeout(() => {
        fetchTokenBalance();
      }, 400);
      return () => clearTimeout(timer);
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

  const formatBalance = useCallback((rawBalance: bigint) => {
    return parseFloat(formatUnits(rawBalance, 18)).toFixed(4);
  }, []);

  const approveSpending = useCallback(
    async (isUnlimited = false) => {
      if (
        !selectedToken ||
        !activeWallet.address ||
        !takumiWalletAddress ||
        !purchaseAmount
      ) {
        Alert.alert("Error", "Missing required data for approval");
        return;
      }

      setIsApprovingSpending(true);
      try {
        const publicClient = getPublicClientForActiveChain();
        if (!publicClient) throw new Error("No public client available");

        const walletClient = getClientForActiveWallet();
        if (!walletClient) throw new Error("No wallet client available");

        const approvalAmount = isUnlimited
          ? BigInt(
              "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
            )
          : BigInt(purchaseAmount);

        const hash = await walletClient.writeContract({
          address: selectedToken.contractAddress as `0x${string}`,
          abi: erc20Abi,
          functionName: "approve",
          args: [takumiWalletAddress as `0x${string}`, approvalAmount],
          chain: walletClient.chain,
          account: walletClient.account!,
        });

        await publicClient.waitForTransactionReceipt({ hash });

        setApprovalModalVisible(false);
        if (isUnlimited) {
          Alert.alert(
            "Unlimited Allowance Approved",
            `You've granted unlimited spending permission to ${selectedToken.symbol}. Future transactions won't require approval.`,
          );
        }

        setTimeout(() => {
          executePayment();
        }, 100);
      } catch (error) {
        console.error("Error approving spending:", error);
        Alert.alert(
          "Approval Failed",
          `Failed to approve token spending: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      } finally {
        setIsApprovingSpending(false);
      }
    },
    [
      selectedToken,
      activeWallet.address,
      takumiWalletAddress,
      purchaseAmount,
      getPublicClientForActiveChain,
      getClientForActiveWallet,
    ],
  );

  const executePayment = useCallback(
    async (pin?: string) => {
      if (
        !activeWallet.address ||
        !variantData?.id ||
        !variantData.ProductPrice?.[0]?.id ||
        !selectedToken ||
        !activeBlockchain ||
        !takumiWalletAddress
      ) {
        Alert.alert("Error", "Missing required data for payment");
        return;
      }

      setIsLoading(true);
      setTransactionStatus("Submitting your purchase...");

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

        setTransactionStatus("Creating blockchain transaction...");

        const refId = `${booking.id}-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;

        const transactionParams: TCreateTransactionParams = {
          bookingId: booking.id.toString(),
          exchangeRateId: BigInt(exchangeRate?.id ?? 0),
          productVariantId: variantId,
          tokenAddress: selectedToken.contractAddress as Address,
          refId,
          amount: booking.payment.token.amount,
          tokenDecimals: selectedToken.decimals,
        };
        setPurchaseAmount(booking.payment.token.amount);
        setTransactionStatus("Sending transaction to blockchain...");

        const txHash = await createTransaction.mutateAsync(transactionParams);
        console.log("Transaction hash:", txHash);

        setTransactionStatus("Creating purchase record...");

        try {
          const purchaseData = {
            refId,
            walletAddress: activeWallet.address,
            bookingId: booking.id.toString(),
            contractAddress: takumiWalletAddress,
            networkId: activeBlockchain.id.toString(),
            transactionHash: txHash,
          };

          const purchaseResponse = await createPurchase(purchaseData);
          console.log("Purchase created:", purchaseResponse);
        } catch (purchaseError) {
          console.error("Failed to create purchase:", purchaseError);
          Alert.alert(
            "Warning",
            "Purchase record creation failed, but transaction is proceeding. Please contact support if needed.",
          );
        }

        setTransactionStatus("Confirming transaction...");

        await waitForTransaction(txHash);

        setTransactionStatus("Finalizing purchase...");

        const txHashDisplay = txHash
          ? `${txHash.substring(0, 6)}...${txHash.substring(txHash.length - 4)}`
          : "";

        Alert.alert(
          "Payment Successful",
          `You have successfully purchased ${variantData.name} for ${purchaseAmount} ${selectedToken.symbol}.\n\nBooking ID: ${booking.id}\nTransaction: ${txHashDisplay}\nRef ID: ${refId}`,
          [{ text: "OK", onPress: () => router.back() }],
        );
      } catch (error) {
        console.error("Payment error:", error);
        Alert.alert(
          "Payment Failed",
          `An error occurred during the payment process: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      } finally {
        setIsLoading(false);
        setTransactionStatus("");
      }
    },
    [
      activeWallet.address,
      variantId,
      variantData,
      purchaseAmount,
      selectedToken,
      createBooking,
      createPurchase,
      activeBlockchain,
      parsedCustomerInfo,
      exchangeRate,
      takumiWalletAddress,
      createTransaction,
      waitForTransaction,
    ],
  );

  const { isAuthenticated } = useIsAuthenticated();

  const handlePaymentConfirmation = useCallback(async () => {
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

    if (
      selectedToken &&
      activeWallet.address &&
      takumiWalletAddress &&
      purchaseAmount
    ) {
      try {
        const publicClient = getPublicClientForActiveChain();
        if (publicClient) {
          const allowance = await publicClient.readContract({
            address: selectedToken.contractAddress as `0x${string}`,
            abi: erc20Abi,
            functionName: "allowance",
            args: [
              activeWallet.address as `0x${string}`,
              takumiWalletAddress as `0x${string}`,
            ],
          });

          const requiredAmount = BigInt(purchaseAmount);
          if ((allowance as bigint) < requiredAmount) {
            setApprovalModalVisible(true);
            return;
          }
        }
      } catch (error) {
        console.error("Error checking allowance:", error);
      }
    }

    setPinModalVisible(true);
  }, [
    isAuthenticated,
    selectedToken,
    activeWallet.address,
    takumiWalletAddress,
    purchaseAmount,
    getPublicClientForActiveChain,
  ]);

  const handlePinSubmit = useCallback(
    async (pin: string) => {
      try {
        setPinModalVisible(false);
        await executePayment(pin);
      } catch (error) {
        console.error("Payment failed:", error);
        Alert.alert("Payment Failed", "Please try again");
      }
    },
    [executePayment],
  );

  const buttonDisabled = useMemo(() => {
    return (
      isLoading ||
      isLoadingVariant ||
      !activeWallet.address ||
      !selectedToken ||
      !activeBlockchain ||
      !variantData?.id ||
      !variantData.ProductPrice?.[0]?.id ||
      !exchangeRate?.rate ||
      !takumiWalletAddress ||
      !!contractError
    );
  }, [
    isLoading,
    isLoadingVariant,
    activeWallet.address,
    selectedToken,
    activeBlockchain,
    variantData?.id,
    variantData?.ProductPrice,
    exchangeRate?.rate,
    takumiWalletAddress,
    contractError,
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
            {contractError && (
              <View className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-4">
                <Text className="text-red-800 font-medium text-sm mb-1">
                  Contract Error
                </Text>
                <Text className="text-red-600 text-sm">
                  Unable to load Payment Processor contract for this network.
                  Please try switching networks or contact support.
                </Text>
              </View>
            )}

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
                        {purchaseAmount && selectedToken
                          ? `${formatUnits(BigInt(purchaseAmount), selectedToken.decimals)} ${selectedToken.symbol}`
                          : "Calculating..."}
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
                        : `1 ${selectedToken?.symbol} ≈ Rp${exchangeRate?.rate ? exchangeRate.rate.toLocaleString() : "0"}`}
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
                        {purchaseAmount && selectedToken
                          ? `${formatUnits(BigInt(purchaseAmount), selectedToken.decimals)} ${selectedToken.symbol}`
                          : "Calculating..."}
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

                {selectedToken &&
                  purchaseAmount !== "" &&
                  parseFloat(purchaseAmount) > 0 && (
                    <View className="mt-2 bg-light-primary-red/10 p-3 rounded-lg">
                      <Text className="text-light-primary-red text-sm">
                        You need{" "}
                        {purchaseAmount && selectedToken
                          ? `${formatUnits(BigInt(purchaseAmount), selectedToken.decimals)} ${selectedToken.symbol}`
                          : "calculating amount..."}{" "}
                        for this transaction.
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
            onConfirm={handlePinSubmit}
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
        {selectedToken && tokens && (
          <TokenSelectorModal
            visible={tokenModalVisible}
            onClose={() => setTokenModalVisible(false)}
            tokens={tokens}
            selectedToken={selectedToken}
            onSelectToken={handleSelectToken}
            title="Select Payment Token"
          />
        )}

        {selectedToken && takumiWalletAddress && purchaseAmount && (
          <SpendingApprovalModal
            visible={approvalModalVisible}
            onClose={() => setApprovalModalVisible(false)}
            onApprove={approveSpending}
            onCancel={() => setApprovalModalVisible(false)}
            token={selectedToken}
            spenderAddress={takumiWalletAddress}
            amount={purchaseAmount}
            isLoading={isApprovingSpending}
            spenderName="Takumi Wallet"
            isInternalContract={true}
          />
        )}
      </SafeAreaView>
    </>
  );
}
