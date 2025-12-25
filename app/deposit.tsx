import { ChevronDown } from "lucide-react-native";
import React, { useCallback, useState } from "react";
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
import { TToken } from "@/api/types/token";
import ChainSelector from "@/components/common/ChainSelector";
import LoadinngSpinnerPopup from "@/components/common/LoadinngSpinnerPopup";
import {
  AmountInputSection,
  DepositButton,
  DepositHeader,
  DepositInfoCard,
  ExchangeRateCard,
  QuickAmountButtons,
} from "@/components/deposit";
import TokenSelectorModal from "@/components/wallet/TokenSelectorModal";
import WalletSelectorModal from "@/components/wallet/WalletSelectorModal";
import { useDepositState } from "@/hooks/deposit/useDepositState";
import { useWallet } from "@/hooks/useWallet";

export default function DepositScreen() {
  const { wallets, activeWallet, activeWalletIndex, setActiveWallet } = useWallet();
  const {
    selectedToken,
    amount,
    fiatAmount,
    isLoading,
    transactionStatus,
    exchangeRate,
    stablecoinTokens,
    activeChain,
    setSelectedToken,
    setAmount,
    setFiatAmount,
    setQuickAmount,
    handleDeposit,
  } = useDepositState();

  const [walletModalVisible, setWalletModalVisible] = useState(false);
  const [tokenModalVisible, setTokenModalVisible] = useState(false);

  const handleSelectWallet = useCallback(
    (index: number) => {
      setActiveWallet(index);
      setWalletModalVisible(false);
    },
    [setActiveWallet]
  );

  const handleSelectToken = useCallback(
    (token: TToken) => {
      setSelectedToken(token);
      setTokenModalVisible(false);
    },
    [setSelectedToken]
  );

  const { bottom } = useSafeAreaInsets();
  const bottomOffset = Platform.OS === "ios" ? 0 : bottom > 0 ? bottom : 0;

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
                <Text className="text-light-matte-black/70 mb-2">Deposit To</Text>
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
                      {activeWallet?.address?.substring(activeWallet.address.length - 4)}
                    </Text>
                  </View>
                  <ChevronDown size={20} color="#c71c4b" />
                </TouchableOpacity>
                <View className="flex-row items-center justify-end mt-2">
                  <ChainSelector />
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

              {selectedToken && (
                <ExchangeRateCard
                  selectedToken={selectedToken}
                  exchangeRate={exchangeRate}
                />
              )}

              <AmountInputSection
                amount={amount}
                fiatAmount={fiatAmount}
                tokenSymbol={selectedToken?.symbol || ""}
                onAmountChange={setAmount}
                onFiatAmountChange={setFiatAmount}
              />

              <QuickAmountButtons onSelect={setQuickAmount} />

              <DepositButton isLoading={isLoading} onPress={handleDeposit} />
            </View>

            <DepositInfoCard
              tokenSymbol={selectedToken?.symbol || ""}
              chainName={activeChain.chain.name}
            />
          </ScrollView>
        </View>

        <LoadinngSpinnerPopup
          visible={isLoading}
          title="Processing Deposit"
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
      </SafeAreaView>
    </>
  );
}
