import { Check, ChevronDown, X } from "lucide-react-native";
import React, { memo, useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTokens } from "@/hooks/queries/useTokens";
import { useBlockchainsWithStorage } from "@/hooks/useBlockchainsWithStorage";
import { useWallet } from "@/hooks/useWallet";

const { height } = Dimensions.get("window");
const MODAL_HEIGHT = height * 0.67;

const ChainSelector = memo(() => {
  const { bottom } = useSafeAreaInsets();
  const bottomOffset = Platform.OS === "ios" ? 16 : bottom > 0 ? bottom : 0;

  const { activeChain, changeActiveChain } = useWallet();
  const [modalVisible, setModalVisible] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(MODAL_HEIGHT)).current;

  console.log("activeChain", activeChain.iconUrl);

  const { data: blockchains, isLoading: isLoadingBlockchains } =
    useBlockchainsWithStorage({ isActive: true });

  const { data: nativeTokens, isLoading: isLoadingTokens } = useTokens({
    isNativeCurrency: true,
    isActive: true,
  });

  const isLoading = isLoadingBlockchains || isLoadingTokens;

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
      setModalVisible(false);
    });
  }, [fadeAnim, translateY]);

  const handleChainSelect = useCallback(
    async (chainId: number) => {
      await changeActiveChain(chainId);
      closeModal();
    },
    [changeActiveChain, closeModal],
  );

  const openModal = useCallback(() => {
    setModalVisible(true);
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
          }).start(() => closeModal());
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

  const renderChainItem = useCallback(
    (chain: {
      chain: {
        id: number;
        name: string;
        nativeCurrency: {
          name: string | undefined;
          symbol: string | undefined;
          decimals: number | undefined;
        };
      };
      iconUrl: string | undefined;
      isTestnet: boolean;
      blockchainId: string;
    }) => {
      const isActive = activeChain.chain.id === chain.chain.id;

      return (
        <Pressable
          key={chain.chain.id}
          className={`flex-row items-center p-4 mb-2 rounded-xl ${
            isActive ? "bg-light-primary-red/10" : "bg-light"
          }`}
          onPress={() => handleChainSelect(chain.chain.id)}
        >
          <Image
            source={{ uri: chain.iconUrl }}
            style={{ width: 24, height: 24 }}
            className="mr-3 rounded-full"
            defaultSource={require("@/assets/images/takumipay-logo.png")}
          />

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

          {activeChain.chain.id === chain.chain.id && (
            <View className="w-6 h-6 rounded-full bg-light-primary-red/10 items-center justify-center">
              <Check size={14} color="#c71c4b" strokeWidth={3} />
            </View>
          )}
        </Pressable>
      );
    },
    [activeChain, handleChainSelect],
  );

  return (
    <>
      <Pressable
        onPress={openModal}
        className="flex-row items-center bg-light-main-container px-3 py-2 rounded-full"
      >
        <Image
          source={{
            uri: activeChain.iconUrl,
          }}
          style={{ width: 20, height: 20 }}
          className="mr-2 rounded-full bg-light-matte-black/5"
          defaultSource={require("@/assets/images/takumipay-logo.png")}
        />
        <Text className="text-light-matte-black text-xs font-medium mr-2">
          {activeChain.chain.name}
        </Text>
        <ChevronDown size={16} color="#c71c4b" />
      </Pressable>

      {modalVisible && (
        <Modal
          transparent
          visible
          animationType="none"
          onRequestClose={closeModal}
        >
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

            <Animated.View
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: MODAL_HEIGHT,
                paddingBottom: bottomOffset,
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

                    <Pressable className="" onPress={closeModal}>
                      <X size={18} color="#c71c4b" />
                    </Pressable>
                  </View>

                  <ScrollView className="flex-1">
                    {isLoading ? (
                      <View className="items-center justify-center py-8">
                        <ActivityIndicator color="#c71c4b" />
                        <Text className="text-light-matte-black mt-2">
                          Loading networks...
                        </Text>
                      </View>
                    ) : (
                      allChains.map(renderChainItem)
                    )}
                  </ScrollView>
                </View>
              </View>
            </Animated.View>
          </View>
        </Modal>
      )}
    </>
  );
});

export default ChainSelector;
