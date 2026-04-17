import { Check, Search, Wallet, X } from "lucide-react-native";
import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TWallet } from "@/constants/types/walletTypes";
import { walletKitRegistry } from "@/services/walletKit/registry";
import { truncateAddress } from "@/utils/walletUtils";

// Human-readable namespace label shown as a chip next to each wallet.
// Prefers the registered kit's `displayName` so adding a new chain
// family (Sui, Bitcoin, …) needs zero edits here — the label is
// whatever that kit advertises. Falls back to a capitalised namespace
// literal when a namespace has no registered kit (shouldn't happen in
// practice but keeps the UI from rendering `eip155`).
function namespaceLabel(ns: TWallet["namespace"]): string {
  try {
    const kit = walletKitRegistry.get(ns);
    if (kit.displayName) return kit.displayName;
  } catch {
    // Kit not registered — fall through to the capitalised literal.
  }
  if (ns === "eip155") return "Ethereum";
  return ns.charAt(0).toUpperCase() + ns.slice(1);
}

const { height } = Dimensions.get("window");
const MODAL_HEIGHT = height * 0.67;

type WalletSelectorModalProps = {
  visible: boolean;
  onClose: () => void;
  wallets: TWallet[];
  activeWalletIndex: number;
  onSelectWallet: (index: number) => void;
  title?: string;
  disabledWalletIndex?: number;
  disabledLabel?: string;
  dappUrl?: string;
  isDappConnection?: boolean;
  onSelectWalletForDapp?: (wallet: TWallet, index: number) => void;
  onDeclineConnection?: () => void;
};

const WalletSelectorModal = memo(function WalletSelectorModal({
  visible,
  onClose,
  wallets,
  activeWalletIndex,
  onSelectWallet,
  title = "Select Wallet",
  disabledWalletIndex,
  disabledLabel = "Current wallet",
  dappUrl,
  isDappConnection = false,
  onSelectWalletForDapp,
  onDeclineConnection,
}: WalletSelectorModalProps) {
  const { bottom } = useSafeAreaInsets();
  const bottomOffset = Platform.OS === "ios" ? 16 : bottom > 0 ? bottom : 0;

  const [searchQuery, setSearchQuery] = useState("");

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(MODAL_HEIGHT)).current;

  const filteredWallets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return wallets;
    return wallets.filter((w) => {
      if ((w.name ?? "").toLowerCase().includes(q)) return true;
      if (w.address.toLowerCase().includes(q)) return true;
      if ((w.type ?? "").toLowerCase().includes(q)) return true;
      if (namespaceLabel(w.namespace).toLowerCase().includes(q)) return true;
      return false;
    });
  }, [wallets, searchQuery]);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, fadeAnim, translateY]);

  const closeModal = useCallback(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: MODAL_HEIGHT,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setSearchQuery("");
      if (isDappConnection && onDeclineConnection) {
        onDeclineConnection();
      }
      onClose();
    });
  }, [fadeAnim, translateY, onClose, isDappConnection, onDeclineConnection]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState: { dy: number }) => {
        return gestureState.dy > 0;
      },
      onPanResponderMove: (_, gestureState: { dy: number }) => {
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState: { dy: number; vy: number }) => {
        if (gestureState.dy > 50 || gestureState.vy > 0.5) {
          Animated.timing(translateY, {
            toValue: MODAL_HEIGHT,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            if (isDappConnection && onDeclineConnection) {
              onDeclineConnection();
            }
            closeModal();
          });
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 5,
          }).start();
        }
      },
    }),
  ).current;

  const getDomainFromUrl = useCallback((url: string) => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }, []);

  const handleWalletSelection = useCallback(
    (wallet: TWallet, index: number) => {
      if (isDappConnection && onSelectWalletForDapp) {
        onSelectWalletForDapp(wallet, index);
      } else {
        onSelectWallet(index);
      }
    },
    [isDappConnection, onSelectWalletForDapp, onSelectWallet],
  );

  const renderWalletItem = useCallback(
    (wallet: TWallet) => {
      const index = wallets.findIndex((w) => w.address === wallet.address);
      const isActive = index === activeWalletIndex;
      const isDisabled = index === disabledWalletIndex;

      return (
        <Pressable
          key={wallet.address}
          className={`flex-row items-center p-4 mb-2 rounded-2xl ${
            isActive ? "bg-light-primary-red/10" : "bg-light"
          }`}
          onPress={() => handleWalletSelection(wallet, index)}
          disabled={isDisabled}
        >
          <View className="flex-1">
            <View className="flex-row items-center">
              <Text
                className={`font-bold ${
                  isDisabled
                    ? "text-light-matte-black/40"
                    : "text-light-matte-black"
                }`}
                numberOfLines={1}
              >
                {wallet.name || `Wallet ${index + 1}`}
              </Text>
              <View
                className={`ml-2 px-2 py-0.5 rounded-full ${
                  wallet.namespace === "solana"
                    ? "bg-[#9945FF]/10"
                    : "bg-[#627EEA]/10"
                }`}
              >
                <Text
                  className={`text-[10px] font-semibold ${
                    wallet.namespace === "solana"
                      ? "text-[#9945FF]"
                      : "text-[#627EEA]"
                  }`}
                >
                  {namespaceLabel(wallet.namespace)}
                </Text>
              </View>
            </View>
            <Text
              className={`text-sm mt-0.5 ${
                isDisabled
                  ? "text-light-matte-black/40"
                  : "text-light-matte-black/70"
              }`}
            >
              {truncateAddress({ address: wallet.address, preset: "medium" })}
            </Text>
          </View>

          {isDisabled && disabledLabel && (
            <Text className="text-light-matte-black/40 text-xs mr-2">
              {disabledLabel}
            </Text>
          )}

          {isActive && !isDisabled && (
            <View className="w-6 h-6 rounded-full bg-light-primary-red/10 items-center justify-center">
              <Check size={14} color="#c71c4b" strokeWidth={3} />
            </View>
          )}
        </Pressable>
      );
    },
    [
      wallets,
      activeWalletIndex,
      disabledWalletIndex,
      disabledLabel,
      handleWalletSelection,
    ],
  );

  const keyExtractor = useCallback((item: TWallet) => item.address, []);

  if (!visible) return null;

  return (
    <Modal transparent visible animationType="none" onRequestClose={closeModal}>
      <View style={{ flex: 1 }}>
        <TouchableWithoutFeedback onPress={closeModal}>
          <Animated.View
            style={{
              flex: 1,
              backgroundColor: "rgba(0, 0, 0, 0.5)",
              opacity: fadeAnim,
            }}
          />
        </TouchableWithoutFeedback>

        <KeyboardAvoidingView
          // iOS uses `padding` so the sheet slides above the keyboard;
          // Android uses `height` so the fixed-frame `MODAL_HEIGHT`
          // shrinks instead of clipping content above the keyboard.
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
          }}
        >
          <Animated.View
            style={{
              height: MODAL_HEIGHT,
              paddingBottom: bottomOffset,
              transform: [{ translateY: translateY }],
            }}
            className="bg-light-main-container rounded-t-3xl"
          >
          <View
            {...panResponder.panHandlers}
            className="items-center py-3"
          >
            <View className="w-10 h-1 bg-light-matte-black/20 rounded-full" />
          </View>

          <View className="flex-row items-center justify-between px-4 pb-3">
            {isDappConnection && dappUrl ? (
              <View className="flex-row items-center gap-2 flex-1 pr-3">
                <View className="w-8 h-8 bg-light-primary-red/10 rounded-full items-center justify-center">
                  <Wallet size={16} color="#c71c4b" />
                </View>
                <View className="flex-1">
                  <Text
                    className="text-light-matte-black text-lg font-bold"
                    numberOfLines={1}
                  >
                    Connect Wallet
                  </Text>
                  <Text
                    className="text-light-matte-black/60 text-xs"
                    numberOfLines={1}
                  >
                    {getDomainFromUrl(dappUrl)} wants to connect
                  </Text>
                </View>
              </View>
            ) : (
              <Text className="text-light-matte-black text-xl font-bold">
                {title}
              </Text>
            )}
            <Pressable
              onPress={closeModal}
              accessibilityRole="button"
              accessibilityLabel="Close"
              className="w-8 h-8 rounded-full bg-light-matte-black/10 items-center justify-center"
            >
              <X size={18} color="#20222c" />
            </Pressable>
          </View>

          <View className="px-4 mb-3">
            <View className="bg-light rounded-2xl flex-row items-center px-4">
              <Search size={18} color="#20222c" />
              <TextInput
                className="flex-1 py-3 px-2 text-light-matte-black"
                placeholder="Search by name, address, or chain…"
                placeholderTextColor="#20222c80"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {searchQuery ? (
                <Pressable onPress={() => setSearchQuery("")}>
                  <X size={16} color="#20222c" />
                </Pressable>
              ) : null}
            </View>
          </View>

          <View className="flex-1 px-4">
            <FlatList
              data={filteredWallets}
              renderItem={({ item }) => renderWalletItem(item)}
              keyExtractor={keyExtractor}
              extraData={`${searchQuery}:${activeWalletIndex}`}
              contentContainerStyle={{ paddingBottom: 16 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <View className="items-center py-10">
                  <Text className="text-light-matte-black/60 text-center">
                    {wallets.length === 0
                      ? "No wallets available. Please create or import a wallet first."
                      : `No wallets match "${searchQuery}"`}
                  </Text>
                </View>
              }
            />
          </View>

          {isDappConnection ? (
            <View className="px-4 pb-2">
              <View className="bg-light rounded-2xl p-3 mb-3">
                <Text className="text-light-matte-black/60 text-xs text-center">
                  Only connect to websites you trust. TakumiPay will never ask
                  for your private keys or seed phrase.
                </Text>
              </View>
              <Pressable
                className="bg-light rounded-2xl p-4"
                onPress={closeModal}
              >
                <Text className="text-light-matte-black font-bold text-center">
                  Cancel
                </Text>
              </Pressable>
            </View>
          ) : null}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
});

export default WalletSelectorModal;
