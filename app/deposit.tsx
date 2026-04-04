import { ChevronDown } from "lucide-react-native";
import React, { useCallback, useState } from "react";
import { useNavigationReady } from "@/hooks/useNavigationReady";
import {
  Platform,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import type { TToken } from "@/api/types/token";
import ChainSelector from "@/components/common/ChainSelector";
import LoadinngSpinnerPopup from "@/components/common/LoadinngSpinnerPopup";
import PinConfirmationModal from "@/components/common/PinConfirmationModal";
import {
  AmountInputSection,
  DepositButton,
  DepositHeader,
  QuickAmountButtons,
} from "@/components/deposit";
import TokenSelectorModal from "@/components/wallet/TokenSelectorModal";
import WalletSelectorModal from "@/components/wallet/WalletSelectorModal";
import { useDepositState } from "@/hooks/deposit/useDepositState";
import { useWallet } from "@/hooks/useWallet";

export default function DepositScreen() {
  const ready = useNavigationReady();

  const {
    wallets,
    activeWallet,
    activeWalletIndex,
    setActiveWallet,
    activeChain,
  } = useWallet();
  const {
    selectedToken,
    amount,
    isLoading,
    transactionStatus,
    error,
    stablecoinTokens,
    tokenAmountNeeded,
    isAuthenticated,
    hasContract,
    isContractFetching,
    nativeBalanceFormatted,
    tokenBalanceFormatted,
    hasInsufficientNative,
    hasInsufficientToken,
    isFetchingBalances,
    setSelectedToken,
    setAmount,
    setQuickAmount,
    handleDeposit,
  } = useDepositState();

  const [walletModalVisible, setWalletModalVisible] = useState(false);
  const [tokenModalVisible, setTokenModalVisible] = useState(false);
  const [pinModalVisible, setPinModalVisible] = useState(false);

  const handleSelectWallet = useCallback(
    (index: number) => {
      setActiveWallet(index);
      setWalletModalVisible(false);
    },
    [setActiveWallet],
  );

  const handleSelectToken = useCallback(
    (token: TToken) => {
      setSelectedToken(token);
      setTokenModalVisible(false);
    },
    [setSelectedToken],
  );

  const handleDepositPress = useCallback(() => {
    if (isAuthenticated === false) {
      handleDeposit(); // redirects to /auth
      return;
    }
    setPinModalVisible(true);
  }, [isAuthenticated, handleDeposit]);

  const handlePinSubmit = useCallback(
    async (_pin: string) => {
      setPinModalVisible(false);
      await handleDeposit();
    },
    [handleDeposit],
  );

  const { bottom } = useSafeAreaInsets();
  const bottomOffset = Platform.OS === "ios" ? 0 : bottom > 0 ? bottom : 0;

  if (!ready) {
    return (
      <>
        <StatusBar barStyle="dark-content" />
        <SafeAreaView
          className="flex-1 bg-light-main-container"
          edges={["top"]}
          style={{ paddingBottom: bottomOffset }}
        />
      </>
    );
  }

  return (
    <>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView
        className="flex-1 bg-light-main-container"
        edges={["top"]}
        style={{ paddingBottom: bottomOffset }}
      >
        <View className="flex-1 p-6 pb-0">
          <DepositHeader />

          <ScrollView showsVerticalScrollIndicator={false}>
            <View className="bg-light rounded-xl mb-6 shadow-xs">
              {/* Wallet Selector */}
              <View className="mb-6 p-5">
                <Text className="text-light-matte-black/70 mb-2">Add To</Text>
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
                  <ChevronDown size={20} color="#c71c4b" />
                </TouchableOpacity>
                <View className="flex-row items-center justify-end mt-2">
                  <ChainSelector />
                </View>
              </View>

              {/* No contract warning banner — hidden while fetching to avoid flash on chain switch */}
              {isAuthenticated && !isContractFetching && !hasContract && (
                <View className="mx-5 mb-4 bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <Text className="text-amber-700 text-sm font-medium">
                    Point deposits are not available on this network. Please
                    switch to a supported chain.
                  </Text>
                </View>
              )}

              {/* Token Selector */}
              <View className="mb-4 px-5">
                <Text className="text-light-matte-black/70 mb-2">Token</Text>
                <TouchableOpacity
                  activeOpacity={0.7}
                  className="bg-light-main-container p-4 rounded-xl flex-row items-center justify-between"
                  onPress={() => setTokenModalVisible(true)}
                >
                  <Text className="text-light-matte-black font-medium">
                    {selectedToken
                      ? `${selectedToken.symbol} - ${selectedToken.name}`
                      : "Select Token"}
                  </Text>
                  <ChevronDown size={20} color="#c71c4b" />
                </TouchableOpacity>
              </View>

              {/* Wallet Balance */}
              {selectedToken && (
                <View className="mb-4 px-5">
                  <Text className="text-light-matte-black/70 mb-2">
                    Your Balance
                  </Text>
                  <View className="bg-light-main-container rounded-xl p-4 gap-2">
                    <View className="flex-row items-center justify-between">
                      <Text className="text-light-matte-black/60 text-sm">
                        {activeChain.chain.nativeCurrency.symbol}
                      </Text>
                      <Text
                        className={`text-sm font-medium ${hasInsufficientNative ? "text-red-500" : "text-light-matte-black"}`}
                      >
                        {isFetchingBalances ? "..." : nativeBalanceFormatted}
                      </Text>
                    </View>
                    <View className="flex-row items-center justify-between">
                      <Text className="text-light-matte-black/60 text-sm">
                        {selectedToken.symbol}
                      </Text>
                      <Text
                        className={`text-sm font-medium ${hasInsufficientToken ? "text-red-500" : "text-light-matte-black"}`}
                      >
                        {isFetchingBalances ? "..." : tokenBalanceFormatted}
                      </Text>
                    </View>
                    {(hasInsufficientNative || hasInsufficientToken) && (
                      <Text className="text-red-500 text-xs mt-1">
                        {hasInsufficientNative
                          ? `Insufficient ${activeChain.chain.nativeCurrency.symbol} for gas fees.`
                          : `Insufficient ${selectedToken.symbol} balance.`}
                      </Text>
                    )}
                  </View>
                </View>
              )}

              <AmountInputSection
                amount={amount}
                tokenSymbol={selectedToken?.symbol ?? ""}
                tokenAmountNeeded={tokenAmountNeeded}
                onAmountChange={setAmount}
              />

              <QuickAmountButtons onSelect={setQuickAmount} />

              {error && (
                <Text className="text-red-500 text-sm px-5 mb-4">{error}</Text>
              )}

              <DepositButton
                isLoading={isLoading}
                onPress={handleDepositPress}
                disabled={
                  isAuthenticated !== false &&
                  (hasInsufficientNative || hasInsufficientToken)
                }
                label={
                  isAuthenticated === false
                    ? "Sign In to Add Points"
                    : "Add Points"
                }
              />
            </View>
          </ScrollView>
        </View>

        <LoadinngSpinnerPopup
          visible={isLoading}
          title="Adding Points"
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
          selectedToken={selectedToken}
          onSelectToken={handleSelectToken}
          tokens={stablecoinTokens}
          title="Select Token"
        />

        <PinConfirmationModal
          visible={pinModalVisible}
          onClose={() => setPinModalVisible(false)}
          onConfirm={handlePinSubmit}
          title="Confirm Deposit"
        />
      </SafeAreaView>
    </>
  );
}
