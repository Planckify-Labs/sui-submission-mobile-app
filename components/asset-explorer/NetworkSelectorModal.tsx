import { Check, Search, Star, X } from "lucide-react-native";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Dimensions,
  Image,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBlockchains } from "@/hooks/queries/useBlockchains";
import { useActiveNetwork } from "@/hooks/useAssetExplorerState";
import { useNetworkModal } from "@/hooks/useNetworkModal";
import { usePinnedNetworks } from "@/hooks/usePinnedNetworks";
import NetworkSelectorModalLoadingSkeletons from "./NetworkSelectorModalLoadingSkeletons";

const { height } = Dimensions.get("window");
const MODAL_HEIGHT = height * 0.67;

const NetworkSelectorModal = () => {
  const { bottom } = useSafeAreaInsets();
  const bottomOffset = Platform.OS === "ios" ? 16 : bottom > 0 ? bottom : 0;

  const { isVisible, searchQuery, setSearchQuery, closeModal } =
    useNetworkModal();
  const { activeNetwork, selectNetwork } = useActiveNetwork();
  const { data: blockchains, isLoading } = useBlockchains({ isActive: true });
  const { isPinned, togglePin } = usePinnedNetworks();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(MODAL_HEIGHT)).current;

  useEffect(() => {
    if (isVisible) {
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
    } else {
      fadeAnim.setValue(0);
      translateY.setValue(MODAL_HEIGHT);
    }
  }, [isVisible, fadeAnim, translateY]);

  const handleClose = () => {
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
    ]).start(() => {
      closeModal();
    });
  };

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
          handleClose();
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

  const displayNetworks = React.useMemo(() => {
    if (!blockchains) return [];

    const networks = blockchains.map((blockchain) => ({
      id: blockchain.chainId.toString(),
      name: blockchain.name,
      symbol: blockchain.tokens?.[0]?.symbol,
      color: "#627EEA",
      isPinned: true,
      blockchainId: blockchain.id,
      logoUrl: blockchain.tokens?.[0]?.logoUrl || "",
    }));

    if (!searchQuery) return networks;

    return networks.filter(
      (network) =>
        network.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        network.symbol?.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [blockchains, searchQuery]);

  if (!isVisible) return null;

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
    >
      <TouchableWithoutFeedback onPress={handleClose}>
        <Animated.View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            opacity: fadeAnim,
          }}
        >
          <TouchableWithoutFeedback>
            <Animated.View
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: MODAL_HEIGHT,
                paddingBottom: bottomOffset,
                backgroundColor: "#f5f6f9",
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                transform: [{ translateY: translateY }],
                shadowColor: "#000",
                shadowOffset: { width: 0, height: -3 },
                shadowOpacity: 0.1,
                shadowRadius: 10,
                elevation: 10,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <View
                {...panResponder.panHandlers}
                className="w-full items-center pt-4 pb-2"
              >
                <View className="w-12 h-1 bg-gray-300 rounded-full" />
              </View>

              <View className="flex-1 px-5 pb-6">
                <View className="flex-row justify-between items-center mb-5">
                  <Text className="text-xl font-bold text-light-matte-black">
                    Networks
                  </Text>
                  <Pressable
                    onPress={handleClose}
                    className="w-8 h-8 rounded-full bg-light-primary-red/10 items-center justify-center"
                  >
                    <X size={18} color="#c71c4b" />
                  </Pressable>
                </View>

                <View className="flex-row items-center rounded-xl px-3 h-12 bg-light">
                  <Search size={18} color="#20222c60" />
                  <TextInput
                    className="flex-1 px-3 py-3 text-light-matte-black text-base"
                    placeholder="Search networks..."
                    placeholderTextColor="#20222c60"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                  />
                  {searchQuery.length > 0 && (
                    <Pressable
                      onPress={() => setSearchQuery("")}
                      className="bg-gray-200/70 rounded-full w-5 h-5 items-center justify-center"
                    >
                      <X size={12} color="#20222c" />
                    </Pressable>
                  )}
                </View>

                <ScrollView
                  className="flex-1"
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingTop: 10 }}
                >
                  {isLoading ? (
                    <View className="items-center justify-center">
                      <NetworkSelectorModalLoadingSkeletons count={5} />
                    </View>
                  ) : displayNetworks.length === 0 ? (
                    <View className="items-center justify-center py-10">
                      <Text className="text-light-matte-black/70 font-medium">
                        No networks found
                      </Text>
                    </View>
                  ) : (
                    displayNetworks.map((item) => (
                      <Pressable
                        key={item.id}
                        className={`flex-row items-center p-3.5 mb-3 rounded-xl ${activeNetwork === item.id
                          ? "bg-light-primary-red/10"
                          : "bg-light"
                          }`}
                        onPress={() => {
                          selectNetwork(item.id, item.blockchainId);
                          handleClose();
                        }}
                      >
                        <View className="flex-row items-center flex-1">
                          {item.logoUrl ? (
                            <Image
                              source={{ uri: item.logoUrl }}
                              className="w-7 h-7 rounded-full mr-3"
                              style={{ backgroundColor: "#f5f5f5" }}
                              resizeMode="contain"
                            />
                          ) : (
                            <View
                              className="w-10 h-10 rounded-full mr-3 items-center justify-center"
                              style={{
                                backgroundColor: item.color || "#627EEA",
                              }}
                            >
                              <Text className="text-white font-bold text-base">
                                {item.symbol?.charAt(0)}
                              </Text>
                            </View>
                          )}
                          <View className="flex-1">
                            <Text className="text-light-matte-black font-semibold text-base">
                              {item.name}
                            </Text>
                            <Text className="text-light-matte-black/50 text-xs">
                              {item.symbol}
                            </Text>
                          </View>
                        </View>

                        <View className="flex-row items-center">
                          {activeNetwork === item.id && (
                            <View className="w-7 h-7 rounded-full bg-light-primary-red/10 items-center justify-center mr-3">
                              <Check
                                size={16}
                                color="#c71c4b"
                                strokeWidth={2.5}
                              />
                            </View>
                          )}

                          <Pressable
                            className="p-1.5"
                            onPress={() =>
                              togglePin({
                                id: item.id,
                                name: item.name,
                                symbol: item.symbol ?? "",
                                color: item.color ?? "#627EEA",
                                blockchainId: item.blockchainId,
                                logoUrl: item.logoUrl,
                              })
                            }
                            hitSlop={{
                              top: 10,
                              bottom: 10,
                              left: 10,
                              right: 10,
                            }}
                          >
                            <Star
                              size={18}
                              color={
                                isPinned(item.id) ? "#c71c4b" : "#20222c30"
                              }
                              fill={isPinned(item.id) ? "#c71c4b" : "none"}
                            />
                          </Pressable>
                        </View>
                      </Pressable>
                    ))
                  )}
                </ScrollView>
              </View>
            </Animated.View>
          </TouchableWithoutFeedback>
        </Animated.View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

export default NetworkSelectorModal;
