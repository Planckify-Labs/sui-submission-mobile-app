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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ChainConfig } from "@/constants/configs/chainConfig";
import { useTokens } from "@/hooks/queries/useTokens";
import { useBlockchainsWithStorage } from "@/hooks/useBlockchainsWithStorage";
import { useWallet } from "@/hooks/useWallet";
import { buildChainConfigFromBlockchain } from "@/hooks/useWallet.helpers";
import type { Namespace } from "@/services/chains/types";
import { walletKitRegistry } from "@/services/walletKit/registry";

const { height } = Dimensions.get("window");
const MODAL_HEIGHT = height * 0.67;

export interface ChainSelectorRef {
  open: () => void;
}

// Shape rendered per row — unified across EVM + Solana so the row
// component stays namespace-agnostic.
type ChainRowItem = {
  key: string;
  namespace: Namespace;
  label: string;
  symbol: string;
  iconUrl: string | undefined;
  isTestnet: boolean;
  // EVM-only selection handle; Solana rows dispatch via `cluster`.
  evmChainId?: number;
  solanaCluster?: "mainnet-beta" | "devnet";
  // Underlying config for equality checks against `activeChain`.
  config: ChainConfig;
};

function capitalize(ns: string): string {
  return ns.charAt(0).toUpperCase() + ns.slice(1);
}

// Hard-coded for `eip155`: the picker surfaces the whole EVM family
// under a single "Ethereum" header (Ethereum mainnet + Polygon + BSC
// all render under it). "EVM" is accurate but developer jargon; most
// users recognise "Ethereum" — matching Phantom / Rainbow. The
// individual chain names below the header disambiguate which network
// is actually selected. For any other namespace we defer to the
// registered kit's `displayName` (e.g. Solana → "Solana"), falling
// back to a capitalised namespace literal if a namespace has chains
// but no kit registered.
function sectionTitleForNamespace(ns: Namespace): string {
  if (ns === "eip155") return "Ethereum";
  try {
    const kit = walletKitRegistry.get(ns);
    return kit.displayName ?? capitalize(ns);
  } catch {
    return capitalize(ns);
  }
}

// In-group sort: non-testnets first (stable within each partition).
function sortWithinGroup<T extends { isTestnet: boolean }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.isTestnet === b.isTestnet) return 0;
    return a.isTestnet ? 1 : -1;
  });
}

const ChainSelectorBase = forwardRef<ChainSelectorRef>((_, ref) => {
  const { bottom } = useSafeAreaInsets();
  const bottomOffset = Platform.OS === "ios" ? 16 : bottom > 0 ? bottom : 0;

  const {
    activeChain,
    changeActiveChain,
    changeActiveChainToConfig,
    warmNamespace,
  } = useWallet();
  const [modalVisible, setModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  // Per-row in-flight key — only non-null while a chain switch's
  // `await` is resolving. Drives the inline spinner on the tapped row
  // so the user sees "I'm switching to this" without a page-level
  // modal that would obscure deep-flow screens (send / deposit / etc).
  const [switchingRowKey, setSwitchingRowKey] = useState<string | null>(
    null,
  );
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(MODAL_HEIGHT)).current;

  const { data: blockchains, isLoading: isLoadingBlockchains } =
    useBlockchainsWithStorage({ isActive: true });

  const { data: nativeTokens, isLoading: isLoadingTokens } = useTokens({
    isNativeCurrency: true,
    isActive: true,
  });

  const isLoading = isLoadingBlockchains || isLoadingTokens;

  // Group rows by namespace, ordered by registry insertion order
  // (EVM-first / Solana-second per `bootWalletKits`). Any namespace
  // that has chains but no registered kit is appended at the end.
  //
  // Both EVM and Solana rows are data-driven from the backend
  // `/blockchains` feed (Solana is flagged via `isEVM: false`). The
  // same path `buildChainConfigFromBlockchain` is used so new chain
  // families pick up without a mobile release.
  const grouped = useMemo<Map<Namespace, ChainRowItem[]>>(() => {
    const order: Namespace[] = walletKitRegistry
      .getAll()
      .map((kit) => kit.namespace);

    const groups = new Map<Namespace, ChainRowItem[]>();
    for (const ns of order) groups.set(ns, []);

    if (blockchains && nativeTokens) {
      for (const blockchain of blockchains) {
        const token = blockchain.tokens?.[0];
        const config = buildChainConfigFromBlockchain(blockchain);
        const row: ChainRowItem =
          config.namespace === "eip155"
            ? {
                key: `eip155:${blockchain.chainId ?? "unknown"}`,
                namespace: "eip155",
                label: blockchain.name,
                symbol: token?.symbol ?? "",
                iconUrl: token?.logoUrl,
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

    // Re-key with sorted-in-group rows while preserving group order.
    const final = new Map<Namespace, ChainRowItem[]>();
    for (const [ns, rows] of groups) {
      if (rows.length === 0) continue;
      final.set(ns, sortWithinGroup(rows));
    }
    return final;
  }, [blockchains, nativeTokens]);

  // Filter the grouped map by search query against label + symbol.
  // Preserves group order; drops groups with no matches so the header
  // doesn't hang over empty sections.
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

      // Yield one animation frame so React commits the spinner render
      // BEFORE any synchronous work (state mutations, cached BIP-32
      // derivation, MMKV writes) kicks off. Without this yield, React
      // batches the `setSwitchingRowKey` update with whatever the switch
      // triggers and commits them all at once *after* the work
      // completes — so the user sees zero visual feedback during the
      // switch even though the state was "technically" set first. The
      // classic RN "show spinner → yield → do heavy work" pattern.
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );

      try {
        // EVM dispatch flows through the existing numeric-chainId path
        // (backend blockchains feed). Solana rows aren't in the backend
        // feed yet, so they dispatch the static `ChainConfig` directly
        // via `changeActiveChainToConfig` — which shares the same
        // agent-busy gate.
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
    // Warm-on-hover: the user opening the picker is strong signal they
    // may switch namespace. Pre-derive EVM + Solana signers for every
    // wallet of each namespace shown in the list, off the render path.
    // By the time they tap a row, the BIP-32 / Ed25519 derivation is
    // already cached and `handleChainSelect`'s `await` resolves almost
    // immediately. Without this, first-touch cross-namespace taps pay
    // a ~100–500 ms main-thread derivation cost.
    warmNamespace("eip155");
    warmNamespace("solana");
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
  }, [fadeAnim, translateY, warmNamespace]);

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
          // Disable row taps while any switch is in flight — prevents
          // multiple parallel chain switches queuing up on fast taps.
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
                height: MODAL_HEIGHT,
                paddingBottom: bottomOffset,
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                transform: [{ translateY: translateY }],
              }}
            >
              <View className="bg-light-main-container flex-1 rounded-t-3xl">
                <View
                  {...panResponder.panHandlers}
                  className="w-full items-center pt-4 pb-2"
                >
                  <View className="w-12 h-1 bg-gray-300 rounded-full" />
                </View>

                <View className="px-6 flex-1">
                  <View className="flex-row justify-between items-center mb-4">
                    <Text className="text-light-matte-black text-xl font-bold">
                      Select Network
                    </Text>

                    <Pressable className="" onPress={closeModal}>
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
                    className="flex-1"
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: 24 }}
                  >
                    {isLoading ? (
                      <View className="items-center justify-center py-8">
                        <ActivityIndicator color="#c71c4b" />
                        <Text className="text-light-matte-black mt-2">
                          Loading networks...
                        </Text>
                      </View>
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
          </View>
        </Modal>
      )}
    </>
  );
});

const ChainSelector = memo(ChainSelectorBase);

export default ChainSelector;
