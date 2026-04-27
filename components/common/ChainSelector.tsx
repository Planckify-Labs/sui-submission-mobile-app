import { Check, ChevronDown, Search, X } from "lucide-react-native";
import React, {
  forwardRef,
  memo,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
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
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import SingleLoadingSekeleton from "@/components/common/SingleLoadingSekeleton";
import type { ChainConfig } from "@/constants/configs/chainConfig";
import { useTokens } from "@/hooks/queries/useTokens";
import { useBlockchainsWithStorage } from "@/hooks/useBlockchainsWithStorage";
import { useWallet } from "@/hooks/useWallet";
import { buildChainConfigFromBlockchain } from "@/hooks/useWallet.helpers";
import type { Namespace } from "@/services/chains/types";
import { walletKitRegistry } from "@/services/walletKit/registry";

const { height } = Dimensions.get("window");
const MODAL_HEIGHT = height * 0.67;
const SCROLL_MAX_HEIGHT = MODAL_HEIGHT - 140;

export interface ChainSelectorRef {
  open: () => void;
}

type ChainRowItem = {
  key: string;
  namespace: Namespace;
  label: string;
  symbol: string;
  iconUrl: string | undefined;
  isTestnet: boolean;
  evmChainId?: number;
  solanaCluster?: "mainnet-beta" | "devnet";
  config: ChainConfig;
};

function capitalize(ns: string): string {
  return ns.charAt(0).toUpperCase() + ns.slice(1);
}

function sectionTitleForNamespace(ns: Namespace): string {
  if (ns === "eip155") return "Ethereum";
  try {
    const kit = walletKitRegistry.get(ns);
    return kit.displayName ?? capitalize(ns);
  } catch {
    return capitalize(ns);
  }
}

function sortWithinGroup<T extends { isTestnet: boolean }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.isTestnet === b.isTestnet) return 0;
    return a.isTestnet ? 1 : -1;
  });
}

function ChainRowSkeleton() {
  return (
    <View className="flex-row items-center p-4 mb-2 rounded-xl bg-light">
      <SingleLoadingSekeleton
        width={24}
        height={24}
        borderRadius={12}
        style={{ marginRight: 12 }}
      />
      <View style={{ flex: 1 }}>
        <SingleLoadingSekeleton
          width="45%"
          height={14}
          style={{ marginBottom: 6 }}
        />
        <SingleLoadingSekeleton width="28%" height={12} />
      </View>
    </View>
  );
}

function ChainListSkeleton() {
  return (
    <View>
      {[0, 1].map((group) => (
        <View key={group} className="mb-2">
          <SingleLoadingSekeleton
            width={96}
            height={10}
            style={{ marginTop: 8, marginBottom: 12 }}
          />
          <ChainRowSkeleton />
          <ChainRowSkeleton />
          <ChainRowSkeleton />
        </View>
      ))}
    </View>
  );
}

const ChainSelectorBase = forwardRef<ChainSelectorRef>((_, ref) => {
  const { bottom } = useSafeAreaInsets();
  const bottomOffset = Platform.OS === "ios" ? 16 : bottom > 0 ? bottom : 0;

  const {
    activeChain,
    changeActiveChain,
    changeActiveChainToConfig,
  } = useWallet();
  const [modalVisible, setModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [switchingRowKey, setSwitchingRowKey] = useState<string | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(MODAL_HEIGHT)).current;

  const { data: blockchains, isLoading: isLoadingBlockchains } =
    useBlockchainsWithStorage({ isActive: true });

  const { data: nativeTokens, isLoading: isLoadingTokens } = useTokens({
    isNativeCurrency: true,
    isActive: true,
  });

  const isLoading = isLoadingBlockchains || isLoadingTokens;

  const grouped = useMemo<Map<Namespace, ChainRowItem[]>>(() => {
    const order: Namespace[] = walletKitRegistry
      .getAll()
      .map((kit) => kit.namespace);

    const groups = new Map<Namespace, ChainRowItem[]>();
    for (const ns of order) groups.set(ns, []);

    if (blockchains && nativeTokens) {
      for (const blockchain of blockchains) {
        const token =
          blockchain.tokens?.find((t) => t.isNativeCurrency) ??
          blockchain.tokens?.[0];
        const config = buildChainConfigFromBlockchain(blockchain);
        const row: ChainRowItem =
          config.namespace === "eip155"
            ? {
                key: `eip155:${blockchain.chainId ?? "unknown"}`,
                namespace: "eip155",
                label: blockchain.name,
                symbol: token?.symbol ?? "",
                iconUrl: token?.logoUrl ?? undefined,
                isTestnet: Boolean(config.isTestnet),
                evmChainId: blockchain.chainId ?? undefined,
                config,
              }
            : {
                key: `solana:${config.cluster}`,
                namespace: "solana",
                label: blockchain.name,
                symbol: token?.symbol ?? "",
                iconUrl: token?.logoUrl ?? config.iconUrl,
                isTestnet: Boolean(config.isTestnet),
                solanaCluster: config.cluster,
                config,
              };
        const bucket = groups.get(row.namespace);
        if (bucket) bucket.push(row);
        else groups.set(row.namespace, [row]);
      }
    }

    const final = new Map<Namespace, ChainRowItem[]>();
    for (const [ns, rows] of groups) {
      if (rows.length === 0) continue;
      final.set(ns, sortWithinGroup(rows));
    }
    return final;
  }, [blockchains, nativeTokens]);

  const filteredGrouped = useMemo<Map<Namespace, ChainRowItem[]>>(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length === 0) return grouped;
    const out = new Map<Namespace, ChainRowItem[]>();
    for (const [ns, rows] of grouped) {
      const hits = rows.filter(
        (r) =>
          r.label.toLowerCase().includes(q) ||
          r.symbol.toLowerCase().includes(q),
      );
      if (hits.length > 0) out.set(ns, hits);
    }
    return out;
  }, [grouped, searchQuery]);

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
      setModalVisible(false);
      setSearchQuery("");
    });
  }, [fadeAnim, translateY]);

  const handleChainSelect = useCallback(
    async (row: ChainRowItem) => {
      setSwitchingRowKey(row.key);

      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );

      try {
        if (row.namespace === "eip155" && typeof row.evmChainId === "number") {
          await changeActiveChain(row.evmChainId);
        } else {
          await changeActiveChainToConfig(row.config);
        }
      } finally {
        setSwitchingRowKey(null);
        closeModal();
      }
    },
    [changeActiveChain, changeActiveChainToConfig, closeModal],
  );

  const openModal = useCallback(() => {
    setModalVisible(true);
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
  }, [fadeAnim, translateY]);

  useImperativeHandle(ref, () => ({ open: openModal }), [openModal]);

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

  const isRowActive = useCallback(
    (row: ChainRowItem): boolean => {
      if (row.namespace === "eip155" && activeChain.namespace === "eip155") {
        return activeChain.chain.id === row.evmChainId;
      }
      if (row.namespace === "solana" && activeChain.namespace === "solana") {
        return activeChain.cluster === row.solanaCluster;
      }
      return false;
    },
    [activeChain],
  );

  const renderChainItem = useCallback(
    (row: ChainRowItem) => {
      const isActive = isRowActive(row);
      const isThisSwitching = switchingRowKey === row.key;
      const isAnySwitching = switchingRowKey !== null;

      return (
        <Pressable
          key={row.key}
          className={`flex-row items-center p-4 mb-2 rounded-xl ${
            isActive ? "bg-light-primary-red/10" : "bg-light"
          } ${isAnySwitching && !isThisSwitching ? "opacity-40" : ""}`}
          onPress={() => {
            if (isAnySwitching) return;
            handleChainSelect(row);
          }}
        >
          <Image
            source={{ uri: row.iconUrl }}
            style={{ width: 24, height: 24 }}
            className="mr-3 rounded-full"
            defaultSource={require("@/assets/images/takumipay-logo.png")}
          />

          <View className="flex-1">
            <Text className="text-light-matte-black font-bold">
              {row.label}
            </Text>
            <Text className="text-light-matte-black/70 text-sm">
              {isThisSwitching ? "Switching…" : row.symbol || "N/A"}
            </Text>
          </View>

          {row.isTestnet && !isThisSwitching && (
            <View className="bg-yellow-500/20 px-2 py-1 rounded-full mr-2">
              <Text className="text-yellow-700 text-xs font-medium">
                Testnet
              </Text>
            </View>
          )}

          {isThisSwitching ? (
            <ActivityIndicator size="small" color="#c71c4b" />
          ) : isActive ? (
            <View className="w-6 h-6 rounded-full bg-light-primary-red/10 items-center justify-center">
              <Check size={14} color="#c71c4b" strokeWidth={3} />
            </View>
          ) : null}
        </Pressable>
      );
    },
    [isRowActive, handleChainSelect, switchingRowKey],
  );

  const activeLabel =
    activeChain.namespace === "eip155"
      ? activeChain.chain.name
      : `Solana ${activeChain.cluster === "devnet" ? "Devnet" : "Mainnet"}`;

  return (
    <>
      <Pressable
        onPress={openModal}
        className="flex-row items-center bg-light-main-container px-3 py-2 rounded-full"
      >
        <Image
          source={{
            uri: activeChain.iconUrl,
          }}
          style={{ width: 20, height: 20 }}
          className="mr-2 rounded-full bg-light-matte-black/5"
          defaultSource={require("@/assets/images/takumipay-logo.png")}
        />
        <Text className="text-light-matte-black text-xs font-medium mr-2">
          {activeLabel}
        </Text>
        <ChevronDown size={16} color="#c71c4b" />
      </Pressable>

      {modalVisible && (
        <Modal
          transparent
          visible
          animationType="none"
          onRequestClose={closeModal}
        >
          <GestureHandlerRootView style={{ flex: 1 }}>
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
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                transform: [{ translateY: translateY }],
              }}
            >
              <View className="bg-light-main-container rounded-t-3xl">
                <View
                  {...panResponder.panHandlers}
                  className="w-full items-center pt-4 pb-2"
                >
                  <View className="w-12 h-1 bg-gray-300 rounded-full" />
                </View>

                <View className="px-6">
                  <View className="flex-row justify-between items-center mb-4">
                    <Text className="text-light-matte-black text-xl font-bold">
                      Select Network
                    </Text>

                    <Pressable
                      onPress={closeModal}
                      hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                    >
                      <X size={18} color="#c71c4b" />
                    </Pressable>
                  </View>

                  <View className="flex-row items-center bg-light rounded-2xl px-3 py-2 mb-3">
                    <Search size={16} color="#20222c80" />
                    <TextInput
                      value={searchQuery}
                      onChangeText={setSearchQuery}
                      placeholder="Search networks"
                      placeholderTextColor="#20222c80"
                      autoCorrect={false}
                      autoCapitalize="none"
                      className="flex-1 ml-2 text-light-matte-black"
                    />
                    {searchQuery.length > 0 && (
                      <Pressable onPress={() => setSearchQuery("")}>
                        <X size={14} color="#20222c80" />
                      </Pressable>
                    )}
                  </View>

                  <ScrollView
                    style={{ maxHeight: SCROLL_MAX_HEIGHT }}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: 24 }}
                  >
                    {isLoading ? (
                      <ChainListSkeleton />
                    ) : filteredGrouped.size === 0 ? (
                      <View className="items-center justify-center py-8">
                        <Text className="text-light-matte-black/60 text-sm">
                          No networks match "{searchQuery}"
                        </Text>
                      </View>
                    ) : (
                      Array.from(filteredGrouped.entries()).map(
                        ([ns, rows]) => (
                          <View key={ns} className="mb-2">
                            <Text className="text-light-matte-black/60 text-xs font-semibold uppercase mb-2 mt-2">
                              {sectionTitleForNamespace(ns)}
                            </Text>
                            {rows.map(renderChainItem)}
                          </View>
                        ),
                      )
                    )}
                  </ScrollView>
                </View>
              </View>
            </Animated.View>
          </GestureHandlerRootView>
        </Modal>
      )}
    </>
  );
});

const ChainSelector = memo(ChainSelectorBase);

export default ChainSelector;
