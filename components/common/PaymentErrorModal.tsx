import { AlertCircle, Home, RefreshCw, MessageCircle } from "lucide-react-native";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  Text,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";

type PaymentErrorModalProps = {
  visible: boolean;
  onClose: () => void;
  errorMessage?: string;
  onRetry?: () => void;
  onContactSupport?: () => void;
};

const MODAL_HEIGHT = 450;

export default function PaymentErrorModal({
  visible,
  onClose,
  errorMessage = "An error occurred during the payment process",
  onRetry,
  onContactSupport,
}: PaymentErrorModalProps) {
  const { bottom } = useSafeAreaInsets();
  const bottomOffset = Platform.OS === "ios" ? 16 : bottom > 0 ? bottom : 0;

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(MODAL_HEIGHT)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          tension: 65,
          friction: 11,
          useNativeDriver: true,
        }),
      ]).start(() => {
        // Shake animation for error icon
        Animated.sequence([
          Animated.timing(shakeAnim, {
            toValue: 10,
            duration: 100,
            useNativeDriver: true,
          }),
          Animated.timing(shakeAnim, {
            toValue: -10,
            duration: 100,
            useNativeDriver: true,
          }),
          Animated.timing(shakeAnim, {
            toValue: 10,
            duration: 100,
            useNativeDriver: true,
          }),
          Animated.timing(shakeAnim, {
            toValue: 0,
            duration: 100,
            useNativeDriver: true,
          }),
        ]).start();
      });
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: MODAL_HEIGHT,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, fadeAnim, translateY, shakeAnim]);

  const handleRetry = () => {
    onClose();
    if (onRetry) {
      setTimeout(() => onRetry(), 300);
    }
  };

  const handleContactSupport = () => {
    onClose();
    if (onContactSupport) {
      onContactSupport();
    }
  };

  const handleGoHome = () => {
    onClose();
    router.push("/");
  };

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <TouchableWithoutFeedback onPress={onClose}>
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
            backgroundColor: "#f5f5f5",
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingBottom: bottomOffset,
            transform: [{ translateY }],
          }}
        >
          <View className="px-6 pt-6 pb-4">
            {/* Error Icon */}
            <Animated.View
              style={{
                alignItems: "center",
                marginBottom: 20,
                transform: [{ translateX: shakeAnim }],
              }}
            >
              <View className="bg-red-100 p-6 rounded-full mb-4">
                <AlertCircle size={64} color="#ef4444" strokeWidth={2} />
              </View>
              <Text className="text-light-matte-black font-bold text-2xl mb-2">
                Payment Failed
              </Text>
              <Text className="text-light-matte-black/60 text-center text-sm px-4">
                We couldn't complete your payment. Please try again.
              </Text>
            </Animated.View>

            {/* Error Details */}
            <View className="bg-white rounded-2xl p-4 mb-4 shadow-sm">
              <Text className="text-light-matte-black font-bold text-base mb-2">
                Error Details
              </Text>
              <View className="bg-red-50 border border-red-200 rounded-xl p-3">
                <Text className="text-red-700 text-sm">
                  {errorMessage}
                </Text>
              </View>
            </View>

            {/* Action Buttons */}
            <View className="space-y-3">
              {onRetry && (
                <Pressable
                  className="bg-light-primary-red p-4 rounded-full shadow-md"
                  onPress={handleRetry}
                >
                  <View className="flex-row items-center justify-center">
                    <RefreshCw size={20} color="#ffffff" strokeWidth={2} />
                    <Text className="text-white font-bold text-base ml-2">
                      Try Again
                    </Text>
                  </View>
                </Pressable>
              )}

              <Pressable
                className="bg-light-main-container p-4 rounded-full"
                onPress={handleContactSupport}
              >
                <View className="flex-row items-center justify-center">
                  <MessageCircle size={20} color="#c71c4b" strokeWidth={2} />
                  <Text className="text-light-primary-red font-bold text-base ml-2">
                    Contact Support
                  </Text>
                </View>
              </Pressable>

              <Pressable
                className="bg-light-main-container p-4 rounded-full"
                onPress={handleGoHome}
              >
                <View className="flex-row items-center justify-center">
                  <Home size={20} color="#c71c4b" strokeWidth={2} />
                  <Text className="text-light-matte-black/70 font-medium text-base ml-2">
                    Back to Home
                  </Text>
                </View>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

