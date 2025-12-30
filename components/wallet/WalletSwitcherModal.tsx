import {
  Check,
  Plus,
  Search,
  Wallet as WalletIcon,
  X,
} from "lucide-react-native";
import React, { memo, useCallback, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  FlatList,
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
import Chip from "@/components/common/Chip";
import type { TWallet } from "@/constants/types/walletTypes";
import { truncateAddress } from "@/utils/walletUtils";

const { height } = Dimensions.get("window");
const MODAL_HEIGHT = height * 0.75;

type WalletSwitcherModalProps = {
  visible: boolean;
  onClose: () => void;
  wallets: TWallet[];
  activeWalletIndex: number;
  onSelectWallet: (index: number) => void;
  onAddWallet: () => void;
};

const WalletSwitcherModal = memo(function WalletSwitcherModal({
  visible,
  onClose,
  wallets,
  activeWalletIndex,
  onSelectWallet,
  onAddWallet,
}: WalletSwitcherModalProps) {
  const { bottom } = useSafeAreaInsets();
  const bottomOffset = Platform.OS === "ios" ? 16 : bottom > 0 ? bottom : 16;

  const [searchQuery, setSearchQuery] = useState("");
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(MODAL_HEIGHT)).current;

  const filteredWallets = useMemo(() => {
    if (!searchQuery.trim()) return wallets;
    const query = searchQuery.toLowerCase();
    return wallets.filter(
      (wallet) =>
        wallet.name.toLowerCase().includes(query) ||
        wallet.address.toLowerCase().includes(query) ||
        wallet.type.toLowerCase().includes(query),
    );
  }, [wallets, searchQuery]);

  const closeModal = useCallback(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: MODAL_HEIGHT,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setSearchQuery("");
      onClose();
    });
  }, [fadeAnim, translateY, onClose]);

  const handleWalletSelect = useCallback(
    (index: number) => {
      onSelectWallet(index);
      closeModal();
    },
    [onSelectWallet, closeModal],
  );

  React.useEffect(() => {
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

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => gestureState.dy > 0,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 50 || gestureState.vy > 0.5) {
          Animated.timing(translateY, {
            toValue: MODAL_HEIGHT,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            setSearchQuery("");
            onClose();
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

  const renderWalletItem = useCallback(
    ({ item }: { item: TWallet }) => {
      const originalIndex = wallets.findIndex(
        (w) => w.address === item.address,
      );
      const isActive = originalIndex === activeWalletIndex;

      return (
        <Pressable
          className={`flex-row items-center p-4 mb-2 rounded-xl ${
            isActive ? "bg-light-primary-red/10" : "bg-light"
          }`}
          onPress={() => handleWalletSelect(originalIndex)}
        >
          <View
            className={`w-10 h-10 rounded-full items-center justify-center mr-3 ${
              isActive ? "bg-light-primary-red" : "bg-light-primary-red/10"
            }`}
          >
            <WalletIcon size={18} color={isActive ? "#ffffff" : "#c71c4b"} />
          </View>

          <View className="flex-1">
            <Text className="text-light-matte-black font-bold">
              {item.name}
            </Text>
            <View className="flex-row items-center mt-1">
              <Text className="text-light-matte-black/60 text-sm mr-2">
                {truncateAddress({ address: item.address, preset: "medium" })}
              </Text>
              <Chip label={item.type} size="small" />
            </View>
          </View>

          {isActive && (
            <View className="w-6 h-6 rounded-full bg-light-primary-red items-center justify-center">
              <Check size={14} color="#ffffff" strokeWidth={3} />
            </View>
          )}
        </Pressable>
      );
    },
    [wallets, activeWalletIndex, handleWalletSelect],
  );

  const keyExtractor = useCallback(
    (item: TWallet, index: number) => item.address || `wallet-${index}`,
    [],
  );

  if (!visible) return null;

  return (
    <Modal transparent visible animationType="none">
      <TouchableWithoutFeedback onPress={closeModal}>
        <Animated.View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            opacity: fadeAnim,
          }}
        >
          <TouchableWithoutFeedback>
            <Animated.View
              style={{
                transform: [{ translateY }],
                height: MODAL_HEIGHT,
                marginTop: "auto",
              }}
              className="bg-light-main-container rounded-t-3xl"
            >
              <View {...panResponder.panHandlers} className="items-center py-3">
                <View className="w-10 h-1 bg-light-matte-black/20 rounded-full" />
              </View>

              <View className="flex-row items-center justify-between px-4 pb-3">
                <Text className="text-light-matte-black text-xl font-bold">
                  Select Wallet
                </Text>
                <Pressable
                  onPress={closeModal}
                  className="w-8 h-8 rounded-full bg-light-matte-black/10 items-center justify-center"
                >
                  <X size={18} color="#20222c" />
                </Pressable>
              </View>

              <View className="px-4 mb-3">
                <View className="bg-light rounded-xl flex-row items-center px-4">
                  <Search size={18} color="#20222c" />
                  <TextInput
                    className="flex-1 py-3 px-2 text-light-matte-black"
                    placeholder="Search by name, address, or type..."
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholderTextColor="#20222c80"
                  />
                  {searchQuery ? (
                    <Pressable onPress={() => setSearchQuery("")}>
                      <X size={16} color="#20222c" />
                    </Pressable>
                  ) : null}
                </View>
              </View>

              <FlatList
                data={filteredWallets}
                renderItem={renderWalletItem}
                keyExtractor={keyExtractor}
                extraData={searchQuery}
                contentContainerStyle={{
                  paddingHorizontal: 16,
                  paddingBottom: bottomOffset,
                }}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                  <View className="items-center py-8">
                    <Text className="text-light-matte-black/60">
                      No wallets found
                    </Text>
                  </View>
                }
                ListFooterComponent={
                  <Pressable
                    className="flex-row items-center justify-center p-4 mt-2 border-2 border-dashed border-light-matte-black/15 rounded-xl"
                    onPress={() => {
                      closeModal();
                      onAddWallet();
                    }}
                  >
                    <Plus size={20} color="#c71c4b" />
                    <Text className="text-light-primary-red font-medium ml-2">
                      Add New Wallet
                    </Text>
                  </Pressable>
                }
              />
            </Animated.View>
          </TouchableWithoutFeedback>
        </Animated.View>
      </TouchableWithoutFeedback>
    </Modal>
  );
});

export default WalletSwitcherModal;
