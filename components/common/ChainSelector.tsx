import { useTokens } from "@/hooks/queries/useTokens";
import { useBlockchainsWithStorage } from "@/hooks/useBlockchainsWithStorage";
import { useWallet } from "@/hooks/useWallet";
import { Check, ChevronDown } from "lucide-react-native";
import React, { memo, useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  TouchableWithoutFeedback,
  View,
} from "react-native";

const { height } = Dimensions.get("window");
const MODAL_HEIGHT = height * 0.67;

const ChainSelector = memo(() => {
  const { activeChain, changeActiveChain } = useWallet();
  const [modalVisible, setModalVisible] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(MODAL_HEIGHT)).current;

  const { data: blockchains, isLoading: isLoadingBlockchains } =
    useBlockchainsWithStorage({ isActive: true });

  const { data: nativeTokens, isLoading: isLoadingTokens } = useTokens({
    isNativeCurrency: true,
    isActive: true,
  });

  const isLoading = isLoadingBlockchains || isLoadingTokens;

  const allChains = useMemo(() => {
    if (!blockchains || !nativeTokens) return [];

    const nativeTokenMap = new Map(
      nativeTokens.map((token) => [token.blockchainId, token]),
    );

    return blockchains.map((blockchain) => {
      const nativeToken = nativeTokenMap.get(blockchain.id);

      return {
        chain: {
          id: blockchain.chainId,
          name: blockchain.name,
          nativeCurrency: {
            name: nativeToken?.name || "Ether",
            symbol: nativeToken?.symbol || "ETH",
            decimals: nativeToken?.decimals || 18,
          },
        },
        iconUrl: nativeToken?.logoUrl || "",
        isTestnet: false,
        blockchainId: blockchain.id,
      };
    });
  }, [blockchains, nativeTokens]);

  const handleChainSelect = useCallback(
    async (chainId: number) => {
      await changeActiveChain(chainId);
      closeModal();
    },
    [changeActiveChain],
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
    (chain: any) => {
      const isActive = activeChain.chain.id === chain.chain.id;

      return (
        <Pressable
          key={chain.chain.id}
          className={`flex-row items-center p-4 mb-2 rounded-xl ${
            isActive ? "bg-light-primary-red/10" : "bg-light-main-container"
          }`}
          onPress={() => handleChainSelect(chain.chain.id)}
        >
          {chain.iconUrl && (
            <Image
              source={{ uri: chain.iconUrl }}
              style={{ width: 24, height: 24 }}
              className="mr-3"
            />
          )}

          <View className="flex-1">
            <Text className="text-light-matte-black font-bold">
              {chain.chain.name}
            </Text>
            <Text className="text-light-matte-black/70 text-sm">
              {chain.chain.nativeCurrency.symbol}
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
        {activeChain.iconUrl && (
          <Image
            source={{ uri: activeChain.iconUrl }}
            style={{ width: 20, height: 20 }}
            className="mr-2"
          />
        )}
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
                backgroundColor: "white",
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                transform: [{ translateY: translateY }],
              }}
            >
              <View
                {...panResponder.panHandlers}
                className="w-full items-center pt-4 pb-2"
              >
                <View className="w-12 h-1 bg-gray-300 rounded-full" />
              </View>

              <View className="px-6 flex-1">
                <Text className="text-light-matte-black text-xl font-bold mb-4">
                  Select Network
                </Text>

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

                <Pressable
                  className="bg-light-main-container p-4 rounded-xl my-4"
                  onPress={closeModal}
                >
                  <Text className="text-light-matte-black font-bold text-center">
                    Close
                  </Text>
                </Pressable>
              </View>
            </Animated.View>
          </View>
        </Modal>
      )}
    </>
  );
});

export default ChainSelector;
