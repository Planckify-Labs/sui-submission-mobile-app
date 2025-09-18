import { useNonce } from "@/hooks/queries/useAuth";
import useRQGlobalState from "@/hooks/useRQGlobalState";
import { useWallet } from "@/hooks/useWallet";
import { Check, Clock, ShieldAlert } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";

interface TSignMessageModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (rememberChoice: boolean) => void;
  message?: string;
  isDappRequest?: boolean;
  dappDomain?: string;
}

interface TNonceData {
  message: string;
}

const SignMessageModal: React.FC<TSignMessageModalProps> = ({
  visible,
  onClose,
  onConfirm,
  message: propMessage,
  isDappRequest = false,
  dappDomain,
}) => {
  const [rememberChoice, setRememberChoice] = useState(false);
  const [timeLeft, setTimeLeft] = useState(300);
  const fadeAnim = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const translateY = useRef(new Animated.Value(visible ? 0 : 300)).current;
  const hasAnimatedIn = useRef(visible);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { activeWallet, activeChain } = useWallet();

  const { data: fetchedNonceData, refetch: refetchNonce } = useNonce(
    activeWallet?.address,
    activeChain?.chain?.id,
  );

  const { data: nonceData, setNewData: setNonceData } =
    useRQGlobalState<TNonceData>({
      queryKey: [
        "auth",
        "nonce",
        activeWallet?.address,
        activeChain?.chain?.id,
      ],
      initialData: { message: propMessage || "" },
    });

  useEffect(() => {
    if (
      fetchedNonceData?.message &&
      fetchedNonceData.message !== nonceData?.message
    ) {
      setNonceData({ message: fetchedNonceData.message });
    }
  }, [fetchedNonceData, nonceData?.message, setNonceData]);

  useEffect(() => {
    if (activeWallet?.address && visible) {
      refetchNonce();
    }
  }, [activeWallet?.address, activeChain?.chain?.id, refetchNonce, visible]);

  const animateOpenModal = useCallback(() => {
    fadeAnim.setValue(0);
    translateY.setValue(300);

    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 0,
      }),
    ]).start(() => {
      hasAnimatedIn.current = true;
    });
  }, [fadeAnim, translateY]);

  const animateCloseModal = useCallback(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 300,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(onClose);
  }, [fadeAnim, translateY, onClose]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_: any, gestureState: { dy: number }) => {
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_: any, gestureState: { dy: number }) => {
        if (gestureState.dy > 100) {
          animateCloseModal();
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    }),
  ).current;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  useEffect(() => {
    if (visible) {
      setTimeLeft(300);
    }
  }, [visible]);

  useEffect(() => {
    if (visible) {
      if (!hasAnimatedIn.current) {
        setRememberChoice(false);
        animateOpenModal();
      }

      if (timerRef.current) {
        clearInterval(timerRef.current);
      }

      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            animateCloseModal();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      fadeAnim.setValue(0);
      translateY.setValue(300);
      hasAnimatedIn.current = false;

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [visible, animateOpenModal, animateCloseModal]);

  const displayMessage =
    propMessage || nonceData?.message || "Loading authentication message...";

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={animateCloseModal}
    >
      <View style={{ flex: 1 }}>
        <TouchableWithoutFeedback onPress={animateCloseModal}>
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
            height: "auto",
            paddingBottom: 20,
            backgroundColor: "#f5f6f9",
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            transform: [{ translateY: translateY }],
            shadowColor: "#000",
            shadowOffset: { width: 0, height: -3 },
            shadowOpacity: 0.1,
            shadowRadius: 10,
            elevation: 10,
            opacity: fadeAnim,
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
                Signing Statement
              </Text>
              {!isDappRequest && (
                <View className="flex-row items-center">
                  <View
                    className={`flex-row items-center mr-3 px-3 py-1 rounded-full ${timeLeft < 60 ? "bg-light-primary-red/10" : "bg-light-main-container"}`}
                  >
                    <Clock
                      size={16}
                      color={timeLeft < 60 ? "#c71c4b" : "#20222c"}
                    />
                    <Text
                      className={`ml-1 ${timeLeft < 60 ? "text-light-primary-red" : "text-light-matte-black"}`}
                    >
                      {formatTime(timeLeft)}
                    </Text>
                  </View>
                  <Pressable
                    onPress={animateCloseModal}
                    className="bg-light-main-container p-2 rounded-full"
                  >
                    <Text className="text-light-primary-red font-bold">✕</Text>
                  </Pressable>
                </View>
              )}
            </View>

            <View className="bg-white rounded-3xl p-6 shadow-sm mb-5">
              <Text className="text-light-matte-black/70 mb-6 text-center">
                You are about to sign the following message with your wallet:
              </Text>

              <View className="bg-light-main-container p-4 rounded-xl mb-6">
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  className="max-h-96"
                >
                  <Text className="text-light-matte-black font-medium">
                    {displayMessage}
                  </Text>
                </ScrollView>
              </View>
              {!isDappRequest && (
                <>
                  <Text className="text-light-matte-black/70 mb-6">
                    Signing this message proves ownership of your wallet
                    address. This is a secure operation that does not cost any
                    gas fees.
                  </Text>
                  {timeLeft < 60 && (
                    <View className="bg-light-primary-red/10 p-3 rounded-lg mb-6">
                      <Text className="text-light-primary-red text-center">
                        This authentication request will expire soon. Please
                        complete the process quickly.
                      </Text>
                    </View>
                  )}
                </>
              )}
              <TouchableOpacity
                className="flex-row items-center mb-4 hidden"
                onPress={() => setRememberChoice(!rememberChoice)}
              >
                <View
                  className={`w-6 h-6 rounded-md mr-3 items-center justify-center ${rememberChoice ? "bg-light-primary-red" : "border border-light-matte-black/30"}`}
                >
                  {rememberChoice && <Check size={16} color="#fff" />}
                </View>
                <Text className="text-light-matte-black flex-1">
                  Remember my choice (sign automatically in the future)
                </Text>
              </TouchableOpacity>
            </View>

            {isDappRequest && (
              <View className="mb-4">
                <View className="flex-row items-start gap-4">
                  <View className="mt-0.5 w-11 h-11 bg-gradient-to-br from-amber-100 to-orange-100 border border-amber-200/30 justify-center items-center rounded-xl shadow-sm">
                    <ShieldAlert size={20} color="#d97706" strokeWidth={2.5} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-amber-800/90 text-sm font-medium">
                      Only sign messages from trusted domains. Malicious
                      signatures can compromise your wallet security and funds.
                    </Text>
                    {dappDomain && (
                      <View className="mt-3 bg-white/60 border hidden- border-amber-200/40 rounded-lg flex-row items-center justify-center px-3 py-2">
                        <Text className="text-amber-700 text-xs font-semibold uppercase tracking-wider mb-1">
                          Requesting Domain:{" "}
                        </Text>
                        <Text className="text-amber-900 text-sm font-mono font-semibold">
                          {dappDomain}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            )}
            <View className="flex-row gap-4">
              <Pressable
                className="flex-1 bg-light-main-container py-4 rounded-xl items-center"
                onPress={animateCloseModal}
              >
                <Text className="text-light-matte-black font-bold">Cancel</Text>
              </Pressable>
              <Pressable
                className="flex-1 bg-light-primary-red py-4 rounded-xl items-center"
                onPress={() => onConfirm(rememberChoice)}
              >
                <Text className="text-white font-bold">Continue</Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

export default SignMessageModal;
