import { Stack, useRouter } from "expo-router";
import { ArrowRight, Check, ChevronLeft, X } from "lucide-react-native";
import React, { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { TCreateStrategyPayload } from "@/api/endpoints/strategies";
import type { AssetPreference, RiskTier } from "@/api/types/strategy";
import {
  useCreateStrategyMutation,
  useStrategyProtocols,
} from "@/hooks/queries/useStrategy";
import { useWallet } from "@/hooks/useWallet";
import {
  PermissionGrantStore,
  type ToolCapability,
} from "@/services/permissionGrantStore";

type LiqPref = TCreateStrategyPayload["liquidityPref"];
type NotifLevel = TCreateStrategyPayload["notificationLevel"];
type RebalanceTrigger = TCreateStrategyPayload["rebalanceTrigger"];

interface Option<T> {
  value: T;
  label: string;
  hint?: string;
}

const TIER_OPTIONS: Option<RiskTier>[] = [
  {
    value: "conservative",
    label: "Conservative",
    hint: "Stablecoin lending · target 3–6% APY",
  },
  {
    value: "balanced",
    label: "Balanced",
    hint: "LSTs + curated vaults · target 5–10% APY",
  },
  {
    value: "aggressive",
    label: "Aggressive",
    hint: "Higher yield with IL / depeg risk · 10%+ APY",
  },
];

const ASSET_OPTIONS: Option<AssetPreference>[] = [
  { value: "stable", label: "Stablecoins", hint: "USDC, USDT, DAI" },
  { value: "eth_lst", label: "ETH + LSTs", hint: "ETH, stETH, rETH" },
  { value: "multi", label: "Multi-asset", hint: "Mixed pools and LPs" },
];

const LIQUIDITY_OPTIONS: Option<LiqPref>[] = [
  { value: "instant", label: "Instant", hint: "Withdraw any time" },
  { value: "7d", label: "Up to 7 days", hint: "Better APY, short queue" },
  { value: "30d", label: "30+ days", hint: "Best APY, longer queue" },
];

const ALLOCATION_OPTIONS = [10, 25, 50] as const;

const REBALANCE_OPTIONS: Option<RebalanceTrigger>[] = [
  {
    value: { kind: "interval", value: "weekly" },
    label: "Weekly",
    hint: "Re-check opportunities every 7 days",
  },
  {
    value: { kind: "interval", value: "monthly" },
    label: "Monthly",
    hint: "Re-check opportunities every 30 days",
  },
  {
    value: { kind: "yield_drop", thresholdPct: 20 },
    label: "Yield drop > 20%",
    hint: "Move when APY drops sharply",
  },
];

const NOTIF_OPTIONS: Option<NotifLevel>[] = [
  { value: "every", label: "Every action" },
  { value: "daily", label: "Daily digest" },
  { value: "alerts", label: "Alerts only" },
];

const DEFI_WRITE_CAP_KEY: ToolCapability = "defi_write";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const STEPS = [
  {
    key: "tier",
    title: "Pick your risk tier",
    subtitle: "Sets the ceiling for what the agent can propose.",
  },
  {
    key: "asset",
    title: "Comfortable assets",
    subtitle: "Filter the opportunities you'll see.",
  },
  {
    key: "liquidity",
    title: "Exit speed",
    subtitle: "Trade flexibility for higher yield.",
  },
  {
    key: "allocation",
    title: "Allocation cap",
    subtitle: "Maximum share of your idle balance.",
  },
  {
    key: "rebalance",
    title: "Rebalance trigger",
    subtitle: "How often to re-check opportunities.",
  },
  {
    key: "whitelist",
    title: "Protocols",
    subtitle: "Optional. Restrict the agent to specific protocols.",
  },
  {
    key: "notifications",
    title: "Notifications",
    subtitle: "How often you want to hear from the agent.",
  },
  {
    key: "approval",
    title: "Grant 30-day access",
    subtitle: "You'll still sign each on-device write.",
  },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

// Chain preference is intentionally NOT in onboarding — the agent
// picks the optimal chain by default. Power users tune it from
// `/strategies/settings` post-onboarding (matches "best UX, no
// confused users" — chain choice is a niche pref, not first-run).
const SKIPPABLE: Record<StepKey, boolean> = {
  tier: false,
  asset: true,
  liquidity: true,
  allocation: true,
  rebalance: true,
  whitelist: true,
  notifications: true,
  approval: false,
};

const { width: SCREEN_WIDTH } = Dimensions.get("window");

function OptionRow<T>({
  option,
  selected,
  multi,
  onPress,
}: {
  option: Option<T>;
  selected: boolean;
  multi?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      className={`p-4 rounded-2xl border mb-2 ${
        selected
          ? "bg-light-primary-red/10 border-light-primary-red"
          : "bg-white border-light-matte-black/10"
      }`}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-1 pr-3">
          <Text
            className={`font-semibold ${
              selected ? "text-light-primary-red" : "text-light-matte-black"
            }`}
          >
            {option.label}
          </Text>
          {option.hint ? (
            <Text className="text-xs text-light-matte-black/50 mt-1">
              {option.hint}
            </Text>
          ) : null}
        </View>
        {multi ? (
          <View
            className={`w-5 h-5 rounded-md items-center justify-center ${
              selected
                ? "bg-light-primary-red"
                : "border border-light-matte-black/30"
            }`}
          >
            {selected ? <Check size={14} color="#ffffff" /> : null}
          </View>
        ) : selected ? (
          <View className="w-5 h-5 rounded-full bg-light-primary-red items-center justify-center">
            <Check size={14} color="#ffffff" />
          </View>
        ) : (
          <View className="w-5 h-5 rounded-full border border-light-matte-black/30" />
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function StrategiesOnboarding() {
  const router = useRouter();
  const { top, bottom } = useSafeAreaInsets();
  const { activeWallet } = useWallet();
  const createStrategy = useCreateStrategyMutation();
  const scrollRef = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [stepIdx, setStepIdx] = useState(0);

  const [tier, setTier] = useState<RiskTier>("conservative");
  // Tier is a hard ceiling (§15.7) — whitelist must be drawn from the
  // tier's curated set, so this hook is keyed on `tier` and refetches
  // when the user changes their pick on step 1.
  const { data: tierProtocols, isLoading: protocolsLoading } =
    useStrategyProtocols(tier);
  const [assetPreferences, setAssetPreferences] = useState<AssetPreference[]>([
    "stable",
  ]);
  const [liquidityPref, setLiquidityPref] = useState<LiqPref>("instant");
  // Chain preference is omitted from onboarding by design — default to
  // "any" and let power users restrict via `/strategies/settings`.
  const chainPref: Array<number | "any"> = ["any"];
  const [allocationPct, setAllocationPct] = useState<number>(10);
  const [rebalanceTrigger, setRebalanceTrigger] = useState<RebalanceTrigger>(
    REBALANCE_OPTIONS[0].value,
  );
  const [protocolWhitelist, setProtocolWhitelist] = useState<string[]>([]);
  const [notificationLevel, setNotificationLevel] =
    useState<NotifLevel>("daily");
  const [grantAgentAccess, setGrantAgentAccess] = useState<boolean>(true);

  const isLast = stepIdx === STEPS.length - 1;
  const isFirst = stepIdx === 0;
  const currentStep = STEPS[stepIdx].key;
  const canSkipStep = SKIPPABLE[currentStep];

  const scrollToStep = (idx: number) => {
    setStepIdx(idx);
    scrollRef.current?.scrollTo({ x: SCREEN_WIDTH * idx, animated: true });
  };

  const toggleAsset = (value: AssetPreference) => {
    setAssetPreferences((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  };

  const toggleWhitelist = (slug: string) => {
    setProtocolWhitelist((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
  };

  // When the user changes tier on step 1, drop any previously-picked
  // whitelist entries that don't exist in the new tier's curated set —
  // otherwise the agent would reject those slugs at deposit time with
  // tier_exceeds_user_policy (§15.7).
  React.useEffect(() => {
    if (!tierProtocols) return;
    const allowed = new Set(tierProtocols.map((p) => p.protocolSlug));
    setProtocolWhitelist((prev) => prev.filter((s) => allowed.has(s)));
  }, [tierProtocols]);

  const handlePrimary = async () => {
    if (!isLast) {
      scrollToStep(stepIdx + 1);
      return;
    }
    await submit();
  };

  const handleSkipStep = () => {
    if (!canSkipStep) return;
    scrollToStep(stepIdx + 1);
  };

  const handleQuickStart = () => {
    // Tier-only path: keep all other defaults and jump to the
    // mandatory approval step.
    scrollToStep(STEPS.length - 1);
  };

  const submit = async () => {
    const namespace: TCreateStrategyPayload["namespace"] =
      activeWallet?.namespace ?? "eip155";

    const payload: TCreateStrategyPayload = {
      namespace,
      tier,
      assetPreferences:
        assetPreferences.length > 0 ? assetPreferences : ["stable"],
      liquidityPref,
      chainPref,
      allocationPct,
      rebalanceTrigger,
      protocolWhitelist:
        protocolWhitelist.length > 0 ? protocolWhitelist : undefined,
      allowAllInTier: false,
      notificationLevel,
    };

    try {
      await createStrategy.mutateAsync(payload);

      // PermissionGrantStore is EVM-only (keyed by 0x… addresses).
      // Gate on address shape, not on namespace, so the chain-agnostic
      // guard stays happy and non-EVM strategies still create cleanly.
      if (grantAgentAccess && activeWallet?.address?.startsWith("0x")) {
        try {
          const store = PermissionGrantStore.conservative(
            activeWallet.address as `0x${string}`,
          );
          await store.whenLoaded();
          store.add({
            scope: { kind: "capability", key: DEFI_WRITE_CAP_KEY },
            lifetime: {
              type: "timed",
              expires_at: Date.now() + THIRTY_DAYS_MS,
            },
            wallet_address: activeWallet.address as `0x${string}`,
            granted_at: Date.now(),
          });
          await store.flushed();
        } catch (grantErr) {
          if (__DEV__)
            console.warn("[strategies-onboarding] grant failed:", grantErr);
        }
      }

      router.replace("/strategies");
    } catch (err) {
      if (__DEV__) console.warn("[strategies-onboarding] create failed:", err);
      Alert.alert(
        "We couldn't create your strategy",
        "Please try again in a moment.",
      );
    }
  };

  const renderStepBody = (key: StepKey) => {
    switch (key) {
      case "tier":
        return (
          <View>
            {TIER_OPTIONS.map((opt) => (
              <OptionRow
                key={opt.value}
                option={opt}
                selected={tier === opt.value}
                onPress={() => setTier(opt.value)}
              />
            ))}
            <TouchableOpacity
              onPress={handleQuickStart}
              activeOpacity={0.7}
              className="mt-4 py-3 items-center"
            >
              <Text className="text-light-primary-red font-semibold">
                Quick start — use recommended defaults
              </Text>
              <Text className="text-light-matte-black/50 text-xs mt-1">
                Tweak later from Settings
              </Text>
            </TouchableOpacity>
          </View>
        );
      case "asset":
        return (
          <View>
            <Text className="text-sm text-light-matte-black/60 mb-3">
              Pick one or more. Filters the opportunities you'll see.
            </Text>
            {ASSET_OPTIONS.map((opt) => (
              <OptionRow
                key={opt.value}
                option={opt}
                selected={assetPreferences.includes(opt.value)}
                multi
                onPress={() => toggleAsset(opt.value)}
              />
            ))}
          </View>
        );
      case "liquidity":
        return (
          <View>
            {LIQUIDITY_OPTIONS.map((opt) => (
              <OptionRow
                key={opt.value}
                option={opt}
                selected={liquidityPref === opt.value}
                onPress={() => setLiquidityPref(opt.value)}
              />
            ))}
          </View>
        );
      case "allocation":
        return (
          <View>
            <Text className="text-sm text-light-matte-black/60 mb-4">
              The agent will never exceed this % across all DeFi positions.
            </Text>
            <View className="flex-row gap-2 mb-3">
              {ALLOCATION_OPTIONS.map((pct) => (
                <TouchableOpacity
                  key={pct}
                  onPress={() => setAllocationPct(pct)}
                  activeOpacity={0.85}
                  className={`flex-1 px-4 py-4 rounded-2xl border items-center ${
                    allocationPct === pct
                      ? "bg-light-primary-red/10 border-light-primary-red"
                      : "bg-white border-light-matte-black/10"
                  }`}
                >
                  <Text
                    className={`text-lg font-bold ${
                      allocationPct === pct
                        ? "text-light-primary-red"
                        : "text-light-matte-black"
                    }`}
                  >
                    {pct}%
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text className="text-xs text-light-matte-black/50">
              Selected: {allocationPct}% of your idle balance.
            </Text>
          </View>
        );
      case "rebalance":
        return (
          <View>
            {REBALANCE_OPTIONS.map((opt) => {
              const sameKind = opt.value.kind === rebalanceTrigger.kind;
              const sameValue =
                opt.value.kind === "interval" &&
                rebalanceTrigger.kind === "interval"
                  ? opt.value.value === rebalanceTrigger.value
                  : opt.value.kind === "yield_drop" &&
                    rebalanceTrigger.kind === "yield_drop";
              return (
                <OptionRow
                  key={opt.label}
                  option={opt}
                  selected={sameKind && sameValue}
                  onPress={() => setRebalanceTrigger(opt.value)}
                />
              );
            })}
          </View>
        );
      case "whitelist":
        return (
          <View>
            <Text className="text-sm text-light-matte-black/60 mb-3">
              By default we use the curated set for your tier (recommended).
              Pick specific protocols to restrict the agent to just those.
            </Text>
            {protocolsLoading ? (
              <View className="py-8 items-center">
                <ActivityIndicator color="#c71c4b" />
              </View>
            ) : tierProtocols && tierProtocols.length > 0 ? (
              tierProtocols.map((p) => (
                <OptionRow
                  key={p.protocolSlug}
                  option={{
                    value: p.protocolSlug,
                    label: p.protocolSlug,
                    hint: `${p.assetSymbol} · ${p.chainName}`,
                  }}
                  selected={protocolWhitelist.includes(p.protocolSlug)}
                  multi
                  onPress={() => toggleWhitelist(p.protocolSlug)}
                />
              ))
            ) : (
              <Text className="text-sm text-light-matte-black/60">
                No curated protocols for this tier right now. Skipping uses the
                agent's default routing.
              </Text>
            )}
          </View>
        );
      case "notifications":
        return (
          <View>
            {NOTIF_OPTIONS.map((opt) => (
              <OptionRow
                key={opt.value}
                option={opt}
                selected={notificationLevel === opt.value}
                onPress={() => setNotificationLevel(opt.value)}
              />
            ))}
          </View>
        );
      case "approval":
        return (
          <View>
            <Text className="text-sm text-light-matte-black/60 mb-4">
              You can revoke any time from Agent Permissions. Every signed
              action still asks you on-device.
            </Text>
            <TouchableOpacity
              onPress={() => setGrantAgentAccess((v) => !v)}
              activeOpacity={0.85}
              className={`p-4 rounded-2xl border ${
                grantAgentAccess
                  ? "bg-light-primary-red/10 border-light-primary-red"
                  : "bg-white border-light-matte-black/10"
              }`}
            >
              <View className="flex-row items-center justify-between">
                <Text
                  className={`font-semibold ${
                    grantAgentAccess
                      ? "text-light-primary-red"
                      : "text-light-matte-black"
                  }`}
                >
                  Grant 30-day DeFi access
                </Text>
                <View
                  className={`w-5 h-5 rounded-md items-center justify-center ${
                    grantAgentAccess
                      ? "bg-light-primary-red"
                      : "border border-light-matte-black/30"
                  }`}
                >
                  {grantAgentAccess ? (
                    <Check size={14} color="#ffffff" />
                  ) : null}
                </View>
              </View>
            </TouchableOpacity>
          </View>
        );
    }
  };

  const handleClose = () => router.back();

  return (
    <View
      className="flex-1 bg-light-main-container"
      style={{ paddingTop: top }}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-row justify-between items-center px-4 py-3">
        <View className="flex-row items-center gap-2">
          {!isFirst ? (
            <TouchableOpacity
              onPress={() => scrollToStep(stepIdx - 1)}
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              className="w-9 h-9 rounded-xl bg-light items-center justify-center"
              activeOpacity={0.7}
              style={{
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.04,
                shadowRadius: 6,
                elevation: 1,
              }}
            >
              <ChevronLeft size={18} color="#c71c4b" />
            </TouchableOpacity>
          ) : (
            <View className="w-9 h-9" />
          )}
          <View className="bg-light-primary-red/10 px-3 py-1.5 rounded-full">
            <Text className="text-light-primary-red text-[11px] font-bold tracking-wide">
              STEP {stepIdx + 1} OF {STEPS.length}
            </Text>
          </View>
        </View>
        <View className="flex-row items-center gap-2">
          {canSkipStep ? (
            <TouchableOpacity
              onPress={handleSkipStep}
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              className="py-2 px-3"
              activeOpacity={0.7}
            >
              <Text className="text-light-matte-black/50 font-semibold text-sm">
                Skip
              </Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            onPress={handleClose}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            className="w-9 h-9 rounded-xl bg-light items-center justify-center"
            activeOpacity={0.7}
            style={{
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.04,
              shadowRadius: 6,
              elevation: 1,
            }}
          >
            <X size={18} color="#c71c4b" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false },
        )}
        scrollEventThrottle={16}
        className="flex-1"
      >
        {STEPS.map((step) => (
          <ScrollView
            key={step.key}
            style={{ width: SCREEN_WIDTH }}
            contentContainerStyle={{
              paddingHorizontal: 20,
              paddingTop: 8,
              paddingBottom: 24,
            }}
            showsVerticalScrollIndicator={false}
          >
            <Text className="text-2xl font-bold text-light-matte-black tracking-tight">
              {step.title}
            </Text>
            <Text className="text-sm text-light-matte-black/50 mt-1 mb-5">
              {step.subtitle}
            </Text>
            {renderStepBody(step.key)}
          </ScrollView>
        ))}
      </ScrollView>

      <View
        className="px-6 bg-light-main-container"
        style={{ paddingBottom: Math.max(bottom, 24), paddingTop: 12 }}
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center">
            {STEPS.map((_, index) => {
              const inputRange = [
                (index - 1) * SCREEN_WIDTH,
                index * SCREEN_WIDTH,
                (index + 1) * SCREEN_WIDTH,
              ];
              const dotWidth = scrollX.interpolate({
                inputRange,
                outputRange: [6, 20, 6],
                extrapolate: "clamp",
              });
              const backgroundColor = scrollX.interpolate({
                inputRange,
                outputRange: ["#20222c20", "#c71c4b", "#20222c20"],
                extrapolate: "clamp",
              });
              return (
                <Animated.View
                  key={index}
                  className="h-1.5 rounded-full mx-1"
                  style={{ width: dotWidth, backgroundColor }}
                />
              );
            })}
          </View>

          <TouchableOpacity
            disabled={createStrategy.isPending}
            onPress={handlePrimary}
            activeOpacity={0.85}
            className="flex-row items-center bg-light-primary-red px-6 py-3.5 rounded-full"
            style={{
              shadowColor: "#c71c4b",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.25,
              shadowRadius: 12,
              elevation: 8,
            }}
          >
            {createStrategy.isPending && isLast ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <>
                <Text className="text-white font-semibold text-[15px] mr-2">
                  {isLast ? "Create strategy" : "Next"}
                </Text>
                <ArrowRight size={18} color="#ffffff" strokeWidth={2.5} />
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
