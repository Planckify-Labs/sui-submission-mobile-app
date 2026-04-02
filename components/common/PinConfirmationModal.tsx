import { Delete } from "lucide-react-native";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
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
import { usePin } from "@/hooks/usePin";
import PinSetupModal from "./PinSetupModal";

interface PinConfirmationModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (pin: string) => void;
  title?: string;
  pinLength?: number;
  panResponder?: any;
}

const PinConfirmationModal: React.FC<PinConfirmationModalProps> = ({
  visible,
  onClose,
  onConfirm,
  title = "Confirm with PIN",
  pinLength = 4,
  panResponder: externalPanResponder,
}) => {
  const { bottom } = useSafeAreaInsets();
  const bottomOffset = Platform.OS === "ios" ? 16 : bottom > 0 ? bottom : 0;

  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [setupModalVisible, setSetupModalVisible] = useState(false);

  const { hasPin, isLoading, verifyPin, setPin: savePin } = usePin();

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

  const panResponderConfig = useMemo(
    () => ({
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
    [animateCloseModal, translateY],
  );

  const internalPanResponder = useRef(
    PanResponder.create(panResponderConfig),
  ).current;

  const activePanResponder = externalPanResponder || internalPanResponder;

  useEffect(() => {
    if (visible && !hasAnimatedIn.current) {
      setPin("");
      setError("");

      if (!isLoading && !hasPin) {
        setSetupModalVisible(true);
      }
      animateOpenModal();
    } else if (!visible) {
      fadeAnim.setValue(0);
      translateY.setValue(300);
      hasAnimatedIn.current = false;
    }
  }, [
    visible,
    isLoading,
    hasPin,
    animateOpenModal,
    fadeAnim.setValue,
    translateY.setValue,
  ]);

  const handlePinDigit = async (digit: string) => {
    if (pin.length >= pinLength) return;

    const newPin = pin + digit;
    setPin(newPin);
    setError("");

    if (newPin.length === pinLength) {
      const isValid = await verifyPin(newPin);
      if (isValid) {
        onConfirm(newPin);
      } else {
        setError("Incorrect PIN. Please try again.");
        setPin("");
      }
    }
  };

  const handleDelete = () => {
    if (pin.length > 0) {
      setPin((prev) => prev.slice(0, -1));
    }
  };

  const handleSetupComplete = async (newPin: string) => {
    try {
      await savePin(newPin);
      setSetupModalVisible(false);
    } catch (error) {
      console.error("Failed to save PIN:", error);
      setError("Failed to save PIN. Please try again.");
    }
  };

  const renderPinDots = () => {
    const dots = [];
    for (let i = 0; i < pinLength; i++) {
      dots.push(
        <View
          key={i}
          className={`h-4 w-4 rounded-full mx-2 ${
            i < pin.length ? "bg-light-primary-red" : "bg-light-matte-black/20"
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
      <View
        key={rowIndex}
        className="flex-row justify-around flex-1 my-2 gap-2"
      >
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

  if (isLoading) {
    return null;
  }

  return (
    <>
      <Modal
        transparent
        visible={visible && hasPin}
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
              {...activePanResponder.panHandlers}
              className="w-full items-center pt-4 pb-2"
            >
              <View className="w-12 h-1 bg-gray-300 rounded-full" />
            </View>

            <View className="px-6 flex-1">
              <View className="flex-row items-center justify-between mb-6">
                <Text className="text-light-matte-black text-xl font-bold">
                  {title}
                </Text>
                <Pressable
                  onPress={animateCloseModal}
                  className="bg-light-main-container p-2 rounded-full"
                >
                  <Text className="text-light-primary-red font-bold">✕</Text>
                </Pressable>
              </View>

              <View className="bg-white rounded-3xl p-6 shadow-sm mb-5">
                <Text className="text-light-matte-black/70 mb-6 text-center">
                  Please enter your PIN to confirm this transaction
                </Text>

                <View className="flex-row justify-center items-center mb-6">
                  {renderPinDots()}
                </View>

                {error ? (
                  <Text className="text-light-primary-red mb-4 text-center">
                    {error}
                  </Text>
                ) : null}

                <View className="items-center">{renderNumberPad()}</View>
              </View>
            </View>
          </Animated.View>
        </View>
      </Modal>

      <PinSetupModal
        visible={visible && !hasPin && setupModalVisible}
        onClose={onClose}
        onSetupComplete={handleSetupComplete}
        pinLength={pinLength}
      />
    </>
  );
};

export default PinConfirmationModal;
