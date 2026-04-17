import * as Clipboard from "expo-clipboard";
import { router, useLocalSearchParams } from "expo-router";
import {
  ArrowLeft,
  BookUser,
  ChevronDown,
  ClipboardCopy,
  Info,
  Loader,
  Send,
} from "lucide-react-native";

import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { erc20Abi, parseUnits } from "viem";
import type { TToken } from "@/api/types/token";
import ChainSelector from "@/components/common/ChainSelector";
import LoadinngSpinnerPopup from "@/components/common/LoadinngSpinnerPopup";
import OptimizedImage from "@/components/common/OptimizedImage";
import PinConfirmationModal from "@/components/common/PinConfirmationModal";
import RecipientPickerModal from "@/components/send/RecipientPickerModal";
import TokenSelectorModal from "@/components/wallet/TokenSelectorModal";
import WalletSelectorModal from "@/components/wallet/WalletSelectorModal";
import { useIsAuthenticated } from "@/hooks/queries/useAuth";
import { useBlockchains } from "@/hooks/queries/useBlockchains";
import { useTokens } from "@/hooks/queries/useTokens";
import { useCreateTransaction } from "@/hooks/queries/useTransactions";
import { useAddressBook } from "@/hooks/useAddressBook";
import { useNavigationReady } from "@/hooks/useNavigationReady";
import { useWallet } from "@/hooks/useWallet";

/**
 * Splits a `kit.formatNativeAmount` output into `[amount, symbol]`.
 *
 * `WalletKitAdapter.formatNativeAmount` returns `"<amount> <symbol>"`
 * (e.g. `"0.1234 ETH"` / `"0.1234 SOL"`) across every namespace — see
 * spec §7.6 / §7.7. Splitting here keeps the screen free of namespace
 * branches and makes the "amount only" and "symbol only" views
 * symbol-agnostic.
 */
function splitFormattedNative(formatted: string): {
  amount: string;
  symbol: string;
} {
  const trimmed = formatted.trim();
  const lastSpace = trimmed.lastIndexOf(" ");
  if (lastSpace === -1) {
    return { amount: trimmed, symbol: "" };
  }
  return {
    amount: trimmed.slice(0, lastSpace),
    symbol: trimmed.slice(lastSpace + 1),
  };
}

export default function SendScreen() {
  const ready = useNavigationReady();

  const {
    wallets,
    activeWallet,
    activeWalletIndex,
    setActiveWallet,
    activeChain,
    getClientForActiveWallet,
    getPublicClientForActiveChain,
    getActiveWalletKit,
  } = useWallet();

  // Resolve the active kit once (§7.7). All native-path reads, parses,
  // formats, validations, and transfers dispatch through this single
  // seam — no namespace branches inside the screen.
  const kit = getActiveWalletKit();

  // The kit assumes `activeChain.namespace === activeWallet.namespace`
  // (e.g. `SolanaWalletKit.formatNativeAmount` asserts a solana chain).
  // During a wallet/chain switch there's a render pass where the two
  // disagree before `useWallet`'s sync effect commits. Gate the screen
  // on this invariant — the render below short-circuits to a spinner
  // until the mismatch resolves.
  const kitMatchesChain = kit.namespace === activeChain.namespace;

  const { isAuthenticated } = useIsAuthenticated();
  const { mutateAsync: createTransaction } = useCreateTransaction();
  const { data: blockchains } = useBlockchains();
  const activeBackendChain = React.useMemo(() => {
    if (!blockchains) return null;
    // EVM rows match by numeric chainId. Solana rows are flagged via
    // `isEVM: false`; match on the cluster in the backend row's name
    // (falls back to the first Solana row if the names disagree).
    // Token list filtering depends on `blockchainId`, so surfacing the
    // right backend row here also scopes the token picker to the
    // active network — same UX as pre-Solana builds.
    if (activeChain.namespace === "eip155") {
      return (
        blockchains.find((b) => b.chainId === activeChain.chain.id) || null
      );
    }
    const wantsDevnet = activeChain.cluster === "devnet";
    const solanaRows = blockchains.filter((b) => b.isEVM === false);
    const match =
      solanaRows.find((b) =>
        wantsDevnet
          ? b.name.toLowerCase().includes("devnet")
          : !b.name.toLowerCase().includes("devnet"),
      ) ?? solanaRows[0];
    return match ?? null;
  }, [blockchains, activeChain]);
  const { data: rawTokenList } = useTokens({
    blockchainId: activeBackendChain?.id,
  });
  // `useTokens` skips the `blockchainId` filter when the field is
  // undefined (e.g. active chain isn't present in the backend feed),
  // which would surface EVERY token in the catalog. Narrow explicitly
  // to the active backend chain so the picker never shows tokens the
  // user can't actually transfer on this network.
  const tokenList = useMemo(() => {
    if (!activeBackendChain) return [];
    return (
      rawTokenList?.filter((t) => t.blockchainId === activeBackendChain.id) ??
      []
    );
  }, [rawTokenList, activeBackendChain]);

  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [balance, setBalance] = useState<bigint>(BigInt(0));
  const [walletModalVisible, setWalletModalVisible] = useState(false);
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
  const [recipientPickerVisible, setRecipientPickerVisible] = useState(false);

  const { contacts: addressBookContacts } = useAddressBook();

  const { recipientAddress } = useLocalSearchParams();

  // Presentation-only derived values — both come from the kit so EVM
  // and Solana display paths converge. Guard against the brief window
  // where kit and chain namespaces disagree (see `kitMatchesChain`
  // above) so the format call doesn't throw.
  const balanceDisplay = useMemo(
    () =>
      kitMatchesChain ? kit.formatNativeAmount(balance, activeChain) : "—",
    [kitMatchesChain, kit, balance, activeChain],
  );
  const { amount: balanceAmountText, symbol: nativeSymbol } = useMemo(
    () => splitFormattedNative(balanceDisplay),
    [balanceDisplay],
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
    // Skip the fetch while kit / chain namespaces are out of sync —
    // useWallet's sync effect will align them and a follow-up render
    // will retry.
    if (!kitMatchesChain) return;

    try {
      setIsLoadingBalance(true);
      const walletBalance = await kit.getNativeBalance(
        activeWallet.address,
        activeChain,
      );
      setBalance(walletBalance);
    } catch (error) {
      console.error("Error fetching balance:", error);
    } finally {
      setIsLoadingBalance(false);
    }
  }, [kit, kitMatchesChain, activeWallet?.address, activeChain]);

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
        // Native token balance mirrors the kit-formatted amount so the
        // display stays consistent with the balance pill.
        setTokenBalance(balanceAmountText);
        return;
      }

      try {
        setIsLoadingTokenBalance(true);
        // ERC-20 balance reads still go through the legacy viem public
        // client — SPL / non-EVM token transfers are deferred (spec N1 /
        // F6). `getPublicClientForActiveChain` returns `null` on
        // non-EVM chains, which keeps this path no-op for Solana.
        const publicClient = getPublicClientForActiveChain();
        if (!publicClient) {
          setTokenBalance("0");
          return;
        }
        const bal = await publicClient.readContract({
          address: selectedToken.contractAddress as `0x${string}`,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [activeWallet.address as `0x${string}`],
        });
        const decimals = selectedToken.decimals ?? 18;
        const raw = bal as bigint;
        const divisor = 10n ** BigInt(decimals);
        const whole = raw / divisor;
        const frac = raw % divisor;
        const fracStr = frac.toString().padStart(decimals, "0");
        setTokenBalance(
          `${whole.toString()}.${fracStr}`.replace(/\.?0+$/, "") || "0",
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
    balanceAmountText,
  ]);

  const handlePasteAddress = async () => {
    const text = await Clipboard.getStringAsync();
    if (text) setRecipient(text);
  };

  const handleMaxAmount = useCallback(async () => {
    if (!activeWallet?.address) return;
    if (!selectedToken?.isNativeCurrency) return;

    try {
      const max = await kit.estimateMaxTransferable({
        balance,
        chain: activeChain,
        from: activeWallet.address,
        to: recipient || undefined,
      });
      // Strip the symbol so only the numeric portion lands in the
      // amount input — matches the spec snippet in §7.7.
      const { amount: maxAmountText } = splitFormattedNative(
        kit.formatNativeAmount(max, activeChain),
      );
      setAmount(maxAmountText);
    } catch (error) {
      console.error("Error estimating max:", error);
    }
  }, [
    kit,
    activeWallet?.address,
    balance,
    activeChain,
    recipient,
    selectedToken?.isNativeCurrency,
  ]);

  const validateInputs = useCallback(() => {
    if (!recipient) {
      console.error("Error: Please enter a recipient address");
      return false;
    }

    if (!kit.validateAddress(recipient)) {
      console.error("Error: Invalid recipient address for the active chain");
      return false;
    }

    if (!amount || parseFloat(amount) <= 0) {
      console.error("Error: Please enter a valid amount");
      return false;
    }

    if (selectedToken?.isNativeCurrency !== false) {
      const raw = kit.parseNativeAmount(amount, activeChain);
      if (raw <= 0n || raw > balance) {
        console.error(
          "Insufficient Balance:",
          `You don't have enough ${nativeSymbol || "funds"} to complete this transaction.`,
        );
        return false;
      }
    }

    return true;
  }, [
    kit,
    amount,
    balance,
    recipient,
    activeChain,
    selectedToken?.isNativeCurrency,
    nativeSymbol,
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

      let hash: string;
      if (selectedToken && selectedToken.isNativeCurrency === false) {
        // ERC-20 transfer — legacy viem write path. Non-EVM token
        // transfers (SPL) are deferred (spec N1 / F6), so if the
        // selected token is non-native and the active chain is Solana
        // the viem client will be `null` and we bail early.
        const walletClient = getClientForActiveWallet();
        if (!walletClient || !walletClient.account) {
          console.error("Error: Unable to initialize wallet client");
          setIsLoading(false);
          return;
        }
        setTransactionStatus("Building transaction...");
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
        // Native transfer — single path for every namespace.
        setTransactionStatus("Building transaction...");
        const lamports = kit.parseNativeAmount(amount, activeChain);
        setTransactionStatus(
          `Sending ${amount} ${nativeSymbol} to the network...`,
        );
        hash = await kit.sendNativeTransfer({
          wallet: activeWallet,
          to: recipient,
          amount: lamports,
          chain: activeChain,
        });
      }

      console.log("Transaction sent with hash:", hash);
      setTransactionStatus("Transaction complete!");

      try {
        if (isAuthenticated && activeWallet?.address) {
          if (selectedToken && selectedToken.isNativeCurrency === false) {
            // ERC-20 history path stays EVM-shaped; this branch already
            // only runs when the selected token is ERC-20 (i.e. the
            // active chain is EVM).
            const rawAmount = parseUnits(
              amount,
              selectedToken.decimals,
            ).toString();
            await createTransaction({
              contractAddress: selectedToken.contractAddress,
              blockchainId: selectedToken.blockchainId,
              type: "TRANSFER",
              amount: rawAmount,
              txHash: hash as `0x${string}`,
              fromAddress: activeWallet.address,
              toAddress: recipient,
            } as any);
          } else if (activeChain.namespace === "eip155") {
            // Native-transfer history recording is gated to EVM — the
            // backend `createTransaction` API is EVM-shaped today.
            // Solana history recording is deferred; see spec §12 Q4 /
            // F1.
            const nativeTokenId =
              selectedToken?.id ??
              tokenList?.find((t) => t.isNativeCurrency)?.id;
            if (nativeTokenId) {
              const rawAmount = kit
                .parseNativeAmount(amount, activeChain)
                .toString();
              await createTransaction({
                tokenId: nativeTokenId,
                type: "TRANSFER",
                amount: rawAmount,
                txHash: hash as `0x${string}`,
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
        `Transaction has been submitted. Hash: ${hash}`,
      );
      router.back();
    } catch (error: any) {
      console.error("Send transaction error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectWallet = (index: number) => {
    setActiveWallet(index);
    setWalletModalVisible(false);
  };

  if (!ready) {
    return (
      <>
        <StatusBar barStyle="dark-content" />
        <SafeAreaView
          className="flex-1 bg-light-main-container"
          edges={["top"]}
        />
      </>
    );
  }

  // Transient-state guard: during a wallet ↔ chain switch there's a
  // render where `activeWallet.namespace !== activeChain.namespace`.
  // `useWallet` auto-aligns them in the next tick; render a spinner
  // here so kit methods (which assert the invariant) don't throw.
  if (!kitMatchesChain) {
    return (
      <>
        <StatusBar barStyle="dark-content" />
        <SafeAreaView
          className="flex-1 bg-light-main-container items-center justify-center"
          edges={["top"]}
        >
          <ActivityIndicator size="large" color="#c71c4b" />
          <Text className="text-light-matte-black/70 mt-3 text-sm">
            Switching network…
          </Text>
        </SafeAreaView>
      </>
    );
  }

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
                          {balanceDisplay}
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

                <TouchableOpacity
                  activeOpacity={0.7}
                  className="bg-light-primary-red/10 py-2 px-4 rounded-full flex-row items-center gap-1.5 self-start"
                  onPress={() => setRecipientPickerVisible(true)}
                >
                  <BookUser size={12} color="#c71c4b" />
                  <Text className="text-light-primary-red text-xs font-medium">
                    Choose recipient
                  </Text>
                </TouchableOpacity>
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
                          {(selectedToken?.symbol || nativeSymbol).charAt(0)}
                        </Text>
                      )}
                    </View>
                    <Text className="text-light-matte-black/70 font-medium">
                      {selectedToken?.symbol || nativeSymbol}
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

      <RecipientPickerModal
        visible={recipientPickerVisible}
        wallets={wallets}
        activeWalletIndex={activeWalletIndex}
        activeNamespace={activeChain.namespace}
        contacts={addressBookContacts}
        onClose={() => setRecipientPickerVisible(false)}
        onSelect={(address) => setRecipient(address)}
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
