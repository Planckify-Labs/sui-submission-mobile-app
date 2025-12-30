import { FlashList } from "@shopify/flash-list";
import { format } from "date-fns";
import {
  Check,
  ChevronRight,
  CopyIcon,
  Search,
  Wallet,
  X,
} from "lucide-react-native";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import OptimizedImage from "@/components/common/OptimizedImage";
import WalletSelectorModal from "@/components/wallet/WalletSelectorModal";
import { useTokens } from "@/hooks/queries/useTokens";
import { useBlockchainsWithStorage } from "@/hooks/useBlockchainsWithStorage";
import { useWallet } from "@/hooks/useWallet";
import { copyToClipboard } from "@/utils/helperUtils";

const { height } = Dimensions.get("window");
const MODAL_HEIGHT = height * 0.67;

interface ConversationHistory {
  onScrollToChat?: () => void;
}

export default function ConversationHistory({
  onScrollToChat,
}: ConversationHistory) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showWalletSelector, setShowWalletSelector] = useState(false);
  const [showChainSelector, setShowChainSelector] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(MODAL_HEIGHT)).current;

  const {
    wallets,
    activeWalletIndex,
    activeChain,
    setActiveWallet,
    changeActiveChain,
  } = useWallet();

  const { data: blockchains, isLoading: isLoadingBlockchains } =
    useBlockchainsWithStorage();

  const { data: nativeTokens, isLoading: isLoadingTokens } = useTokens({
    isNativeCurrency: true,
    isActive: true,
  });

  const allChains = useMemo(() => {
    if (!blockchains || !nativeTokens) return [];

    return blockchains.map((blockchain) => {
      return {
        chain: {
          id: blockchain.chainId,
          name: blockchain.name,
          nativeCurrency: {
            name: blockchain.tokens?.[0]?.name,
            symbol: blockchain.tokens?.[0]?.symbol,
            decimals: blockchain.tokens?.[0]?.decimals,
          },
        },
        iconUrl: blockchain.tokens?.[0]?.logoUrl,
        isTestnet: false,
        blockchainId: blockchain.id,
      };
    });
  }, [blockchains, nativeTokens]);

  const activeWallet = useMemo(
    () => wallets[activeWalletIndex],
    [wallets, activeWalletIndex],
  );

  const formattedAddress = useMemo(() => {
    if (!activeWallet?.address) return "...";
    return `${activeWallet.address.substring(0, 6)}...${activeWallet.address.substring(activeWallet.address.length - 4)}`;
  }, [activeWallet?.address]);

  const closeChainModal = useCallback(() => {
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
      setShowChainSelector(false);
    });
  }, [fadeAnim, translateY]);

  const handleChainSelect = useCallback(
    async (chainId: number) => {
      await changeActiveChain(chainId);
      closeChainModal();
    },
    [changeActiveChain, closeChainModal],
  );

  const openChainModal = useCallback(() => {
    setShowChainSelector(true);
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
  }, [fadeAnim, translateY]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return gestureState.dy > 0;
      },
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
          }).start(() => closeChainModal());
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

  const handleWalletSwitch = (index: number) => {
    setActiveWallet(index);
    setShowWalletSelector(false);
  };

  return (
    <View className="flex-1 bg-light-main-container">
      <View className="flex-1 px-4">
        <View className="flex-row items-center mb-6">
          <View className="flex-1 bg-light rounded-full flex-row items-center px-4 py-2">
            <Search size={18} color="#20222c" />
            <TextInput
              className="flex-1 py-1 px-3 text-light-matte-black bg-lig"
              placeholder="Search conversations..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholderTextColor="#999"
            />
            {searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery("")}>
                <X size={18} color="#20222c" />
              </TouchableOpacity>
            ) : null}
          </View>
          <TouchableOpacity className="relative" onPress={onScrollToChat}>
            <View className="absolute top-0 -right-2">
              <ChevronRight size={40} color="#c71c4b" strokeWidth={1.3} />
            </View>
            <View className="top-0 right-0">
              <ChevronRight size={40} color="#c71c4b" strokeWidth={1.3} />
            </View>
          </TouchableOpacity>
        </View>

        <Text className="text-sm font-light text-gray-500 uppercase mb-3">
          Conversations
        </Text>

        <FlashList
          data={["test"]}
          keyExtractor={(item) => item}
          renderItem={({ item }) => {
            return (
              <TouchableOpacity
                onPress={() => {}}
                className="rounded-lg px-4 py-3 mb-2"
              >
                <Text
                  className="text-light-matte-black font-normal text-base"
                  numberOfLines={2}
                >
                  {item}
                </Text>
              </TouchableOpacity>
            );
          }}
          scrollEnabled={true}
          showsVerticalScrollIndicator={false}
        />
        <View className="flex-row justify-between p-4 px-[4px]">
          <View className="flex-row gap-2 items-center">
            <TouchableOpacity onPress={openChainModal}>
              <View className="aspect-square w-[42px] rounded-full overflow-hidden bg-light/50 border-4 border-light-matte-black/80">
                <OptimizedImage source={{ uri: activeChain?.iconUrl }} />
              </View>
            </TouchableOpacity>
            <View>
              <Text className="text-sm text-light-matte-black font-semibold">
                {activeWallet?.name}
              </Text>
              <Text className="text-[10px] font-bold text-light-matte-black/70">
                {activeChain?.chain?.name}
              </Text>
              <TouchableOpacity
                className="flex-row gap-2"
                onPress={() =>
                  copyToClipboard(
                    activeWallet?.address || "failed to copy wallet address",
                    "Wallet Address",
                  )
                }
              >
                <Text className="text-xs text-light-matte-black/80">
                  {formattedAddress}
                </Text>
                <CopyIcon color="#c71c4b" size={13} />
              </TouchableOpacity>
            </View>
          </View>
          <View>
            <TouchableOpacity
              className="p-4 aspect-square rounded-full"
              onPress={() => setShowWalletSelector(true)}
            >
              <Wallet size={25} color="#c71c4b" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <WalletSelectorModal
        visible={showWalletSelector}
        onClose={() => setShowWalletSelector(false)}
        wallets={wallets}
        activeWalletIndex={activeWalletIndex}
        onSelectWallet={handleWalletSwitch}
        title="Switch Wallet"
      />

      {showChainSelector && (
        <Modal
          transparent
          visible
          animationType="none"
          onRequestClose={closeChainModal}
        >
          <View style={{ flex: 1 }}>
            <TouchableWithoutFeedback onPress={closeChainModal}>
              <Animated.View
                style={{
                  flex: 1,
                  backgroundColor: "rgba(0, 0, 0, 0.5)",
                  opacity: fadeAnim,
                }}
              />
            </TouchableWithoutFeedback>

            <Animated.View
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: MODAL_HEIGHT,
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                transform: [{ translateY: translateY }],
              }}
            >
              <View className="bg-light-main-container flex-1 rounded-t-3xl">
                <View
                  {...panResponder.panHandlers}
                  className="w-full items-center pt-4 pb-2"
                >
                  <View className="w-12 h-1 bg-gray-300 rounded-full" />
                </View>

                <View className="px-6 flex-1">
                  <View className="flex-row justify-between items-center mb-4">
                    <Text className="text-light-matte-black text-xl font-bold">
                      Select Network
                    </Text>

                    <Pressable className="" onPress={closeChainModal}>
                      <X size={18} color="#c71c4b" />
                    </Pressable>
                  </View>

                  <ScrollView className="flex-1">
                    {isLoadingBlockchains || isLoadingTokens ? (
                      <View className="items-center justify-center py-8">
                        <Text className="text-light-matte-black">
                          Loading networks...
                        </Text>
                      </View>
                    ) : (
                      allChains.map((chain) => {
                        const isActive =
                          activeChain.chain.id === chain.chain.id;

                        return (
                          <Pressable
                            key={chain.chain.id}
                            className={`flex-row items-center p-4 mb-2 rounded-xl ${
                              isActive ? "bg-light-primary-red/10" : "bg-light"
                            }`}
                            onPress={() => handleChainSelect(chain.chain.id)}
                          >
                            <View className="mr-3 rounded-full overflow-hidden">
                              <OptimizedImage
                                source={{ uri: chain.iconUrl }}
                                style={{ width: 24, height: 24 }}
                              />
                            </View>

                            <View className="flex-1">
                              <Text className="text-light-matte-black font-bold">
                                {chain.chain.name}
                              </Text>
                              <Text className="text-light-matte-black/70 text-sm">
                                {chain.chain.nativeCurrency.symbol || "N/A"}
                              </Text>
                            </View>

                            {chain.isTestnet && (
                              <View className="bg-yellow-500/20 px-2 py-1 rounded-full mr-2">
                                <Text className="text-yellow-700 text-xs font-medium">
                                  Testnet
                                </Text>
                              </View>
                            )}

                            {isActive && (
                              <View className="w-6 h-6 rounded-full bg-light-primary-red/10 items-center justify-center">
                                <Check
                                  size={14}
                                  color="#c71c4b"
                                  strokeWidth={3}
                                />
                              </View>
                            )}
                          </Pressable>
                        );
                      })
                    )}
                  </ScrollView>
                </View>
              </View>
            </Animated.View>
          </View>
        </Modal>
      )}
    </View>
  );
}
