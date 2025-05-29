import ChainSelector from "@/components/wallet/ChainSelector";
import { takumipayLogoBase64 } from "@/constants/takumipay";
import { useWallet } from "@/hooks/useWallet";
import { copyToClipboard } from "@/utils/authUtils";
import { useRouter } from "expo-router";
import {
  ArrowBigDown,
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  PlusIcon,
} from "lucide-react-native";
import React, { useCallback, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Image,
  Modal,
  PanResponder,
  Pressable,
  Text,
  TouchableWithoutFeedback,
  Vibration,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import BalanceSectionSkeleton from "./BalanceSectionSkeleton";

const { height } = Dimensions.get("window");
const MODAL_HEIGHT = height * 0.67;

export default function BalanceSection() {
  const { activeWallet, activeChain, isLoading } = useWallet();
  const [isShowBalance, setShowBalance] = useState(true);
  const [selectedToken, setSelectedToken] = useState(
    activeChain?.chain.nativeCurrency?.symbol || "ETH",
  );
  const [modalVisible, setModalVisible] = useState(false);
  const [isModalAnimationComplete, setIsModalAnimationComplete] =
    useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(MODAL_HEIGHT)).current;
  const router = useRouter();

  const openModal = useCallback(() => {
    setModalVisible(true);
    setIsModalAnimationComplete(false);
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
    ]).start(() => {
      setIsModalAnimationComplete(true);
    });
  }, [fadeAnim, translateY]);

  const closeModal = useCallback(() => {
    setIsModalAnimationComplete(false);
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

  if (isLoading) {
    return <BalanceSectionSkeleton />;
  }

  return (
    <>
      <View className="bg-light rounded-2xl w-full p-5 shadow-sm">
        <View className="flex-row items-center justify-between mb-5">
          <View className="flex-row items-center">
            <View className="bg-light-primary-red/10 w-8 relative p-2- aspect-square rounded-md mr-2">
              <Image
                source={require("@/assets/images/takumipay-no-bg.png")}
                style={{ width: 20, height: 18 }}
                className="absolute bottom-[5px] left-1"
              />
            </View>
            <Text className="font-bold text-light-matte-black text-base">
              TakumiPay
            </Text>
          </View>

          <ChainSelector />
        </View>

        <View className="flex-row items-center mb-3">
          <Text className="text-light-matte-black/70 text-xs mr-2">
            {activeWallet.name || "Wallet"}
          </Text>
          <Pressable
            onPress={() => copyToClipboard(activeWallet.address, "Address")}
            className="flex-row items-center ml-auto gap-2"
          >
            <Text className="text-light-matte-black/60 text-xs">
              {activeWallet?.address?.substring(0, 6)}...
              {activeWallet?.address?.substring(
                activeWallet.address.length - 4,
              )}
            </Text>
            <Copy size={12} color="#c71c4b" className="ml-1" />
          </Pressable>
        </View>

        <View className="bg-light-main-container/50 p-4 rounded-xl mb-6">
          <View className="flex-row items-center justify-between mb-1">
            <Pressable
              onPress={() => {
                setSelectedToken(activeChain.chain.nativeCurrency.symbol);
                router.push("/asset-explorer");
              }}
              className="flex-row items-center"
            >
              <Text className="text-light-matte-black font-medium text-sm mr-1">
                {selectedToken}
              </Text>
              <ChevronDown size={14} color="#c71c4b" />
            </Pressable>

            <Pressable
              onPress={() => {
                Vibration.vibrate(100);
                setShowBalance((prevValue) => !prevValue);
              }}
            >
              {isShowBalance ? (
                <Eye size={16} color="#c71c4b" />
              ) : (
                <EyeOff size={16} color="#c71c4b" />
              )}
            </Pressable>
          </View>

          <View>
            {isShowBalance ? (
              <Text className="text-light-primary-red font-bold text-4xl">
                {activeWallet.balance}
              </Text>
            ) : (
              <View className="flex-row items-center gap-2 py-2">
                <View className="h-2 bg-light-primary-red w-16 rounded-full" />
                <View className="h-2 bg-light-primary-red w-10 rounded-full" />
                <View className="h-2 bg-light-primary-red w-8 rounded-full" />
              </View>
            )}
          </View>
        </View>

        <View className="flex-row gap-4 flex-wrap">
          <View className="flex-1 min-w-[100px] gap-3 flex-row flex-wrap">
            <Pressable className="flex-1 min-w-[120px] bg-light-main-container rounded-xl py-3 px-3 flex-row items-center">
              <View className="bg-light-primary-red/10 rounded-full p-1.5 mr-2">
                <PlusIcon size={20} color="#c71c4b" />
              </View>
              <Text className="text-light-matte-black text-[10px] font-medium">
                Top Up
              </Text>
            </Pressable>

            <Pressable className="flex-1 min-w-[100px] bg-light-main-container rounded-xl py-3 px-3 flex-row items-center">
              <View className="bg-light-primary-red/10 rounded-full p-1.5 mr-2">
                <ArrowBigDown size={20} color="#c71c4b" />
              </View>
              <Text className="text-light-matte-black text-[10px] font-medium">
                Withdraw
              </Text>
            </Pressable>
          </View>

          <View className="flex-row gap-3 flex-wrap justify-center">
            <Pressable className="items-center m-1" onPress={openModal}>
              <View className="bg-light-matte-black rounded-full items-center justify-center w-12 h-12 mb-1">
                <ArrowDownToLine size={20} color="#fff" />
              </View>
              <Text className="text-xs text-light-matte-black font-medium">
                Receive
              </Text>
            </Pressable>

            <Pressable
              className="items-center m-1"
              onPress={() => router.push("/send")}
            >
              <View className="bg-light-matte-black rounded-full items-center justify-center w-12 h-12 mb-1">
                <ArrowUpToLine size={20} color="#fff" />
              </View>
              <Text className="text-xs text-light-matte-black font-medium">
                Send
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

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
                backgroundColor: "#f5f6f9",
                borderTopLeftRadius: 28,
                borderTopRightRadius: 28,
                transform: [{ translateY: translateY }],
                shadowColor: "#000",
                shadowOffset: { width: 0, height: -3 },
                shadowOpacity: 0.1,
                shadowRadius: 10,
                elevation: 10,
              }}
            >
              <View
                {...panResponder.panHandlers}
                className="w-full items-center pt-4 pb-2"
              >
                <View className="w-12 h-1 bg-gray-300 rounded-full" />
              </View>

              <View className="px-6 flex-1">
                <View className="flex-row items-center justify-between mb-6">
                  <Text className="text-light-matte-black text-xl font-bold">
                    Receive Payment
                  </Text>
                  <Pressable
                    onPress={closeModal}
                    className="bg-light-main-container p-2 rounded-full"
                  >
                    <Text className="text-light-primary-red font-bold">✕</Text>
                  </Pressable>
                </View>

                <View className="bg-white rounded-3xl p-6 shadow-sm mb-5">
                  <View className="items-center mb-6 h-64">
                    <View className="bg-light-main-container/50 p-6 rounded-2xl">
                      {isModalAnimationComplete && (
                        <QRCode
                          value={activeWallet.address}
                          size={180}
                          color="#20222c"
                          backgroundColor="#ffffff"
                          logo={{ uri: takumipayLogoBase64 }}
                          logoSize={45}
                          logoBackgroundColor="white"
                          logoBorderRadius={10}
                        />
                      )}
                    </View>
                  </View>

                  <View className="items-center mb-4">
                    <View className="bg-light-primary-red/10 px-3 py-1 rounded-full mb-2">
                      <Text className="text-light-primary-red text-xs font-medium">
                        {activeChain.chain.name}
                      </Text>
                    </View>
                    <Text className="text-light-matte-black font-medium text-base">
                      {activeWallet.name || "My Wallet"}
                    </Text>
                  </View>

                  <View className="bg-light-main-container p-4 rounded-xl w-full">
                    <View className="flex-row items-center justify-between mb-1">
                      <Text className="text-light-matte-black/70 text-xs font-medium">
                        WALLET ADDRESS
                      </Text>
                      <Pressable
                        onPress={() =>
                          copyToClipboard(activeWallet.address, "Address")
                        }
                        className="flex-row items-center"
                      >
                        <Text className="text-light-primary-red text-xs mr-1">
                          COPY
                        </Text>
                        <Copy size={12} color="#c71c4b" />
                      </Pressable>
                    </View>
                    <Text
                      className="text-light-matte-black text-sm font-medium"
                      numberOfLines={1}
                      ellipsizeMode="middle"
                    >
                      {activeWallet.address}
                    </Text>
                  </View>
                </View>

                <View className="bg-white p-4 rounded-2xl shadow-sm mb-6">
                  <View className="flex-row items-center">
                    <View className="bg-yellow-500/20 p-2 rounded-full mr-3">
                      <Text className="text-yellow-700 font-bold">⚠️</Text>
                    </View>
                    <Text className="text-light-matte-black/80 text-sm flex-1">
                      Send only{" "}
                      <Text className="font-bold">
                        {activeChain.chain.name}
                      </Text>{" "}
                      assets to this address. Other assets may be lost
                      permanently.
                    </Text>
                  </View>
                </View>

                <View className="flex-row gap-4">
                  <Pressable
                    className="flex-1 bg-light-main-container p-4 rounded-xl"
                    onPress={() =>
                      copyToClipboard(activeWallet.address, "Address")
                    }
                  >
                    <View className="flex-row items-center justify-center">
                      <Copy size={18} color="#c71c4b" className="mr-2" />
                      <Text className="text-light-matte-black font-medium">
                        Copy Address
                      </Text>
                    </View>
                  </Pressable>

                  <Pressable
                    className="flex-1 bg-light-primary-red p-4 rounded-xl"
                    onPress={closeModal}
                  >
                    <Text className="text-white font-bold text-center">
                      Done
                    </Text>
                  </Pressable>
                </View>
              </View>
            </Animated.View>
          </View>
        </Modal>
      )}
    </>
  );
}
