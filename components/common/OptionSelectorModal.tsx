import { Check, X } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { queryClient } from "@/app/_layout";
import useRQGlobalState from "@/hooks/useRQGlobalState";

interface OptionSelectorModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (option: string) => void;
  title: string;
  options: string[];
  selectedOption?: string;
  stateKey?: string;
  clearOnClose?: boolean;
}

const OptionSelectorModal: React.FC<OptionSelectorModalProps> = ({
  visible,
  onClose,
  onSelect,
  title,
  options,
  selectedOption: propSelectedOption,
  stateKey,
  clearOnClose = false,
}) => {
  const { bottom } = useSafeAreaInsets();
  const bottomOffset = Platform.OS === "ios" ? 16 : bottom > 0 ? bottom : 0;

  const fadeAnim = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const translateY = useRef(new Animated.Value(visible ? 0 : 300)).current;
  const hasAnimatedIn = useRef(visible);

  const { data: globalSelectedOption, setNewData: setGlobalSelectedOption } =
    useRQGlobalState<string | undefined>({
      queryKey: stateKey
        ? ["option-selector", stateKey]
        : ["option-selector-temp"],
      initialData: propSelectedOption,
    });

  const selectedOption = stateKey ? globalSelectedOption : propSelectedOption;

  useEffect(() => {
    return () => {
      if (stateKey) {
        queryClient.removeQueries({
          queryKey: ["option-selector", stateKey],
        });
      }
    };
  }, [stateKey]);

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
    ]).start(() => {
      onClose();

      if (clearOnClose && stateKey) {
        queryClient.removeQueries({
          queryKey: ["option-selector", stateKey],
        });
      }
    });
  }, [fadeAnim, translateY, onClose, clearOnClose, stateKey]);

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

  const panResponder = useRef(PanResponder.create(panResponderConfig)).current;

  useEffect(() => {
    if (visible && !hasAnimatedIn.current) {
      animateOpenModal();
    } else if (!visible) {
      fadeAnim.setValue(0);
      translateY.setValue(300);
      hasAnimatedIn.current = false;
    }
  }, [visible, animateOpenModal, fadeAnim, translateY]);

  const handleSelect = (option: string) => {
    if (stateKey) {
      setGlobalSelectedOption(option);
    }

    onSelect(option);
    animateCloseModal();
  };

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
            maxHeight: "70%",
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

          <View className="px-6 pb-6">
            <View className="flex-row items-center justify-between mb-6">
              <Text className="text-light-matte-black text-xl font-bold">
                {title}
              </Text>
              <Pressable
                onPress={animateCloseModal}
                className="bg-light-main-container p-2 rounded-full"
              >
                <X size={20} color="#c71c4b" />
              </Pressable>
            </View>

            <ScrollView className="max-h-[400px]">
              <View className="gap-2">
                {options.map((option) => (
                  <TouchableOpacity
                    key={option}
                    className={`flex-row items-center justify-between p-4 bg-light rounded-xl ${
                      selectedOption === option ? "bg-light-primary-red/5" : ""
                    }`}
                    onPress={() => handleSelect(option)}
                  >
                    <Text
                      className={`text-lg ${
                        selectedOption === option
                          ? "text-light-primary-red font-medium"
                          : "text-light-matte-black"
                      }`}
                    >
                      {option}
                    </Text>
                    {selectedOption === option && (
                      <Check size={20} color="#c71c4b" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

export default OptionSelectorModal;
