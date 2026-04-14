import { AlertTriangle, Check, CheckCircle } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Image,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatUnits } from "viem";
import type { TToken } from "@/api/types/token";
import OptimizedImage from "./OptimizedImage";
import PinConfirmationModal from "./PinConfirmationModal";

const { height } = Dimensions.get("window");
const MODAL_HEIGHT = height * 0.5;

interface SpendingApprovalModalProps {
  visible: boolean;
  onClose: () => void;
  onApprove: (isUnlimited?: boolean) => void;
  onCancel: () => void;
  token: TToken;
  spenderAddress: string;
  amount: string;
  isLoading?: boolean;
  spenderName?: string;
  isInternalContract?: boolean;
}

const SpendingApprovalModal: React.FC<SpendingApprovalModalProps> = ({
  visible,
  onClose,
  onApprove,
  onCancel,
  token,
  spenderAddress,
  amount,
  isLoading = false,
  spenderName = "Contract",
  isInternalContract = false,
}) => {
  const { bottom } = useSafeAreaInsets();
  const bottomOffset = Platform.OS === "ios" ? 16 : bottom > 0 ? bottom : 0;

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(MODAL_HEIGHT)).current;
  const [unlimitedAllowance, setUnlimitedAllowance] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);

  useEffect(() => {
    if (visible) {
      // Reset trust checkbox to unchecked each time the modal opens so a
      // previously-selected "trust" doesn't silently carry over.
      setUnlimitedAllowance(false);
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
      onClose();
    });
  }, [fadeAnim, translateY, onClose]);

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
          closeModal();
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    }),
  ).current;

  const handleCancel = () => {
    onCancel();
    closeModal();
  };

  const handleApprove = () => {
    setShowPinModal(true);
  };

  const handlePinConfirm = (pin: string) => {
    setShowPinModal(false);
    onApprove(unlimitedAllowance);
  };

  const handlePinClose = () => {
    setShowPinModal(false);
  };

  const formattedAmount = formatUnits(BigInt(amount), token.decimals);
  const truncatedSpenderAddress = `${spenderAddress.substring(0, 6)}...${spenderAddress.substring(spenderAddress.length - 4)}`;

  if (!visible) return null;

  return (
    <Modal
      transparent
      visible={visible}
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
            height: "auto",
            paddingBottom: bottomOffset,
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

          <View className="px-6 flex-1 pb-4">
            <View className="flex-row items-center justify-between mb-6">
              <Text className="text-light-matte-black text-xl font-bold">
                Spending Approval Required
              </Text>
              <Pressable
                onPress={closeModal}
                className="bg-light-main-container p-2 rounded-full"
              >
                <Text className="text-light-primary-red font-bold">✕</Text>
              </Pressable>
            </View>

            <View className="bg-white rounded-3xl p-6 shadow-sm mb-6">
              <View className="items-center mb-6">
                <View
                  className={`p-4 rounded-full mb-4 ${isInternalContract ? "bg-green-100" : "bg-orange-100"}`}
                >
                  {isInternalContract ? (
                    <CheckCircle size={32} color="#10b981" />
                  ) : (
                    <AlertTriangle size={32} color="#f59e0b" />
                  )}
                </View>
                <Text className="text-light-matte-black font-bold text-lg text-center mb-2">
                  {isInternalContract
                    ? "Confirm Token Spending"
                    : "Approve Token Spending"}
                </Text>
                <Text className="text-light-matte-black/70 text-center text-sm">
                  {isInternalContract
                    ? `${spenderName} needs permission to process your payment securely`
                    : "This contract needs permission to spend your tokens for this transaction"}
                </Text>
              </View>

              <View className="space-y-4">
                <View className="bg-light-main-container/50 rounded-xl p-4">
                  <View className="flex-row items-center justify-between mb-2">
                    <Text className="text-light-matte-black/70 text-sm">
                      Token
                    </Text>
                    <View className="flex-row items-center">
                      <View className="w-6 aspect-square rounded-full mr-2 items-center justify-center overflow-hidden">
                        {token.logoUrl ? (
                          <OptimizedImage
                            source={{ uri: token.logoUrl }}
                            style={{ width: 15, height: 15 }}
                            contentFit="contain"
                          />
                        ) : (
                          <Text className="text-light-primary-red text-xs font-bold">
                            {token.symbol.charAt(0)}
                          </Text>
                        )}
                      </View>
                      <Text className="text-light-matte-black font-medium">
                        {token.symbol}
                      </Text>
                    </View>
                  </View>

                  <View className="flex-row items-center justify-between mb-2">
                    <Text className="text-light-matte-black/70 text-sm">
                      Amount
                    </Text>
                    <Text className="text-light-matte-black font-medium">
                      {formattedAmount} {token.symbol}
                    </Text>
                  </View>

                  <View className="flex-row items-center justify-between">
                    <Text className="text-light-matte-black/70 text-sm">
                      Spender
                    </Text>
                    <View className="flex-1 items-end">
                      <Text className="text-light-matte-black font-medium text-sm">
                        {spenderName}
                      </Text>
                      <Text className="text-light-matte-black/50 text-xs">
                        {truncatedSpenderAddress}
                      </Text>
                    </View>
                  </View>
                </View>

                {isInternalContract ? (
                  <View className="bg-green-50 border border-green-200 rounded-xl p-4 mt-4">
                    <View className="items-start">
                      <View className="flex-row items-start gap-2">
                        <CheckCircle
                          size={16}
                          color="#10b981"
                          className="mr-2 mt-0.5"
                        />
                        <Text className="text-green-800 font-medium text-sm mb-1">
                          Secure Payment
                        </Text>
                      </View>
                      <View className="flex-1">
                        <Text className="text-green-700 text-xs">
                          This is a trusted Takumi Wallet contract that will
                          securely process your payment. Your {token.symbol}{" "}
                          tokens will be used only for this transaction.
                        </Text>
                      </View>
                    </View>
                  </View>
                ) : (
                  <View className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                    <View className="flex-row items-start">
                      <AlertTriangle
                        size={16}
                        color="#f59e0b"
                        className="mr-2 mt-0.5"
                      />
                      <View className="flex-1">
                        <Text className="text-orange-800 font-medium text-sm mb-1">
                          Security Notice
                        </Text>
                        <Text className="text-orange-700 text-xs">
                          Only approve spending for contracts you trust. This
                          approval allows the contract to spend your{" "}
                          {token.symbol} tokens.
                        </Text>
                      </View>
                    </View>
                  </View>
                )}
              </View>
            </View>

            <View className="bg-white rounded-2xl p-4 mb-4 shadow-sm">
              <Pressable
                onPress={() => setUnlimitedAllowance(!unlimitedAllowance)}
                className="flex-row items-center justify-between"
              >
                <View className="flex-1 mr-3">
                  <Text className="text-light-matte-black font-medium text-sm mb-1">
                    {isInternalContract
                      ? "Trust this contract"
                      : "Unlimited allowance"}
                  </Text>
                  <Text className="text-light-matte-black/60 text-xs">
                    {isInternalContract
                      ? `Allow ${spenderName} to spend your ${token.symbol} tokens without asking again`
                      : `Don't ask for approval again for this contract (not recommended for untrusted contracts)`}
                  </Text>
                </View>
                <View
                  className={`w-5 h-5 rounded border-2 items-center justify-center ${
                    unlimitedAllowance
                      ? "bg-light-primary-red border-light-primary-red"
                      : "border-light-matte-black/30"
                  }`}
                >
                  {unlimitedAllowance && (
                    <Check size={16} color="white" strokeWidth={3.5} />
                  )}
                </View>
              </Pressable>
            </View>

            <View className="flex-row space-x-3 gap-2">
              <Pressable
                className="flex-1 bg-light-main-container py-4 rounded-xl items-center"
                onPress={handleCancel}
                disabled={isLoading}
              >
                <Text className="text-light-matte-black font-bold">Cancel</Text>
              </Pressable>

              <TouchableOpacity
                className={`flex-1 bg-light-primary-red py-4 rounded-xl items-center flex-row justify-center ${
                  isLoading ? "opacity-50" : ""
                }`}
                onPress={handleApprove}
                disabled={isLoading}
                activeOpacity={0.7}
              >
                {isLoading ? (
                  <Text className="text-white font-bold">Approving...</Text>
                ) : (
                  <View className="flex-row items-center gap-2">
                    <CheckCircle size={18} color="white" />
                    <Text className="text-white font-bold">Approve</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      </View>

      <PinConfirmationModal
        visible={showPinModal}
        onClose={handlePinClose}
        onConfirm={handlePinConfirm}
        title="Confirm Token Approval"
      />
    </Modal>
  );
};

export default SpendingApprovalModal;
