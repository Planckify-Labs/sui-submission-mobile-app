/**
 * Transfer Thresholds settings screen.
 *
 * Isolation model:
 *   - Thresholds are stored per-wallet by default (one SecureStore blob
 *     per wallet address). The screen operates on the active wallet's
 *     store and displays the active wallet's name in the scope header.
 *   - Cross-wallet writes are opt-in, per action:
 *     - The per-override picker has an "Apply to all my wallets" toggle
 *       that broadcasts the single override to every wallet's store.
 *     - The defaults card has a "Copy these defaults to all wallets"
 *       action that syncs the current active wallet's two defaults.
 *   - No "global sync mode" switch — users can opt into cross-wallet
 *     on the exact action they want, rather than having a hidden toggle
 *     affect every subsequent edit.
 *
 * Token picker:
 *   - Section 1: "My assets" — tokens the user has added on the active
 *     chain (read directly from the asset-explorer's AsyncStorage
 *     blob via `readUserAssetsForChain`).
 *   - Section 2: "Available tokens" — every token the chain registry
 *     exposes for the active chain (native first, then ERC-20s sorted
 *     by symbol), minus anything already in section 1 (to avoid
 *     duplicates).
 *
 * UX philosophy (same as before):
 *   Three white-list scenarios (only/except/listed) all collapse to
 *   "default rule + exceptions". No mode picker, one mental model.
 */

import { router } from "expo-router";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Coins,
  ListChecks,
  Plus,
  Users,
  Wallet,
  X,
  Zap,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  Keyboard,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  useWindowDimensions,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import OptimizedImage from "@/components/common/OptimizedImage";
import type { TCryptoAsset } from "@/constants/types/assetTypes";
import { useTokens } from "@/hooks/queries/useTokens";
import { useBlockchainsWithStorage } from "@/hooks/useBlockchainsWithStorage";
import { useWallet } from "@/hooks/useWallet";
import {
  getTransferThresholdStore,
  NATIVE_TOKEN_KEY,
  setDefaultOnWallets,
  setOverrideOnWallets,
  type TokenOverride,
  type TransferThresholds,
} from "@/services/transferThresholdStore";
import { readUserAssetsForChain } from "@/services/userAssetsReader";
import {
  formatChainLabel,
  getEvmChainId,
} from "@/services/walletKit/chainInfo";

// Extra breathing room above the keyboard — matches the pattern used
// in `AddContactModal`. Tuned so the focused input sits well above the
// keyboard edge with room for the helper row beneath it.
const EXTRA_SPACE_ABOVE_KEYBOARD = 66;

// Distance the sheet travels on slide-in / slide-out. Mirrors the
// `MODAL_HEIGHT = height * 0.6` convention used by `BalanceSection` /
// `RecievePaymentModal` so animation timing feels consistent across
// the app's bottom sheets.
const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const SHEET_TRAVEL = SCREEN_HEIGHT * 0.6;
const SHEET_ANIM_DURATION = 300;
const SHEET_CLOSE_ANIM_DURATION = 200;

/**
 * Scope for a save operation. Exactly three states — the picker sheet's
 * "Save on" control produces one of these, and the parent screen
 * decides whether to gate the write behind a confirmation dialog.
 *
 * - `this`: only the active wallet's store. Fast path, no dialog.
 * - `all`: every wallet in the app. Shows a strong warning.
 * - `some`: a user-selected subset. Shows a warning naming the count.
 *
 * Keeping `all` distinct from `some` (rather than just using a full
 * address array) so the warning copy can say "all X wallets" vs.
 * "the X wallets you selected" — more reassuring than a generic
 * "X wallets".
 */
type SaveScope =
  | { type: "this" }
  | { type: "all" }
  | { type: "some"; addresses: `0x${string}`[] };

// --- Helpers ---------------------------------------------------------------

function shortAddress(address: string): string {
  if (address === NATIVE_TOKEN_KEY) return "Native";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function formatThreshold(usd: number): string {
  if (usd === 0) return "Always ask";
  return `$${usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

// --- Screen ----------------------------------------------------------------

export default function TransferThresholdsScreen() {
  const { wallets, activeWallet, activeChain } = useWallet();
  const { bottom } = useSafeAreaInsets();

  const address = activeWallet?.address as `0x${string}` | undefined;
  const chainId = getEvmChainId(activeChain);

  const store = useMemo(() => {
    if (!address) return null;
    return getTransferThresholdStore(address);
  }, [address]);

  const [thresholds, setThresholds] = useState<TransferThresholds | null>(null);

  // Hydrate + subscribe to store changes.
  useEffect(() => {
    if (!store) return;
    let cancelled = false;
    const refresh = () => {
      if (cancelled) return;
      setThresholds(store.snapshot());
    };
    store.whenLoaded().then(refresh);
    const unsubscribe = store.subscribe(refresh);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [store]);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingOverride, setEditingOverride] = useState<TokenOverride | null>(
    null,
  );

  // Collect wallet addresses for cross-wallet writes. Filter to valid
  // 0x-prefixed addresses so a half-initialized wallet doesn't break
  // the broadcast loop.
  const allWalletAddresses = useMemo(
    () =>
      wallets
        .map((w) => w.address as `0x${string}` | undefined)
        .filter((a): a is `0x${string}` => typeof a === "string"),
    [wallets],
  );

  const hasMultipleWallets = allWalletAddresses.length > 1;

  const handleSetDefault = useCallback(
    (kind: "native" | "token", value: string) => {
      if (!store) return;
      const parsed = parseFloat(value);
      store.setDefault(kind, Number.isFinite(parsed) ? parsed : 0);
    },
    [store],
  );

  const handleCopyDefaultsToAll = useCallback(() => {
    if (!thresholds || allWalletAddresses.length === 0) return;
    Alert.alert(
      "Copy defaults to all wallets?",
      `This overwrites the native and ERC-20 defaults on all ${allWalletAddresses.length} wallets with the values from this wallet. Per-token overrides are not affected.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Copy to all",
          onPress: () => {
            setDefaultOnWallets(
              allWalletAddresses,
              "native",
              thresholds.default_native_usd,
            );
            setDefaultOnWallets(
              allWalletAddresses,
              "token",
              thresholds.default_token_usd,
            );
          },
        },
      ],
    );
  }, [thresholds, allWalletAddresses]);

  const handleRemoveOverride = useCallback(
    (override: TokenOverride) => {
      if (!store) return;
      Alert.alert(
        "Remove override?",
        `${override.symbol} will follow the default ${override.isNative ? "native" : "token"} threshold on this wallet.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: () =>
              store.removeOverride(override.chainId, override.contractAddress),
          },
        ],
      );
    },
    [store],
  );

  const handleSaveOverride = useCallback(
    (override: TokenOverride, scope: SaveScope) => {
      if (!store) return;

      const commit = (addresses: `0x${string}`[] | null) => {
        if (addresses && addresses.length > 0) {
          setOverrideOnWallets(addresses, override);
        } else {
          store.setOverride(override);
        }
        setEditingOverride(null);
        setPickerOpen(false);
      };

      switch (scope.type) {
        case "this":
          commit(null);
          return;
        case "all": {
          const count = allWalletAddresses.length;
          Alert.alert(
            "Apply to all wallets?",
            `This will save the "${override.symbol}" threshold on all ${count} wallets in this app. Make sure you know what you're doing — thresholds control how much the agent can move without asking.`,
            [
              { text: "Cancel", style: "cancel" },
              {
                text: `Apply to all ${count}`,
                style: "destructive",
                onPress: () => commit(allWalletAddresses),
              },
            ],
          );
          return;
        }
        case "some": {
          const count = scope.addresses.length;
          Alert.alert(
            `Apply to ${count} wallet${count === 1 ? "" : "s"}?`,
            `This will save the "${override.symbol}" threshold on the ${count} wallet${count === 1 ? "" : "s"} you selected. Make sure you know what you're doing — thresholds control how much the agent can move without asking.`,
            [
              { text: "Cancel", style: "cancel" },
              {
                text: `Apply to ${count}`,
                style: "destructive",
                onPress: () => commit(scope.addresses),
              },
            ],
          );
          return;
        }
      }
    },
    [store, allWalletAddresses],
  );

  if (!address || !thresholds || !chainId) {
    return (
      <SafeAreaView className="flex-1 bg-light-main-container" edges={["top"]}>
        <View className="flex-1 items-center justify-center">
          <Text className="text-light-matte-black/50">
            {address ? "Loading thresholds…" : "No active wallet"}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const overrides = Object.values(thresholds.overrides);

  return (
    <>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView
        className="flex-1 bg-light-main-container"
        edges={["top"]}
        style={{ paddingBottom: bottom > 0 ? bottom : 0 }}
      >
        {/* Header */}
        <View className="px-4 pt-2 pb-4">
          <View className="flex-row items-center gap-3">
            <Pressable
              onPress={() => router.back()}
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              className="w-9 h-9 rounded-xl bg-light items-center justify-center shadow-sm"
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <ArrowLeft size={18} color="#c71c4b" />
            </Pressable>
            <View className="flex-1">
              <Text className="text-light-matte-black text-2xl font-bold tracking-tight">
                Transfer Thresholds
              </Text>
              <Text className="text-light-matte-black/50 text-xs mt-0.5">
                Auto-approve transfers below your configured limit.
              </Text>
            </View>
          </View>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 48 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Scope banner — makes the wallet-isolation model explicit. */}
          <View className="mx-4 mb-4">
            <View
              className="bg-light rounded-2xl px-4 py-3 flex-row items-center"
              style={cardShadow}
              accessible
              accessibilityLabel={`Editing thresholds for ${activeWallet?.name ?? "active wallet"}`}
            >
              <View className="w-9 h-9 rounded-xl bg-light-primary-red/10 items-center justify-center mr-3">
                <Wallet size={18} color="#c71c4b" />
              </View>
              <View className="flex-1">
                <Text className="text-light-matte-black/50 text-[10px] uppercase tracking-wide">
                  Editing
                </Text>
                <Text
                  className="text-light-matte-black font-semibold"
                  numberOfLines={1}
                >
                  {activeWallet?.name || "Active wallet"}
                </Text>
                <Text className="text-light-matte-black/50 text-xs mt-0.5">
                  {shortAddress(address)} · Changes apply to this wallet only
                  {hasMultipleWallets ? " unless you opt in below" : ""}.
                </Text>
              </View>
            </View>
          </View>

          {/* Defaults section */}
          <View className="mx-4 mb-6">
            <Text className="text-light-matte-black/50 text-xs uppercase tracking-wide mb-2 ml-1">
              Default thresholds
            </Text>
            <View
              className="bg-light rounded-2xl overflow-hidden"
              style={cardShadow}
            >
              <DefaultRow
                icon={Zap}
                label="Native tokens"
                hint="ETH, MATIC, BNB, …"
                value={thresholds.default_native_usd}
                onChange={(v) => handleSetDefault("native", v)}
              />
              <View className="h-px bg-light-matte-black/5" />
              <DefaultRow
                icon={Coins}
                label="ERC-20 tokens"
                hint="USDC, DAI, WETH, …"
                value={thresholds.default_token_usd}
                onChange={(v) => handleSetDefault("token", v)}
              />
              {hasMultipleWallets && (
                <>
                  <View className="h-px bg-light-matte-black/5" />
                  <TouchableOpacity
                    onPress={handleCopyDefaultsToAll}
                    accessibilityRole="button"
                    accessibilityLabel="Copy these defaults to all wallets"
                    className="px-4 py-3 flex-row items-center"
                  >
                    <View className="w-9 h-9 rounded-xl bg-light-matte-black/5 items-center justify-center mr-3">
                      <Users size={18} color="#444" />
                    </View>
                    <View className="flex-1">
                      <Text className="text-light-matte-black font-medium">
                        Copy defaults to all wallets
                      </Text>
                      <Text className="text-light-matte-black/50 text-xs mt-0.5">
                        Apply the values above to every wallet
                      </Text>
                    </View>
                  </TouchableOpacity>
                </>
              )}
            </View>
            <Text className="text-light-matte-black/50 text-xs mt-2 ml-1 leading-4">
              Enter $0 to make every transfer in that bucket require explicit
              approval. Defaults apply globally across chains within this
              wallet.
            </Text>
          </View>

          {/* Overrides section */}
          <View className="mx-4 mb-6">
            <View className="flex-row items-center justify-between mb-2 ml-1 mr-1">
              <Text className="text-light-matte-black/50 text-xs uppercase tracking-wide">
                Per-token overrides
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setEditingOverride(null);
                  setPickerOpen(true);
                }}
                accessibilityRole="button"
                accessibilityLabel="Add token override"
                className="flex-row items-center gap-1"
              >
                <Plus size={14} color="#c71c4b" />
                <Text className="text-light-primary-red text-xs font-semibold">
                  Add token
                </Text>
              </TouchableOpacity>
            </View>

            <View
              className="bg-light rounded-2xl overflow-hidden"
              style={cardShadow}
            >
              {overrides.length === 0 ? (
                <View className="px-4 py-6 items-center">
                  <Text className="text-light-matte-black/60 text-sm text-center">
                    No overrides yet
                  </Text>
                  <Text className="text-light-matte-black/40 text-xs text-center mt-1 max-w-[260px]">
                    Add tokens here to set a different threshold than the
                    defaults — useful for stablecoins or volatile tokens.
                  </Text>
                </View>
              ) : (
                overrides.map((override, index) => (
                  <View key={`${override.chainId}:${override.contractAddress}`}>
                    {index > 0 && (
                      <View className="h-px bg-light-matte-black/5" />
                    )}
                    <Pressable
                      onPress={() => {
                        setEditingOverride(override);
                        setPickerOpen(true);
                      }}
                      className="px-4 py-3 flex-row items-center justify-between"
                    >
                      <TokenAvatar
                        logoUrl={override.logoUrl}
                        symbol={override.symbol}
                        isNative={override.isNative}
                        size={32}
                      />
                      <View className="flex-1 pr-3">
                        <Text
                          className="text-light-matte-black font-semibold"
                          numberOfLines={1}
                        >
                          {override.symbol}
                          {override.isNative ? " (native)" : ""}
                        </Text>
                        <Text className="text-light-matte-black/50 text-xs mt-0.5">
                          Chain {override.chainId} ·{" "}
                          {shortAddress(override.contractAddress)}
                        </Text>
                      </View>
                      <Text className="text-light-matte-black font-semibold mr-3">
                        {formatThreshold(override.threshold_usd)}
                      </Text>
                      <TouchableOpacity
                        onPress={() => handleRemoveOverride(override)}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${override.symbol} override`}
                        hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                        className="bg-light-primary-red/10 w-7 h-7 rounded-full items-center justify-center"
                      >
                        <X size={14} color="#c71c4b" />
                      </TouchableOpacity>
                    </Pressable>
                  </View>
                ))
              )}
            </View>

            <Text className="text-light-matte-black/50 text-xs mt-2 ml-1 leading-4">
              Overrides win over defaults. Set a token to $0 to make it always
              ask, even when the default would auto-approve.
            </Text>
          </View>

          {/* Mental-model hint */}
          <View className="mx-4 mt-2 mb-8">
            <View className="bg-light-primary-red/5 rounded-2xl p-4">
              <Text className="text-light-matte-black font-semibold text-sm mb-2">
                How to think about this
              </Text>
              <Text className="text-light-matte-black/70 text-xs leading-5">
                · &quot;Auto-approve only USDC&quot; — set defaults to $0, add a USDC
                override at your limit.
              </Text>
              <Text className="text-light-matte-black/70 text-xs leading-5 mt-1">
                · &quot;Auto-approve everything except USDC&quot; — keep defaults, add a
                USDC override at $0.
              </Text>
              <Text className="text-light-matte-black/70 text-xs leading-5 mt-1">
                · &quot;Auto-approve a specific list&quot; — set defaults to $0, add an
                override per token.
              </Text>
            </View>
          </View>
        </ScrollView>

        {/* Token picker / threshold editor */}
        {pickerOpen && (
          <OverridePickerSheet
            chainId={chainId}
            walletAddress={address}
            existingOverride={editingOverride}
            wallets={wallets.map((w) => ({
              address: w.address as `0x${string}`,
              name: w.name,
            }))}
            onCancel={() => {
              setPickerOpen(false);
              setEditingOverride(null);
            }}
            onSave={handleSaveOverride}
          />
        )}
      </SafeAreaView>
    </>
  );
}

// --- Default row -----------------------------------------------------------

function DefaultRow({
  icon: Icon,
  label,
  hint,
  value,
  onChange,
}: {
  icon: typeof Coins;
  label: string;
  hint: string;
  value: number;
  onChange: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value.toString());
  useEffect(() => {
    setDraft(value === 0 ? "0" : String(value));
  }, [value]);

  return (
    <View className="px-4 py-3 flex-row items-center">
      <View className="w-9 h-9 rounded-xl bg-light-primary-red/10 items-center justify-center mr-3">
        <Icon size={18} color="#c71c4b" />
      </View>
      <View className="flex-1 pr-3">
        <Text className="text-light-matte-black font-semibold">{label}</Text>
        <Text className="text-light-matte-black/50 text-xs mt-0.5">{hint}</Text>
      </View>
      <View className="flex-row items-center bg-light-matte-black/5 rounded-xl px-3 py-1.5">
        <Text className="text-light-matte-black/60 mr-1">$</Text>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onBlur={() => onChange(draft)}
          keyboardType="decimal-pad"
          placeholder="0"
          accessibilityLabel={`${label} threshold in USD`}
          className="text-light-matte-black font-semibold min-w-[50px] text-right"
          style={{ minWidth: 50 }}
        />
      </View>
    </View>
  );
}

// --- Override picker sheet ------------------------------------------------

/**
 * Two-stage bottom sheet for adding/editing a single override.
 *
 * Stage 1 (pick):
 *   - Section "My assets" — tokens the user added on the active chain
 *     (read from the asset-explorer's AsyncStorage blob).
 *   - Section "Available tokens" — everything else the chain registry
 *     offers for this chain (native at the top, ERC-20s sorted).
 *
 * Stage 2 (amount):
 *   - Numeric input with quick-presets.
 *   - "Apply to all my wallets" switch (only shown when the user has
 *     more than one wallet — otherwise it'd be dead UI).
 *
 * When `existingOverride` is provided, we skip stage 1 and jump to
 * stage 2 with the existing amount pre-filled — the "edit row" path.
 */
interface WalletChoice {
  address: `0x${string}`;
  name: string;
}

function OverridePickerSheet({
  chainId,
  walletAddress,
  existingOverride,
  wallets,
  onCancel,
  onSave,
}: {
  chainId: number;
  walletAddress: `0x${string}`;
  existingOverride: TokenOverride | null;
  /** Every wallet in the app — used to build the "select wallets" stage. */
  wallets: WalletChoice[];
  onCancel: () => void;
  onSave: (override: TokenOverride, scope: SaveScope) => void;
}) {
  const { activeChain } = useWallet();
  // `nativeCurrencySymbol` is EVM-only today because the UI reaches into
  // viem's `chain.nativeCurrency` shape. When Solana token support lands,
  // add a `getNativeCurrencySymbol` kit hook rather than extending this
  // branch.
  const nativeCurrencySymbol =
    activeChain.namespace === "eip155"
      ? activeChain.chain.nativeCurrency.symbol
      : undefined;
  const activeChainName = formatChainLabel(activeChain);
  const { data: allTokens = [], isLoading: tokensLoading } = useTokens();
  const { data: blockchains } = useBlockchainsWithStorage();

  const hasMultipleWallets = wallets.length > 1;

  // Responsive max-height for the scrollable lists inside the sheet.
  // Previously hardcoded at 460px which clipped on short screens and
  // wasted space on tall ones. Reserve ~260px for the sheet chrome
  // (drag handle, header, bottom padding, safe area) — tuned so every
  // list row stays reachable on a 667pt (iPhone SE) screen.
  const { height: windowHeight } = useWindowDimensions();
  const sheetListMaxHeight = Math.max(280, windowHeight * 0.85 - 260);

  // Stage machine. `wallets` is the multi-select screen invoked from
  // the amount stage's scope control. Back button returns to amount.
  const [stage, setStage] = useState<"pick" | "amount" | "wallets">(
    existingOverride ? "amount" : "pick",
  );
  const [selected, setSelected] = useState<TokenOverride | null>(
    existingOverride,
  );
  const [amountDraft, setAmountDraft] = useState(
    existingOverride ? String(existingOverride.threshold_usd) : "10",
  );

  // Scope state — unified here so the three modes are mutually exclusive
  // by construction (no stale "applyToAll=true AND selectedAddresses=[…]"
  // state to reason about).
  const [scope, setScope] = useState<SaveScope>({ type: "this" });

  // Draft of the multi-select — the wallets stage commits to `scope`
  // only when the user taps Done, so a mid-flow cancel doesn't leak
  // a partial selection back to the amount stage's button.
  const [walletDraft, setWalletDraft] = useState<Set<string>>(new Set());

  // Keyboard-aware spacer — same pattern as AddContactModal. The sheet
  // sits at `bottom: 0` and the inner ScrollView grows a spacer equal
  // to the keyboard height when visible, so focused inputs scroll
  // above the keyboard edge instead of being hidden behind it.
  const keyboardHeightAnimation = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const onShow = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (event) => {
        Animated.timing(keyboardHeightAnimation, {
          toValue: event.endCoordinates.height,
          duration: Platform.OS === "ios" ? event.duration : 200,
          useNativeDriver: false,
        }).start();
      },
    );
    const onHide = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      (event) => {
        Animated.timing(keyboardHeightAnimation, {
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
  }, [keyboardHeightAnimation]);

  // Slide-in / slide-out animations. Mirrors the pattern used by
  // `BalanceSection` + `RecievePaymentModal`: parallel fade + translateY
  // driven by two `Animated.Value` refs, owned by this sheet so callers
  // don't have to thread state through.
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(SHEET_TRAVEL)).current;

  // Mount animation. Runs once when the sheet first appears.
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
    // Dismount animation is driven by `animatedCancel` below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reverse animation → then call parent onCancel (which unmounts us).
  const animatedCancel = useCallback(() => {
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
    ]).start(() => onCancel());
  }, [fadeAnim, translateY, onCancel]);

  // Drag-to-close gesture on the handle. Same thresholds as
  // `BalanceSection` — 50px travel OR 0.5 velocity triggers close.
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
          ]).start(() => onCancel());
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

  // User's added assets for this (wallet, chain) pair. Read once on
  // mount via a direct AsyncStorage call so we don't couple this
  // screen to `useActiveNetwork` (the asset-explorer's global state).
  const [myAssets, setMyAssets] = useState<TCryptoAsset[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    readUserAssetsForChain(walletAddress, chainId).then((assets) => {
      if (!cancelled) setMyAssets(assets);
    });
    return () => {
      cancelled = true;
    };
  }, [walletAddress, chainId]);

  // Look up the blockchain row so we can filter the registry tokens
  // by `blockchainId` (the registry uses UUIDs, not chain ids).
  const activeBlockchainRow = useMemo(
    () => blockchains?.find((b) => b.chainId === chainId) ?? null,
    [blockchains, chainId],
  );

  // Native token logo. Preference order:
  //   1. The blockchain registry's native-flagged token logoUrl (authoritative).
  //   2. `ChainConfig.iconUrl` from the viem-chains config (fallback).
  // Both can be undefined — the picker falls back to a monochrome icon.
  const nativeLogoUrl = useMemo<string | undefined>(() => {
    const nativeRow = activeBlockchainRow?.tokens?.find(
      (t) => t.isNativeCurrency,
    );
    return nativeRow?.logoUrl || activeChain?.iconUrl || undefined;
  }, [activeBlockchainRow, activeChain?.iconUrl]);

  // --- Section 1: user's added assets on this chain -----------------
  const myAssetsAsOverrides = useMemo<TokenOverride[]>(() => {
    if (!myAssets) return [];
    return myAssets.map((a) => {
      const isNative =
        !a.contractAddress ||
        a.contractAddress === "0x0000000000000000000000000000000000000000";
      return {
        chainId,
        contractAddress: isNative
          ? NATIVE_TOKEN_KEY
          : (a.contractAddress as string).toLowerCase(),
        symbol: a.symbol,
        isNative,
        threshold_usd: 0,
        // `TCryptoAsset.logo` stores either a remote URL or an empty
        // string — pass through only when non-empty so the picker
        // falls back cleanly.
        logoUrl: isNative
          ? nativeLogoUrl
          : a.logo && a.logo.length > 0
            ? a.logo
            : undefined,
      };
    });
  }, [myAssets, chainId, nativeLogoUrl]);

  // --- Section 2: everything on the chain, minus section 1 ----------
  const availableAsOverrides = useMemo<TokenOverride[]>(() => {
    const native: TokenOverride = {
      chainId,
      contractAddress: NATIVE_TOKEN_KEY,
      symbol: nativeCurrencySymbol ?? "ETH",
      isNative: true,
      threshold_usd: 0,
      logoUrl: nativeLogoUrl,
    };
    const blockchainId = activeBlockchainRow?.id;
    const erc20s: TokenOverride[] = allTokens
      .filter(
        (t) =>
          !t.isNativeCurrency &&
          t.isActive !== false &&
          (t.contractAddress?.length ?? 0) > 0 &&
          (blockchainId ? t.blockchainId === blockchainId : true),
      )
      .map((t) => ({
        chainId,
        contractAddress: t.contractAddress!.toLowerCase(),
        symbol: t.symbol,
        isNative: false,
        threshold_usd: 0,
        logoUrl: t.logoUrl || undefined,
      }))
      .sort((a, b) => a.symbol.localeCompare(b.symbol));

    const myKeys = new Set(
      myAssetsAsOverrides.map((t) => `${t.chainId}:${t.contractAddress}`),
    );
    return [native, ...erc20s].filter(
      (t) => !myKeys.has(`${t.chainId}:${t.contractAddress}`),
    );
  }, [
    allTokens,
    activeBlockchainRow?.id,
    chainId,
    nativeCurrencySymbol,
    myAssetsAsOverrides,
    nativeLogoUrl,
  ]);

  const handleConfirm = useCallback(() => {
    if (!selected) return;
    const usd = parseFloat(amountDraft);
    onSave(
      {
        ...selected,
        threshold_usd: Number.isFinite(usd) && usd >= 0 ? usd : 0,
      },
      scope,
    );
  }, [selected, amountDraft, onSave, scope]);

  // Commit the wallet multi-select draft into `scope` and return to
  // the amount stage. Collapsing to "this"/"all" when the selection
  // exactly equals either simplifies the saved override and keeps the
  // confirmation dialog accurate (no "Apply to 1 wallet" when the user
  // only picked the active wallet).
  const handleWalletsDone = useCallback(() => {
    const picked = Array.from(walletDraft) as `0x${string}`[];
    if (picked.length === 0) {
      setScope({ type: "this" });
    } else if (picked.length === wallets.length) {
      setScope({ type: "all" });
    } else if (
      picked.length === 1 &&
      picked[0].toLowerCase() === walletAddress.toLowerCase()
    ) {
      setScope({ type: "this" });
    } else {
      setScope({ type: "some", addresses: picked });
    }
    setStage("amount");
  }, [walletDraft, wallets.length, walletAddress]);

  return (
    <Modal
      transparent
      visible
      animationType="none"
      onRequestClose={animatedCancel}
    >
      <View style={{ flex: 1 }}>
        {/* Animated backdrop — tap to dismiss */}
        <TouchableWithoutFeedback onPress={animatedCancel}>
          <Animated.View
            style={{
              flex: 1,
              backgroundColor: "rgba(0, 0, 0, 0.5)",
              opacity: fadeAnim,
            }}
          />
        </TouchableWithoutFeedback>

        {/* Animated sheet — slides up from below, drag-to-close via
            the PanResponder attached to the drag handle */}
        <Animated.View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: "#f5f6f9",
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            paddingTop: 0,
            paddingBottom: 32,
            maxHeight: "85%",
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
          <View className="px-5 mb-4 flex-row items-center justify-between">
            <View className="flex-row items-center gap-2 flex-1">
              {stage === "wallets" && (
                <TouchableOpacity
                  onPress={() => setStage("amount")}
                  accessibilityLabel="Back to amount"
                  hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                >
                  <ArrowLeft size={18} color="#c71c4b" />
                </TouchableOpacity>
              )}
              <Text className="text-light-matte-black font-bold text-lg">
                {stage === "pick"
                  ? "Select a token"
                  : stage === "wallets"
                    ? "Choose wallets"
                    : `Set threshold for ${selected?.symbol}`}
              </Text>
            </View>
            <TouchableOpacity
              onPress={animatedCancel}
              accessibilityLabel="Cancel"
              className="bg-light-main-container p-2 rounded-full"
            >
              <X size={18} color="#c71c4b" />
            </TouchableOpacity>
          </View>

          {stage === "pick" ? (
            <ScrollView
              className="px-3"
              style={{ maxHeight: sheetListMaxHeight }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {tokensLoading && myAssets === null ? (
                <Text className="text-center text-light-matte-black/50 py-8">
                  Loading tokens…
                </Text>
              ) : (
                <>
                  {myAssetsAsOverrides.length > 0 && (
                    <PickerSection
                      title="My assets"
                      subtitle={`Tokens you've added on ${activeChainName ?? "this chain"}`}
                      tokens={myAssetsAsOverrides}
                      onSelect={(token) => {
                        setSelected(token);
                        setStage("amount");
                      }}
                    />
                  )}

                  <PickerSection
                    title="Available tokens"
                    subtitle={
                      myAssetsAsOverrides.length > 0
                        ? "Other tokens on this chain"
                        : `Tokens on ${activeChainName ?? "this chain"}`
                    }
                    tokens={availableAsOverrides}
                    onSelect={(token) => {
                      setSelected(token);
                      setStage("amount");
                    }}
                    emptyLabel={
                      availableAsOverrides.length === 0
                        ? "No tokens found for this chain"
                        : undefined
                    }
                  />
                </>
              )}
            </ScrollView>
          ) : (
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: 20 }}
            >
              <View className="flex-row items-center bg-light rounded-2xl px-4 py-3 mb-3">
                <Text className="text-light-matte-black/60 text-2xl mr-2">
                  $
                </Text>
                <TextInput
                  value={amountDraft}
                  onChangeText={setAmountDraft}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                  accessibilityLabel="Threshold amount in USD"
                  className="text-light-matte-black text-2xl font-bold flex-1"
                />
              </View>
              {/* "Always ask" shortcut is the only preset — arbitrary
                USD numbers make no sense across IDR-pegged / EUR-pegged
                / volatile-priced tokens. Users type the USD amount they
                want; we keep the semantic shortcut since it's
                currency-agnostic (threshold = 0 = always confirm). */}
              <View className="flex-row mb-1">
                <TouchableOpacity
                  onPress={() => setAmountDraft("0")}
                  className="bg-light rounded-xl py-2.5 px-4 self-start"
                  accessibilityRole="button"
                  accessibilityLabel="Always ask"
                >
                  <Text className="text-light-matte-black text-sm font-semibold">
                    Always ask
                  </Text>
                </TouchableOpacity>
              </View>
              <Text className="text-light-matte-black/50 text-[11px] mb-4 ml-1">
                Amount is in USD. The agent compares it against the USD value of
                the transfer at send time.
              </Text>

              {/* Save-scope control. Hidden when there's only one wallet —
                the three-way choice would all collapse to "this wallet"
                anyway, so showing the UI would be dead weight. */}
              {hasMultipleWallets && (
                <View className="mb-4">
                  <Text className="text-light-matte-black/50 text-[10px] uppercase tracking-wide mb-2 ml-1">
                    Save on
                  </Text>
                  <View
                    className="bg-light rounded-2xl overflow-hidden"
                    style={cardShadow}
                  >
                    <ScopeOption
                      icon={Wallet}
                      label="This wallet only"
                      hint="Default — changes stay on the active wallet."
                      selected={scope.type === "this"}
                      onPress={() => setScope({ type: "this" })}
                    />
                    <View className="h-px bg-light-matte-black/5" />
                    <ScopeOption
                      icon={Users}
                      label="All my wallets"
                      hint={`Apply to all ${wallets.length} wallets.`}
                      selected={scope.type === "all"}
                      onPress={() => setScope({ type: "all" })}
                    />
                    <View className="h-px bg-light-matte-black/5" />
                    <ScopeOption
                      icon={ListChecks}
                      label={
                        scope.type === "some"
                          ? `Selected wallets (${scope.addresses.length})`
                          : "Choose specific wallets…"
                      }
                      hint={
                        scope.type === "some"
                          ? "Tap to change your selection."
                          : "Pick any subset of your wallets."
                      }
                      selected={scope.type === "some"}
                      trailing={<ChevronRight size={16} color="#c71c4b" />}
                      onPress={() => {
                        // Pre-seed the draft from the current selection so
                        // "edit" feels continuous rather than a cold restart.
                        setWalletDraft(
                          new Set(
                            scope.type === "some"
                              ? scope.addresses
                              : [walletAddress],
                          ),
                        );
                        setStage("wallets");
                      }}
                    />
                  </View>
                </View>
              )}

              <TouchableOpacity
                onPress={handleConfirm}
                className="bg-light-primary-red rounded-2xl py-3.5 items-center"
                accessibilityRole="button"
                accessibilityLabel="Save threshold"
              >
                <Text className="text-white font-bold">
                  {existingOverride ? "Update" : "Add override"}
                  {scope.type === "all" ? " (all wallets)" : ""}
                  {scope.type === "some"
                    ? ` (${scope.addresses.length} wallet${scope.addresses.length === 1 ? "" : "s"})`
                    : ""}
                </Text>
              </TouchableOpacity>
              {!existingOverride && (
                <TouchableOpacity
                  onPress={() => setStage("pick")}
                  className="py-3 items-center"
                >
                  <Text className="text-light-matte-black/60 text-sm">
                    Pick a different token
                  </Text>
                </TouchableOpacity>
              )}

              {/* Dynamic spacer — grows to keyboard height + 66px so the
                focused $ input + Save button can always be scrolled
                above the keyboard edge. Same pattern as AddContactModal. */}
              <Animated.View
                style={{
                  height: Animated.add(
                    keyboardHeightAnimation,
                    EXTRA_SPACE_ABOVE_KEYBOARD,
                  ),
                }}
              />
            </ScrollView>
          )}

          {stage === "wallets" && (
            <WalletMultiSelect
              wallets={wallets}
              activeWalletAddress={walletAddress}
              draft={walletDraft}
              onDraftChange={setWalletDraft}
              onDone={handleWalletsDone}
              onCancel={() => setStage("amount")}
              // Wallet-select has extra chrome below the list (warning
              // banner, Apply, Back) — give it ~140px less than the
              // bare token picker gets.
              listMaxHeight={Math.max(220, sheetListMaxHeight - 140)}
            />
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

// --- Wallet multi-select ---------------------------------------------------

/**
 * Third stage of the override picker. Shows every wallet in the app
 * with a checkbox, plus quick actions (Select all / Clear). The parent
 * owns the draft `Set<string>` so returning to the amount stage keeps
 * the selection alive if the user taps Back then returns.
 */
function WalletMultiSelect({
  wallets,
  activeWalletAddress,
  draft,
  onDraftChange,
  onDone,
  onCancel,
  listMaxHeight,
}: {
  wallets: WalletChoice[];
  activeWalletAddress: `0x${string}`;
  draft: Set<string>;
  onDraftChange: (next: Set<string>) => void;
  onDone: () => void;
  onCancel: () => void;
  /** Budget for the inner ScrollView — computed by the parent against
   *  the window height so the list scrolls on short screens. */
  listMaxHeight: number;
}) {
  const allSelected = draft.size === wallets.length && wallets.length > 0;

  const toggleOne = useCallback(
    (address: string) => {
      const next = new Set(draft);
      const key = address.toLowerCase();
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      onDraftChange(next);
    },
    [draft, onDraftChange],
  );

  const toggleAll = useCallback(() => {
    if (allSelected) {
      onDraftChange(new Set());
    } else {
      onDraftChange(new Set(wallets.map((w) => w.address.toLowerCase())));
    }
  }, [allSelected, wallets, onDraftChange]);

  return (
    <View className="px-5">
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-light-matte-black/60 text-xs">
          {draft.size} of {wallets.length} selected
        </Text>
        <TouchableOpacity onPress={toggleAll} accessibilityRole="button">
          <Text className="text-light-primary-red text-xs font-semibold">
            {allSelected ? "Clear all" : "Select all"}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ maxHeight: listMaxHeight }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        className="bg-light rounded-2xl overflow-hidden mb-3"
      >
        {wallets.map((w, i) => {
          const key = w.address.toLowerCase();
          const isSelected = draft.has(key);
          const isActive =
            w.address.toLowerCase() === activeWalletAddress.toLowerCase();
          return (
            <View key={w.address}>
              {i > 0 && <View className="h-px bg-light-matte-black/5" />}
              <TouchableOpacity
                onPress={() => toggleOne(w.address)}
                className="px-4 py-3 flex-row items-center"
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isSelected }}
                accessibilityLabel={`${w.name}, ${isSelected ? "selected" : "not selected"}`}
              >
                {/* Checkbox */}
                <View
                  className={`w-5 h-5 rounded border-2 mr-3 items-center justify-center ${
                    isSelected
                      ? "border-light-primary-red bg-light-primary-red"
                      : "border-light-matte-black/30"
                  }`}
                >
                  {isSelected && <Check size={14} color="white" />}
                </View>
                <View className="flex-1">
                  <View className="flex-row items-center">
                    <Text
                      className="text-light-matte-black font-semibold"
                      numberOfLines={1}
                    >
                      {w.name}
                    </Text>
                    {isActive && (
                      <View className="bg-light-primary-red/10 rounded-full px-1.5 py-0.5 ml-2">
                        <Text className="text-light-primary-red text-[10px] font-semibold">
                          Active
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text className="text-light-matte-black/50 text-xs mt-0.5">
                    {`${w.address.slice(0, 6)}…${w.address.slice(-4)}`}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          );
        })}
      </ScrollView>

      <View
        className="rounded-2xl px-4 py-3 mb-3"
        style={{ backgroundColor: "#c71c4b15" }}
      >
        <Text className="text-light-primary-red text-xs leading-5">
          Be sure you know what you&apos;re doing. Thresholds control how much the
          agent can move on these wallets without asking. You&apos;ll get a final
          confirmation before the save lands.
        </Text>
      </View>

      <TouchableOpacity
        onPress={onDone}
        disabled={draft.size === 0}
        className={`rounded-2xl py-3.5 items-center ${
          draft.size === 0 ? "bg-light-matte-black/20" : "bg-light-primary-red"
        }`}
        accessibilityRole="button"
        accessibilityLabel="Apply selection"
      >
        <Text className="text-white font-bold">
          {draft.size === 0
            ? "Pick at least one wallet"
            : `Use ${draft.size} wallet${draft.size === 1 ? "" : "s"}`}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onCancel} className="py-3 items-center">
        <Text className="text-light-matte-black/60 text-sm">Back</Text>
      </TouchableOpacity>
    </View>
  );
}

// --- Scope option row ------------------------------------------------------

function ScopeOption({
  icon: Icon,
  label,
  hint,
  selected,
  trailing,
  onPress,
}: {
  icon: typeof Wallet;
  label: string;
  hint: string;
  selected: boolean;
  trailing?: React.ReactNode;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      className="px-4 py-3 flex-row items-center"
    >
      <View
        className={`w-5 h-5 rounded-full border-2 mr-3 items-center justify-center ${
          selected ? "border-light-primary-red" : "border-light-matte-black/30"
        }`}
      >
        {selected && (
          <View className="w-2.5 h-2.5 rounded-full bg-light-primary-red" />
        )}
      </View>
      <View className="w-9 h-9 rounded-xl bg-light-matte-black/5 items-center justify-center mr-3">
        <Icon size={16} color="#444" />
      </View>
      <View className="flex-1 pr-2">
        <Text className="text-light-matte-black font-semibold text-sm">
          {label}
        </Text>
        <Text className="text-light-matte-black/60 text-xs mt-0.5">{hint}</Text>
      </View>
      {trailing}
    </TouchableOpacity>
  );
}

// --- Token avatar ----------------------------------------------------------

/**
 * Circular token logo used by the picker rows and the override list.
 *
 * When a logo URL is present we render it via `OptimizedImage` (which
 * wraps expo-image's memory+disk cache). Missing / failed URLs fall
 * back to the symbol's first two characters on a tinted background —
 * monochrome "Zap / Coins" icons carried no information beyond
 * native-vs-token and looked identical for every row, which made the
 * picker noisy.
 */
function TokenAvatar({
  logoUrl,
  symbol,
  isNative,
  size = 36,
}: {
  logoUrl?: string;
  symbol: string;
  isNative: boolean;
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
  // Fallback — first two characters of the symbol on a tinted circle.
  // The native-vs-ERC20 distinction is already surfaced elsewhere
  // (e.g. the "(native)" suffix on override rows) so we don't need a
  // separate icon here.
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

// --- Picker section --------------------------------------------------------

function PickerSection({
  title,
  subtitle,
  tokens,
  onSelect,
  emptyLabel,
}: {
  title: string;
  subtitle?: string;
  tokens: TokenOverride[];
  onSelect: (token: TokenOverride) => void;
  emptyLabel?: string;
}) {
  return (
    <View className="mb-4">
      <View className="px-2 mb-2">
        <Text className="text-light-matte-black/50 text-[10px] uppercase tracking-wide">
          {title}
        </Text>
        {subtitle && (
          <Text className="text-light-matte-black/40 text-xs mt-0.5">
            {subtitle}
          </Text>
        )}
      </View>
      {tokens.length === 0 ? (
        emptyLabel ? (
          <Text className="text-light-matte-black/40 text-xs text-center py-4 px-2">
            {emptyLabel}
          </Text>
        ) : null
      ) : (
        <View className="bg-light rounded-2xl overflow-hidden">
          {tokens.map((token, i) => (
            <View key={`${token.chainId}:${token.contractAddress}`}>
              {i > 0 && <View className="h-px bg-light-matte-black/5" />}
              <TouchableOpacity
                onPress={() => onSelect(token)}
                className="px-4 py-3 flex-row items-center"
                accessibilityRole="button"
                accessibilityLabel={`Select ${token.symbol}`}
              >
                <TokenAvatar
                  logoUrl={token.logoUrl}
                  symbol={token.symbol}
                  isNative={token.isNative}
                  size={28}
                />
                <View className="flex-1">
                  <Text className="text-light-matte-black font-semibold">
                    {token.symbol}
                  </Text>
                  <Text className="text-light-matte-black/50 text-xs">
                    {shortAddress(token.contractAddress)}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const cardShadow = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.04,
  shadowRadius: 6,
  elevation: 1,
};
