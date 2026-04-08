import { ChevronDown } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
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
import ChainSelector, {
  type ChainSelectorRef,
} from "@/components/common/ChainSelector";
import DepositUnsupportedChainModal from "@/components/common/DepositUnsupportedChainModal";
import LoadinngSpinnerPopup from "@/components/common/LoadinngSpinnerPopup";
import PinConfirmationModal from "@/components/common/PinConfirmationModal";
import SingleLoadingSekeleton from "@/components/common/SingleLoadingSekeleton";
import {
  AmountInputSection,
  DepositButton,
  DepositHeader,
  QuickAmountButtons,
} from "@/components/deposit";
import TokenSelectorModal from "@/components/wallet/TokenSelectorModal";
import WalletSelectorModal from "@/components/wallet/WalletSelectorModal";
import { useDepositState } from "@/hooks/deposit/useDepositState";
import { useNavigationReady } from "@/hooks/useNavigationReady";
import { useWallet } from "@/hooks/useWallet";

interface DepositContentProps {
  bottomOffset: number;
}

function DepositContent({ bottomOffset }: DepositContentProps) {
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

  const chainSelectorRef = useRef<ChainSelectorRef>(null);

  const [walletModalVisible, setWalletModalVisible] = useState(false);
  const [tokenModalVisible, setTokenModalVisible] = useState(false);
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [unsupportedChainModalVisible, setUnsupportedChainModalVisible] =
    useState(false);

  // Show the unsupported chain modal once when the user is authenticated
  // and the active chain has no contract, but only after fetching is done.
  useEffect(() => {
    if (isAuthenticated && !isContractFetching && !hasContract) {
      setUnsupportedChainModalVisible(true);
    } else {
      setUnsupportedChainModalVisible(false);
    }
  }, [isAuthenticated, isContractFetching, hasContract]);

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

  return (
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
                <ChainSelector ref={chainSelectorRef} />
              </View>
            </View>

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

      <DepositUnsupportedChainModal
        visible={unsupportedChainModalVisible}
        chainName={activeChain.chain.name}
        onClose={() => setUnsupportedChainModalVisible(false)}
        onSwitchNetwork={() => chainSelectorRef.current?.open()}
      />
    </SafeAreaView>
  );
}

export default function DepositScreen() {
  const ready = useNavigationReady();
  const { top, bottom } = useSafeAreaInsets();
  const bottomOffset = Platform.OS === "ios" ? 0 : bottom > 0 ? bottom : 0;

  return (
    <>
      <StatusBar barStyle="dark-content" />
      {ready ? (
        <DepositContent bottomOffset={bottomOffset} />
      ) : (
        <View
          className="flex-1 bg-light-main-container"
          style={{ paddingTop: top, paddingBottom: bottomOffset }}
        >
          <View className="flex-1 p-6 pb-0">
            {/* Header skeleton */}
            <View className="flex-row items-center justify-between mb-6">
              <View className="flex-row items-center gap-4">
                <SingleLoadingSekeleton
                  width={24}
                  height={24}
                  borderRadius={6}
                />
                <SingleLoadingSekeleton
                  width={110}
                  height={22}
                  borderRadius={6}
                />
              </View>
              <SingleLoadingSekeleton width={72} height={32} borderRadius={8} />
            </View>

            <View className="bg-light rounded-xl shadow-xs">
              {/* Wallet selector skeleton */}
              <View className="p-5 mb-2">
                <SingleLoadingSekeleton
                  width={50}
                  height={14}
                  borderRadius={4}
                  style={{ marginBottom: 8 }}
                />
                <SingleLoadingSekeleton
                  width="100%"
                  height={56}
                  borderRadius={12}
                />
                <View className="flex-row justify-end mt-2">
                  <SingleLoadingSekeleton
                    width={100}
                    height={28}
                    borderRadius={8}
                  />
                </View>
              </View>

              {/* Token selector skeleton */}
              <View className="px-5 mb-4">
                <SingleLoadingSekeleton
                  width={40}
                  height={14}
                  borderRadius={4}
                  style={{ marginBottom: 8 }}
                />
                <SingleLoadingSekeleton
                  width="100%"
                  height={56}
                  borderRadius={12}
                />
              </View>

              {/* Amount input skeleton */}
              <View className="px-5 mb-4">
                <SingleLoadingSekeleton
                  width={45}
                  height={14}
                  borderRadius={4}
                  style={{ marginBottom: 8 }}
                />
                <SingleLoadingSekeleton
                  width="100%"
                  height={56}
                  borderRadius={12}
                />
              </View>

              {/* Quick amount buttons skeleton */}
              <View className="px-5 mb-6">
                <View className="flex-row flex-wrap gap-2">
                  {[60, 72, 60, 76, 72].map((w, i) => (
                    <SingleLoadingSekeleton
                      key={i}
                      width={w}
                      height={36}
                      borderRadius={8}
                    />
                  ))}
                </View>
              </View>

              {/* Deposit button skeleton */}
              <SingleLoadingSekeleton
                width="auto"
                height={52}
                borderRadius={12}
                style={{ marginHorizontal: 20, marginBottom: 20 }}
              />
            </View>
          </View>
        </View>
      )}
    </>
  );
}
