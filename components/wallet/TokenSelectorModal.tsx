import { Search } from "lucide-react-native";
import React, {
  memo,
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
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  ViewStyle,
} from "react-native";

type Token = {
  symbol: string;
  name: string;
  balance: string;
};

interface TokenSelectorModalProps {
  visible: boolean;
  onClose: () => void;
  tokens: Token[];
  selectedToken: Token;
  onSelectToken: (token: Token) => void;
  title: string;
  panResponder?: any;
}

const TokenSelectorModal = memo(function TokenSelectorModal({
  visible,
  onClose,
  tokens,
  selectedToken,
  onSelectToken,
  title = "Select Token",
  panResponder: externalPanResponder,
}: TokenSelectorModalProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const fadeAnim = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const translateY = useRef(new Animated.Value(visible ? 0 : 300)).current;
  const hasAnimatedIn = useRef(visible);

  const filteredTokens = useMemo(() => {
    if (!searchQuery) return tokens;
    const lowerQuery = searchQuery.toLowerCase();
    return tokens.filter(
      (token) =>
        token.symbol.toLowerCase().includes(lowerQuery) ||
        token.name.toLowerCase().includes(lowerQuery),
    );
  }, [tokens, searchQuery]);

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
      setModalVisible(false);
      onClose();
    });
  }, [fadeAnim, translateY, onClose]);

  const panResponderConfig = useRef(
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

  const activePanResponder = externalPanResponder || panResponderConfig;

  useEffect(() => {
    if (visible && !hasAnimatedIn.current) {
      setModalVisible(true);
      animateOpenModal();
    } else if (!visible) {
      fadeAnim.setValue(0);
      translateY.setValue(300);
      hasAnimatedIn.current = false;
    }
  }, [visible, animateOpenModal]);

  const overlayStyle = useMemo(
    (): Animated.WithAnimatedValue<ViewStyle> => ({
      flex: 1,
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      opacity: fadeAnim,
    }),
    [fadeAnim],
  );

  const modalContainerStyle = useMemo(
    (): Animated.WithAnimatedValue<ViewStyle> => ({
      position: "absolute" as const,
      bottom: 0,
      left: 0,
      right: 0,
      height: "auto" as const,
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
    }),
    [fadeAnim, translateY],
  );

  const SearchInput = useMemo(
    () => (
      <View className="bg-light-main-container rounded-xl mb-4 flex-row items-center px-4 py-2">
        <Search size={20} color="#666" />
        <TextInput
          className="flex-1 ml-2 text-light-matte-black"
          placeholder="Search tokens"
          placeholderTextColor="#666"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>
    ),
    [searchQuery],
  );

  const renderTokenItem = useCallback(
    (token: Token) => {
      const isSelected = token.symbol === selectedToken.symbol;

      const containerStyle = `flex-row items-center justify-between p-4 rounded-xl mb-2 ${
        isSelected ? "bg-light-primary-red/10" : "bg-light-main-container"
      }`;

      const iconContainerStyle = `w-10 h-10 rounded-full mr-3 items-center justify-center ${
        isSelected ? "bg-light-primary-red/20" : "bg-light-primary-red/10"
      }`;

      const symbolStyle = `font-bold text-base ${
        isSelected ? "text-light-primary-red" : "text-light-primary-red/70"
      }`;

      const nameStyle = `font-medium ${
        isSelected ? "text-light-primary-red" : "text-light-matte-black"
      }`;

      return (
        <TouchableOpacity
          key={token.symbol}
          onPress={() => onSelectToken(token)}
          className={containerStyle}
        >
          <View className="flex-row items-center">
            <View className={iconContainerStyle}>
              <Text className={symbolStyle}>{token.symbol.charAt(0)}</Text>
            </View>
            <View>
              <Text className={nameStyle}>{token.symbol}</Text>
              <Text className="text-light-matte-black/60 text-sm">
                {token.name}
              </Text>
            </View>
          </View>
          <View className="items-end">
            <Text className="text-light-matte-black font-medium">
              {token.balance}
            </Text>
            <Text className="text-light-matte-black/60 text-xs">Available</Text>
          </View>
        </TouchableOpacity>
      );
    },
    [selectedToken, onSelectToken],
  );

  if (!modalVisible) return null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={animateCloseModal}
    >
      <View style={{ flex: 1 }}>
        <TouchableWithoutFeedback onPress={animateCloseModal}>
          <Animated.View style={overlayStyle} />
        </TouchableWithoutFeedback>

        <Animated.View style={modalContainerStyle}>
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

            <View className="bg-white rounded-3xl p-6 pb-0 shadow-sm">
              {SearchInput}
              <ScrollView
                className="max-h-96"
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <View className="pb-4">
                  {filteredTokens.map((token) => renderTokenItem(token))}
                </View>
              </ScrollView>
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
});

export default TokenSelectorModal;
