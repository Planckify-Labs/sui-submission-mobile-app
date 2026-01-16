import { useRouter } from "expo-router";
import {
  ArrowBigDown,
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  PlusIcon,
  QrCode,
  Send,
  Wallet,
} from "lucide-react-native";
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Dimensions,
  Image,
  PanResponder,
  Text,
  TouchableOpacity,
  Vibration,
  View,
} from "react-native";
import ChainSelector from "@/components/common/ChainSelector";
import TakumiWalletHeaderLogo from "@/components/common/TakumiWalletHeaderLogo";
import { useWallet } from "@/hooks/useWallet";
import { useWalletBalance } from "@/hooks/useWalletBalance";
import { copyToClipboard } from "@/utils/helperUtils";
import BalanceSectionSkeleton from "./BalanceSectionSkeleton";
import RecievePaymentModal from "./RecievePaymentModal";

const { height } = Dimensions.get("window");
const MODAL_HEIGHT = height * 0.6;

export interface BalanceSectionRef {
  refetch: () => void;
}

const BalanceSection = forwardRef<BalanceSectionRef>((props, ref) => {
  const { activeWallet, activeChain, isLoading } = useWallet();
  const { balance, isFetching, refetch } = useWalletBalance(
    activeWallet?.address as `0x${string}` | string,
    activeChain,
  );

  useImperativeHandle(ref, () => ({
    refetch,
  }));
  const [isShowBalance, setShowBalance] = useState(false);
  const [selectedToken, setSelectedToken] = useState(
    activeChain?.chain.nativeCurrency?.symbol || "ETH",
  );
  useEffect(() => {
    setSelectedToken(activeChain?.chain.nativeCurrency?.symbol || "ETH");
  }, [activeChain?.chain?.nativeCurrency?.symbol]);
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
      <View className="px-4">
        <View className="bg-light rounded-2xl w-full p-5 shadow-sm">
          <View className="flex-row items-center justify-between mb-5">
            <View className="flex-row items-center">
              <TakumiWalletHeaderLogo width={100} color="#c71c4b" />
            </View>

            <ChainSelector />
          </View>

          <View className="flex-row items-center mb-3">
            <Text className="text-light-matte-black/70 text-xs mr-2">
              {activeWallet.name || "Wallet"}
            </Text>
            <TouchableOpacity
              activeOpacity={0.7}
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
            </TouchableOpacity>
          </View>

          <View className="bg-light-main-container/50 p-4 rounded-xl mb-6">
            <View className="flex-row items-center justify-between mb-1">
              <TouchableOpacity
                activeOpacity={0.7}
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
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 40, left: 20, right: 20 }}
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
              </TouchableOpacity>
            </View>

            <View>
              {isShowBalance ? (
                <Text className="text-light-primary-red font-bold text-4xl">
                  {isFetching ? "..." : balance}
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
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => router.push("/deposit")}
                className="flex-1 min-w-[120px] bg-light-main-container rounded-xl py-3 px-3 flex-row items-center"
              >
                <View className="bg-light-primary-red/10 rounded-full p-1.5 mr-2">
                  <PlusIcon size={20} color="#c71c4b" />
                </View>
                <Text className="text-light-matte-black text-[10px] font-medium">
                  Deposit
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.7}
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
              </TouchableOpacity>
            </View>

            <View className="">
              <View className="flex-row gap-3 flex-wrap justify-center">
                <TouchableOpacity
                  activeOpacity={0.7}
                  className="items-center m-1 mt-0"
                  onPress={openModal}
                >
                  <View className="bg-light-matte-black rounded-full items-center justify-center w-12 h-12 mb-1">
                    <QrCode size={20} color="#fff" />
                  </View>
                  <Text className="text-xs text-light-matte-black font-medium">
                    Receive
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.7}
                  className="items-center m-1 mt-0"
                  onPress={() => router.push("/send")}
                >
                  <View className="bg-light-matte-black rounded-full items-center justify-center w-12 h-12 pt-[2px] pr-[2px] mb-1">
                    <Send size={20} color="#fff" fill="#fff" />
                  </View>
                  <Text className="text-xs text-light-matte-black font-medium">
                    Send
                  </Text>
                </TouchableOpacity>
              </View>
              <View className="flex-row gap-2 p-1 flex-wrap justify-between bg-light-main-container rounded-xl items-center">
                <TouchableOpacity
                  activeOpacity={0.7}
                  className="items-center"
                  onPress={() => router.push("/asset-explorer")}
                >
                  <View className="bg-light-matte-black- rounded-full items-center justify-center w-12 h-12 mb-1">
                    <Image
                      source={require("@/assets/icons/asset-dark.png")}
                      style={{ width: 30, height: 30 }}
                      resizeMode="contain"
                    />
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.7}
                  className="items-center"
                  onPress={() => router.push("/dapps-browser")}
                >
                  <View className="bg-light-matte-black- rounded-full items-center justify-center w-12 h-12 mb-1">
                    <Image
                      source={require("@/assets/icons/explorer-dark.png")}
                      style={{ width: 30, height: 30 }}
                      resizeMode="contain"
                    />
                  </View>
                </TouchableOpacity>
              </View>
            </View>
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
});

BalanceSection.displayName = "BalanceSection";

export default BalanceSection;
