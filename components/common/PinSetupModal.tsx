import { Delete, Lock, Shield } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Modal,
  Pressable,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";

interface PinSetupModalProps {
  visible: boolean;
  onClose: () => void;
  onSetupComplete: (pin: string) => void;
  pinLength?: number;
}

const PinSetupModal: React.FC<PinSetupModalProps> = ({
  visible,
  onClose,
  onSetupComplete,
  pinLength = 4,
}) => {
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [step, setStep] = useState<"intro" | "create" | "confirm">("intro");
  const [error, setError] = useState("");

  const fadeAnim = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const translateY = useRef(new Animated.Value(visible ? 0 : 300)).current;
  const hasAnimatedIn = useRef(visible);

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

  useEffect(() => {
    if (visible && !hasAnimatedIn.current) {
      setPin("");
      setConfirmPin("");
      setStep("intro");
      setError("");
      animateOpenModal();
    } else if (!visible) {
      fadeAnim.setValue(0);
      translateY.setValue(300);
      hasAnimatedIn.current = false;
    }
  }, [visible, animateOpenModal, fadeAnim.setValue, translateY.setValue]);

  const handlePinDigit = (digit: string) => {
    if (step === "create") {
      if (pin.length < pinLength) {
        setPin((prev) => prev + digit);
        setError("");

        if (pin.length === pinLength - 1) {
          setTimeout(() => {
            setStep("confirm");
          }, 300);
        }
      }
    } else if (step === "confirm") {
      if (confirmPin.length < pinLength) {
        setConfirmPin((prev) => prev + digit);
        setError("");
      }
    }
  };

  const handleDelete = () => {
    if (step === "create" && pin.length > 0) {
      setPin((prev) => prev.slice(0, -1));
    } else if (step === "confirm" && confirmPin.length > 0) {
      setConfirmPin((prev) => prev.slice(0, -1));
    }
  };

  const handleConfirm = () => {
    if (step === "intro") {
      setStep("create");
      return;
    }

    if (step === "create") {
      if (pin.length < pinLength) {
        setError(`PIN must be ${pinLength} digits`);
        return;
      }
      setStep("confirm");
    } else {
      if (confirmPin.length < pinLength) {
        setError(`PIN must be ${pinLength} digits`);
        return;
      }

      if (pin !== confirmPin) {
        setError("PINs don't match. Please try again.");
        setConfirmPin("");
        return;
      }

      onSetupComplete(pin);
    }
  };

  const renderPinDots = () => {
    const currentPin = step === "create" ? pin : confirmPin;
    const dots = [];
    for (let i = 0; i < pinLength; i++) {
      dots.push(
        <View
          key={i}
          className={`h-4 w-4 rounded-full mx-2 ${
            i < currentPin.length
              ? "bg-light-primary-red"
              : "bg-light-matte-black/20"
          }`}
        />,
      );
    }
    return dots;
  };

  const renderNumberPad = () => {
    const numbers = [
      ["1", "2", "3"],
      ["4", "5", "6"],
      ["7", "8", "9"],
      ["", "0", "delete"],
    ];

    return numbers.map((row, rowIndex) => (
      <View key={rowIndex} className="flex-row justify-around w-full my-2">
        {row.map((num, colIndex) => {
          if (num === "") {
            return <View key={colIndex} className="w-16 h-16" />;
          }

          if (num === "delete") {
            return (
              <TouchableOpacity
                key={colIndex}
                className="w-16 h-16 rounded-full justify-center items-center"
                onPress={handleDelete}
              >
                <Delete size={24} color="#c71c4b" />
              </TouchableOpacity>
            );
          }

          return (
            <TouchableOpacity
              key={colIndex}
              className="w-16 h-16 rounded-full bg-light-main-container justify-center items-center"
              onPress={() => handlePinDigit(num)}
            >
              <Text className="text-light-matte-black text-2xl font-medium">
                {num}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    ));
  };

  const renderIntroScreen = () => (
    <View className="bg-white rounded-3xl p-6 shadow-sm mb-5">
      <View className="items-center mb-6">
        <View className="bg-light-primary-red/10 p-4 rounded-full mb-4">
          <Lock size={40} color="#c71c4b" />
        </View>
        <Text className="text-light-matte-black text-xl font-bold mb-2">
          Security First
        </Text>
        <Text className="text-light-matte-black/70 text-center">
          You need to set up a PIN before making transactions
        </Text>
      </View>

      <View className="bg-light-primary-red/10 p-4 rounded-xl mb-6">
        <Text className="text-light-matte-black/80 text-sm mb-3 font-medium">
          Why is this important?
        </Text>
        <View className="flex-row items-start mb-2">
          <Shield size={16} color="#c71c4b" className="mr-2 mt-0.5" />
          <Text className="text-light-matte-black/70 text-sm flex-1">
            Protects your wallet from unauthorized access
          </Text>
        </View>
        <View className="flex-row items-start mb-2">
          <Shield size={16} color="#c71c4b" className="mr-2 mt-0.5" />
          <Text className="text-light-matte-black/70 text-sm flex-1">
            Adds an extra layer of security for all transactions
          </Text>
        </View>
        <View className="flex-row items-start">
          <Shield size={16} color="#c71c4b" className="mr-2 mt-0.5" />
          <Text className="text-light-matte-black/70 text-sm flex-1">
            Prevents accidental or unauthorized transfers
          </Text>
        </View>
      </View>
    </View>
  );

  const renderCreatePinScreen = () => (
    <View className="bg-white rounded-3xl p-6 shadow-sm mb-5">
      <Text className="text-light-matte-black/70 mb-6 text-center">
        Please create a PIN to secure your wallet
      </Text>

      <View className="flex-row justify-center items-center mb-6">
        {renderPinDots()}
      </View>

      {error ? (
        <Text className="text-light-primary-red mb-4 text-center">{error}</Text>
      ) : null}

      <View className="items-center">{renderNumberPad()}</View>
    </View>
  );

  const renderConfirmPinScreen = () => (
    <View className="bg-white rounded-3xl p-6 shadow-sm mb-5">
      <Text className="text-light-matte-black/70 mb-6 text-center">
        Please confirm your PIN
      </Text>

      <View className="flex-row justify-center items-center mb-6">
        {renderPinDots()}
      </View>

      {error ? (
        <Text className="text-light-primary-red mb-4 text-center">{error}</Text>
      ) : null}

      <View className="items-center">{renderNumberPad()}</View>
    </View>
  );

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
          <View className="w-full items-center pt-4 pb-2">
            <View className="w-12 h-1 bg-gray-300 rounded-full" />
          </View>

          <View className="px-6 flex-1">
            <View className="flex-row items-center justify-between mb-6">
              <Text className="text-light-matte-black text-xl font-bold">
                {step === "intro"
                  ? "Security Setup"
                  : step === "create"
                    ? "Create PIN"
                    : "Confirm PIN"}
              </Text>
              <Pressable
                onPress={animateCloseModal}
                className="bg-light-main-container p-2 rounded-full"
              >
                <Text className="text-light-primary-red font-bold">✕</Text>
              </Pressable>
            </View>

            {step === "intro" && renderIntroScreen()}
            {step === "create" && renderCreatePinScreen()}
            {step === "confirm" && renderConfirmPinScreen()}

            <Pressable
              className={`bg-light-primary-red py-4 rounded-xl items-center ${
                (step === "create" && pin.length < pinLength) ||
                (step === "confirm" && confirmPin.length < pinLength)
                  ? "opacity-50"
                  : ""
              }`}
              onPress={handleConfirm}
              disabled={
                (step === "create" && pin.length < pinLength) ||
                (step === "confirm" && confirmPin.length < pinLength)
              }
            >
              <Text className="text-white font-bold">
                {step === "intro"
                  ? "Set Up PIN"
                  : step === "create"
                    ? "Next"
                    : "Confirm"}
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

export default PinSetupModal;
