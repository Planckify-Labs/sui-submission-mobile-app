import ChainSelector from "@/components/common/ChainSelector";
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
  Wallet,
} from "lucide-react-native";
import React, { useCallback, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Image,
  PanResponder,
  Pressable,
  Text,
  Vibration,
  View,
} from "react-native";
import BalanceSectionSkeleton from "./BalanceSectionSkeleton";
import RecievePaymentModal from "./RecievePaymentModal";

const { height } = Dimensions.get("window");
const MODAL_HEIGHT = height * 0.6;

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
            <Pressable className="hidden flex-1 min-w-[120px] bg-light-main-container rounded-xl py-3 px-3 flex-row items-center">
              <View className="bg-light-primary-red/10 rounded-full p-1.5 mr-2">
                <PlusIcon size={20} color="#c71c4b" />
              </View>
              <Text className="text-light-matte-black text-[10px] font-medium">
                Top Up
              </Text>
            </Pressable>

            <Pressable
              onPress={() => router.push("/withdraw")}
              className="flex-1 min-w-[100px] bg-light-main-container rounded-xl py-3 px-3 flex-row items-center"
            >
              <View className="bg-light-primary-red/10 rounded-full p-1.5 mr-2 relative">
                <Wallet size={20} color="#c71c4b" />
                <View className="absolute -right-1 -bottom-1 -rotate-45">
                  <ArrowBigDown size={14} color="#c71c4b" />
                </View>
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
        <RecievePaymentModal
          modalVisible={modalVisible}
          closeModal={closeModal}
          activeWallet={activeWallet}
          activeChain={activeChain}
          fadeAnim={fadeAnim}
          translateY={translateY}
          panResponder={panResponder}
          isModalAnimationComplete={isModalAnimationComplete}
        />
      )}
    </>
  );
}
