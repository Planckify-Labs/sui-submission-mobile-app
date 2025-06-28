import { TToken } from "@/api/types/token";
import { useTokens } from "@/hooks/queries/useTokens";
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
  ActivityIndicator,
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

interface TokenSelectorModalProps {
  visible: boolean;
  onClose: () => void;
  selectedToken?: TToken;
  onSelectToken: (token: TToken) => void;
  title?: string;
  panResponder?: any;
  stablecoinsOnly?: boolean;
  blockchainId?: string;
}

const TokenSelectorModal = memo(function TokenSelectorModal({
  visible,
  onClose,
  selectedToken,
  onSelectToken,
  title = "Select Token",
  panResponder: externalPanResponder,
  stablecoinsOnly = false,
  blockchainId,
}: TokenSelectorModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(300)).current;

  const {
    data: tokens,
    isLoading,
    error,
  } = useTokens({
    blockchainId,
    isStablecoin: stablecoinsOnly ? true : undefined,
    isActive: true,
  });

  const filteredTokens = useMemo(() => {
    if (!tokens) return [];
    if (!searchQuery) return tokens;

    const lowerQuery = searchQuery.toLowerCase();
    return tokens.filter(
      (token) =>
        token.symbol.toLowerCase().includes(lowerQuery) ||
        token.name.toLowerCase().includes(lowerQuery),
    );
  }, [tokens, searchQuery]);

  const resetAnimation = useCallback(() => {
    fadeAnim.setValue(0);
    translateY.setValue(300);
  }, []);

  const animateIn = useCallback(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 0,
      }),
    ]).start();
  }, []);

  const animateOut = useCallback(() => {
    return new Promise<void>((resolve) => {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 300,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        resetAnimation();
        resolve();
      });
    });
  }, [resetAnimation]);

  useEffect(() => {
    if (visible) {
      animateIn();
    }
  }, [visible, animateIn]);

  useEffect(() => {
    if (visible && tokens && tokens.length > 0) {
      if (
        selectedToken &&
        tokens.some((token) => token.id === selectedToken.id)
      ) {
        return;
      }

      onSelectToken(tokens[0]);
    }
  }, [visible, tokens, selectedToken?.id, onSelectToken]);

  const handleClose = useCallback(async () => {
    await animateOut();
    onClose();
  }, [animateOut, onClose]);

  const handleTokenSelect = useCallback(
    (token: TToken) => {
      onSelectToken(token);
    },
    [onSelectToken],
  );

  const panResponderConfig = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderMove: (_: any, gestureState: { dy: number }) => {
          if (gestureState.dy > 0) {
            translateY.setValue(gestureState.dy);
          }
        },
        onPanResponderRelease: (_: any, gestureState: { dy: number }) => {
          if (gestureState.dy > 100) {
            handleClose();
          } else {
            Animated.spring(translateY, {
              toValue: 0,
              useNativeDriver: true,
            }).start();
          }
        },
      }),
    [handleClose],
  );

  const activePanResponder = externalPanResponder || panResponderConfig;

  const overlayStyle = useMemo(
    (): Animated.WithAnimatedValue<ViewStyle> => ({
      flex: 1,
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      opacity: fadeAnim,
    }),
    [],
  );

  const modalContainerStyle = useMemo(
    (): Animated.WithAnimatedValue<ViewStyle> => ({
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
    }),
    [],
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
    [searchQuery, setSearchQuery],
  );

  const renderTokenItem = useCallback(
    (token: TToken) => {
      const isSelected = selectedToken?.id === token.id;

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
          key={token.id}
          onPress={() => handleTokenSelect(token)}
          activeOpacity={0.7}
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
            <Text className="text-light-matte-black/60 text-xs">
              {token.isStablecoin ? "Stablecoin" : "Token"}
            </Text>
          </View>
        </TouchableOpacity>
      );
    },
    [selectedToken?.id, handleTokenSelect],
  );

  if (!visible) return null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={handleClose}
    >
      <View style={{ flex: 1 }}>
        <TouchableWithoutFeedback onPress={handleClose}>
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
                onPress={handleClose}
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
                  {isLoading ? (
                    <View className="items-center justify-center py-8">
                      <ActivityIndicator color="#c71c4b" />
                      <Text className="text-light-matte-black/60 mt-2">
                        Loading tokens...
                      </Text>
                    </View>
                  ) : error ? (
                    <View className="items-center justify-center py-8">
                      <Text className="text-light-primary-red text-center">
                        Error loading tokens. Please try again.
                      </Text>
                    </View>
                  ) : filteredTokens.length === 0 ? (
                    <View className="items-center justify-center py-8">
                      <Text className="text-light-matte-black/60 text-center">
                        {searchQuery
                          ? "No tokens found matching your search"
                          : stablecoinsOnly
                            ? "No stablecoins available for this blockchain"
                            : "No tokens available"}
                      </Text>
                    </View>
                  ) : (
                    filteredTokens.map((token) => renderTokenItem(token))
                  )}
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
