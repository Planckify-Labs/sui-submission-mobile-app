/**
 * `AgentAllowanceSheet` — bottom sheet that lets the user authorize a
 * bounded ERC-7710 onchain spending allowance for the AI agent (spec
 * Phase 2 §6.1). Two stages:
 *
 *   1. "pick"   — choose which ERC-20 the allowance applies to. The token
 *                 catalogue is **API-driven** via `useTokens()` (cached
 *                 backend list), filtered to the active chain's ERC-20s.
 *   2. "amount" — enter a token-denominated cap + pick a duration.
 *
 * The screen handles biometric gating, delegation building/signing, and
 * persistence; this sheet only collects intent.
 *
 * Animation: mount-on-open with a slide-in + fade backdrop, drag-to-close
 * on the handle, and keyboard-aware bottom spacing — mirrors the
 * `OverridePickerSheet` in `app/transfer-thresholds.tsx` so the
 * smart-account flows feel like one family. The parent renders this only
 * while open; `animatedCancel` runs the slide-out before calling
 * `onClose` (which unmounts us).
 */

import { ArrowLeft, Search, ShieldCheck, X } from "lucide-react-native";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Keyboard,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import OptimizedImage from "@/components/common/OptimizedImage";
import { useTokens } from "@/hooks/queries/useTokens";
import { useBlockchainsWithStorage } from "@/hooks/useBlockchainsWithStorage";
import type { AllowanceLifetime } from "@/services/agentDelegationMapping";

const DAY_MS = 24 * 60 * 60 * 1000;

// Slide distance + timings. Mirrors `transfer-thresholds`'s sheet and the
// `MODAL_HEIGHT = height * 0.6` convention used across the app's sheets.
const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const SHEET_TRAVEL = SCREEN_HEIGHT * 0.6;
const SHEET_ANIM_DURATION = 300;
const SHEET_CLOSE_ANIM_DURATION = 200;

export interface SelectedAllowanceToken {
  contractAddress: `0x${string}`;
  decimals: number;
  symbol: string;
  name: string;
  logoUrl?: string;
}

interface DurationOption {
  label: string;
  build: () => AllowanceLifetime;
}

const DURATION_OPTIONS: DurationOption[] = [
  {
    label: "1 day",
    build: () => ({ type: "timed", expiresAtMs: Date.now() + DAY_MS }),
  },
  {
    label: "7 days",
    build: () => ({ type: "timed", expiresAtMs: Date.now() + 7 * DAY_MS }),
  },
  {
    label: "30 days",
    build: () => ({ type: "timed", expiresAtMs: Date.now() + 30 * DAY_MS }),
  },
  { label: "Until revoked", build: () => ({ type: "permanent" }) },
];

interface AgentAllowanceSheetProps {
  /** Active EVM chain id — used to filter the API token list. */
  chainId: number;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (args: {
    token: SelectedAllowanceToken;
    amountText: string;
    lifetime: AllowanceLifetime;
  }) => void;
}

function TokenAvatar({
  logoUrl,
  symbol,
  size = 36,
}: {
  logoUrl?: string;
  symbol: string;
  size?: number;
}) {
  const radius = size / 2;
  if (logoUrl) {
    return (
      <OptimizedImage
        source={{ uri: logoUrl }}
        style={{ width: size, height: size, borderRadius: radius }}
        containerStyle={{
          width: size,
          height: size,
          borderRadius: radius,
          marginRight: 12,
        }}
        contentFit="cover"
        alt={`${symbol} logo`}
      />
    );
  }
  return (
    <View
      className="items-center justify-center mr-3 bg-light-primary-red/10"
      style={{ width: size, height: size, borderRadius: radius }}
    >
      <Text
        className="text-light-primary-red font-bold"
        style={{ fontSize: Math.max(10, size * 0.35) }}
      >
        {symbol.slice(0, 2).toUpperCase()}
      </Text>
    </View>
  );
}

export default function AgentAllowanceSheet({
  chainId,
  busy = false,
  onClose,
  onConfirm,
}: AgentAllowanceSheetProps) {
  const { bottom } = useSafeAreaInsets();
  const bottomOffset = Platform.OS === "ios" ? 16 : bottom > 0 ? bottom : 0;

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(SHEET_TRAVEL)).current;
  const keyboardHeight = useRef(new Animated.Value(0)).current;

  const [stage, setStage] = useState<"pick" | "amount">("pick");
  const [selected, setSelected] = useState<SelectedAllowanceToken | null>(null);
  const [search, setSearch] = useState("");
  const [amountText, setAmountText] = useState("");
  const [durationIndex, setDurationIndex] = useState(1); // default 7 days

  // API-driven token catalogue + the chainId↔blockchainId map (the
  // registry keys tokens by UUID, not chain id).
  const { data: blockchains } = useBlockchainsWithStorage();

  const blockchainId = useMemo(
    () => blockchains?.find((b) => b.chainId === chainId)?.id ?? null,
    [blockchains, chainId],
  );

  // Scope the catalogue to the active backend chain — same pattern as the
  // send.tsx token picker. Passing `blockchainId` (instead of an unscoped
  // `useTokens()` + a loose `blockchainId ? … : true` filter) prevents the
  // cross-chain bleed that hid the chain's real USDC behind aUSDC/IDRX.
  const { data: rawTokenList = [], isLoading: tokensLoading } = useTokens(
    blockchainId ? { blockchainId } : undefined,
  );

  // ERC-7710 transfer-amount scopes need a real ERC-20 contract — drop
  // native + inactive entries, strictly scope to the active chain
  // (never fall back to "all chains"), then search.
  const tokens = useMemo<SelectedAllowanceToken[]>(() => {
    if (!blockchainId) return [];
    const q = search.trim().toLowerCase();
    return rawTokenList
      .filter(
        (t) =>
          t.blockchainId === blockchainId &&
          !t.isNativeCurrency &&
          t.isActive !== false &&
          (t.contractAddress?.length ?? 0) > 0,
      )
      .filter(
        (t) =>
          !q ||
          t.symbol.toLowerCase().includes(q) ||
          t.name.toLowerCase().includes(q),
      )
      .map((t) => ({
        contractAddress: (
          t.contractAddress as string
        ).toLowerCase() as `0x${string}`,
        decimals: t.decimals,
        symbol: t.symbol,
        name: t.name,
        logoUrl: t.logoUrl || undefined,
      }))
      .sort((a, b) => a.symbol.localeCompare(b.symbol));
  }, [rawTokenList, blockchainId, search]);

  // Slide-in on mount.
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: SHEET_ANIM_DURATION,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: SHEET_ANIM_DURATION,
        useNativeDriver: true,
      }),
    ]).start();
    // Slide-out is driven by `animatedCancel`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard-aware spacer so the amount input / Authorize button stay
  // above the keyboard edge. `useNativeDriver: false` because we animate
  // layout height, not a transform.
  useEffect(() => {
    const onShow = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (event) => {
        Animated.timing(keyboardHeight, {
          toValue: event.endCoordinates.height,
          duration: Platform.OS === "ios" ? event.duration : 200,
          useNativeDriver: false,
        }).start();
      },
    );
    const onHide = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      (event) => {
        Animated.timing(keyboardHeight, {
          toValue: 0,
          duration: Platform.OS === "ios" ? event.duration : 200,
          useNativeDriver: false,
        }).start();
      },
    );
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, [keyboardHeight]);

  // Reverse animation → then unmount via parent `onClose`.
  const animatedCancel = useCallback(() => {
    if (busy) return;
    Keyboard.dismiss();
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: SHEET_CLOSE_ANIM_DURATION,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: SHEET_TRAVEL,
        duration: SHEET_CLOSE_ANIM_DURATION,
        useNativeDriver: true,
      }),
    ]).start(() => onClose());
  }, [busy, fadeAnim, translateY, onClose]);

  // Drag-to-close on the handle. Same thresholds as the sibling sheets:
  // 50px travel OR 0.5 velocity triggers close.
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 0,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 50 || g.vy > 0.5) {
          Animated.parallel([
            Animated.timing(fadeAnim, {
              toValue: 0,
              duration: SHEET_CLOSE_ANIM_DURATION,
              useNativeDriver: true,
            }),
            Animated.timing(translateY, {
              toValue: SHEET_TRAVEL,
              duration: SHEET_CLOSE_ANIM_DURATION,
              useNativeDriver: true,
            }),
          ]).start(() => onClose());
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

  const duration = DURATION_OPTIONS[durationIndex];
  const amountValid = /^\d*\.?\d+$/.test(amountText.trim());
  const canAuthorize = !!selected && amountValid && !busy;

  const summary =
    selected && amountValid
      ? duration.label === "Until revoked"
        ? `The agent may spend up to ${amountText} ${selected.symbol} until you revoke it.`
        : `The agent may spend up to ${amountText} ${selected.symbol} over the next ${duration.label}.`
      : "Enter a spending cap and pick how long it stays valid.";

  return (
    <Modal
      transparent
      visible
      animationType="none"
      onRequestClose={animatedCancel}
    >
      <View style={{ flex: 1 }}>
        <TouchableWithoutFeedback onPress={animatedCancel}>
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
            maxHeight: "85%",
            backgroundColor: "#f5f6f9",
            borderTopLeftRadius: 32,
            borderTopRightRadius: 32,
            transform: [{ translateY }],
            shadowColor: "#000",
            shadowOffset: { width: 0, height: -3 },
            shadowOpacity: 0.1,
            shadowRadius: 10,
            elevation: 10,
          }}
        >
          <View
            {...panResponder.panHandlers}
            className="w-full items-center pt-4 pb-2"
          >
            <View className="w-12 h-1 bg-gray-300 rounded-full" />
          </View>

          <View className="px-6 pb-1">
            <View className="flex-row items-center justify-between mb-4">
              <View className="flex-row items-center flex-1">
                {stage === "amount" && (
                  <TouchableOpacity
                    onPress={() => setStage("pick")}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel="Back to token selection"
                    className="mr-2 bg-light-main-container p-2 rounded-full"
                  >
                    <ArrowLeft size={16} color="#20222c" />
                  </TouchableOpacity>
                )}
                <ShieldCheck size={22} color="#c71c4b" />
                <Text className="text-light-matte-black text-xl font-bold ml-2">
                  {stage === "pick" ? "Choose a token" : "Spending Delegation"}
                </Text>
              </View>
              <Pressable
                onPress={animatedCancel}
                disabled={busy}
                className="bg-light-main-container p-2 rounded-full"
              >
                <X size={16} color="#20222c" />
              </Pressable>
            </View>
          </View>

          {stage === "pick" ? (
            <View className="px-6">
              <View className="flex-row items-center bg-white rounded-2xl px-3 mb-3">
                <Search size={16} color="#9aa0ab" />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search tokens"
                  placeholderTextColor="#9aa0ab"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  className="flex-1 py-3 px-2 text-light-matte-black"
                />
              </View>

              {tokensLoading && tokens.length === 0 ? (
                <View className="py-10 items-center">
                  <ActivityIndicator size="small" color="#c71c4b" />
                  <Text className="text-light-matte-black/50 text-xs mt-2">
                    Loading tokens…
                  </Text>
                </View>
              ) : tokens.length === 0 ? (
                <View className="py-10 items-center">
                  <Text className="text-light-matte-black/60 text-sm">
                    No tokens available on this network.
                  </Text>
                </View>
              ) : (
                <ScrollView
                  style={{ maxHeight: 360 }}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  {tokens.map((t, index) => (
                    <TouchableOpacity
                      key={t.contractAddress}
                      onPress={() => {
                        setSelected(t);
                        setStage("amount");
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Select ${t.symbol}`}
                      className={`flex-row items-center py-3 ${index > 0 ? "border-t border-light-matte-black/5" : ""}`}
                    >
                      <TokenAvatar logoUrl={t.logoUrl} symbol={t.symbol} />
                      <View className="flex-1">
                        <Text className="text-light-matte-black font-semibold">
                          {t.symbol}
                        </Text>
                        <Text
                          className="text-light-matte-black/50 text-xs mt-0.5"
                          numberOfLines={1}
                        >
                          {t.name}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          ) : (
            selected && (
              <View className="px-6">
                <View className="flex-row items-center bg-white rounded-2xl p-3 mb-4">
                  <TokenAvatar
                    logoUrl={selected.logoUrl}
                    symbol={selected.symbol}
                  />
                  <View className="flex-1">
                    <Text className="text-light-matte-black font-semibold">
                      {selected.symbol}
                    </Text>
                    <Text
                      className="text-light-matte-black/50 text-xs mt-0.5"
                      numberOfLines={1}
                    >
                      {selected.name}
                    </Text>
                  </View>
                </View>

                <Text className="text-light-matte-black/50 text-xs uppercase tracking-wide mb-2">
                  Spending cap
                </Text>
                <View className="flex-row items-center bg-white rounded-2xl px-4 mb-5">
                  <TextInput
                    value={amountText}
                    onChangeText={setAmountText}
                    placeholder="0.0"
                    placeholderTextColor="#9aa0ab"
                    keyboardType="decimal-pad"
                    className="flex-1 py-3 text-light-matte-black text-lg font-semibold"
                  />
                  <Text className="text-light-matte-black/50 font-semibold ml-2">
                    {selected.symbol}
                  </Text>
                </View>

                <Text className="text-light-matte-black/50 text-xs uppercase tracking-wide mb-2">
                  Valid for
                </Text>
                <View className="flex-row flex-wrap gap-2 mb-5">
                  {DURATION_OPTIONS.map((opt, i) => {
                    const active = i === durationIndex;
                    return (
                      <TouchableOpacity
                        key={opt.label}
                        onPress={() => setDurationIndex(i)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                        className={`px-4 py-2.5 rounded-2xl ${active ? "bg-light-primary-red" : "bg-white"}`}
                      >
                        <Text
                          className={`font-semibold text-sm ${active ? "text-white" : "text-light-matte-black"}`}
                        >
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View className="bg-light-main-container/60 p-4 rounded-2xl mb-5">
                  <Text className="text-light-matte-black/60 text-xs leading-4 text-center">
                    {summary}
                  </Text>
                </View>

                <Text className="text-light-matte-black/50 text-[11px] leading-4 mb-4 text-center">
                  This signs a cryptographic ERC-7710 delegation. The cap is
                  enforced onchain — the agent can never exceed it.
                </Text>

                <TouchableOpacity
                  activeOpacity={0.8}
                  disabled={!canAuthorize}
                  className={`py-4 rounded-full items-center justify-center shadow-md flex-row ${canAuthorize ? "bg-light-primary-red" : "bg-light-primary-red/40"}`}
                  onPress={() =>
                    selected &&
                    onConfirm({
                      token: selected,
                      amountText: amountText.trim(),
                      lifetime: duration.build(),
                    })
                  }
                >
                  {busy ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text className="text-white font-bold text-base">
                      Authorize Delegation
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            )
          )}

          {/* Static bottom inset + keyboard-aware spacer. */}
          <View style={{ height: bottomOffset + 24 }} />
          <Animated.View style={{ height: keyboardHeight }} />
        </Animated.View>
      </View>
    </Modal>
  );
}
