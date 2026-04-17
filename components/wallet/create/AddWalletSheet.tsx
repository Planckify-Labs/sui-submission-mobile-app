/**
 * `AddWalletSheet` — top-level wallet-management entry point (spec
 * §14.5 / §14.8). Renders a three-card picker; each card swaps in the
 * matching sub-sheet (create / import seed / import pk).
 *
 * Call sites (wired by Task 26, not here):
 *   - `wallet.tsx` "+" header button
 *   - `wallet.tsx` empty-state CTA
 *   - `WalletSwitcherModal.onAddWallet`
 *
 * Modal composition — one modal at a time:
 *   The sub-sheets (`CreateWalletSheet`, `ImportSeedPhraseSheet`,
 *   `ImportPrivateKeySheet`) each render their own `react-native`
 *   `Modal`. To avoid a double-modal overlay (parent picker modal +
 *   child sub-sheet modal stacked with duplicated chrome), this
 *   component renders EITHER the picker modal OR the active sub-sheet
 *   — never both. The step state picks which one is mounted.
 *
 * State reset rules (spec §14.5, non-negotiable):
 *   - `handleClose` always resets `step` to `"picker"` so closing
 *     wipes flow progress.
 *   - A `visible` hidden → visible transition also resets to
 *     `"picker"` so re-opening never lands mid-flow (defence in depth
 *     for cases where the parent forgets to reset between opens).
 *   - Each sub-sheet's `onClose` returns to the picker rather than
 *     closing the whole sheet — the back chevron feels like a sub-flow
 *     rewind, not an exit.
 *
 * Pattern: matches `WalletSwitcherModal.tsx` (`react-native` `Modal` +
 * `Animated` + `PanResponder`). No `@gorhom/bottom-sheet` — the
 * sibling sheets don't use it either.
 */

import { ChevronRight, KeyRound, Plus, ShieldCheck, X } from "lucide-react-native";
import React, {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  Dimensions,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  Text,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { TWallet } from "@/constants/types/walletTypes";
import { useWallet } from "@/hooks/useWallet";
import { bootstrapFirstLoginWallets } from "@/services/walletKit/bootstrap";
import ImportPrivateKeySheet from "./ImportPrivateKeySheet";
import ImportSeedPhraseSheet from "./ImportSeedPhraseSheet";
import {
  type AddWalletStep,
  reducerOnImportSeedPhraseInstead,
  shouldResetOnVisibleChange,
} from "./AddWalletSheet.helpers";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
// Picker is short — three cards + header. Don't reserve 92% like the
// sub-sheets; a ~55% sheet keeps the background visible and feels less
// committal than the multi-step flows.
const PICKER_HEIGHT = Math.min(Math.round(SCREEN_HEIGHT * 0.55), 520);

type Props = {
  visible: boolean;
  onClose: () => void;
  onWalletAdded: (walletOrWallets: TWallet | TWallet[]) => void;
};

type PickerCardProps = {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onPress: () => void;
  testID?: string;
  disabled?: boolean;
};

const PickerCard: React.FC<PickerCardProps> = memo(function PickerCard({
  icon,
  title,
  subtitle,
  onPress,
  testID,
  disabled,
}: PickerCardProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      accessibilityState={{ disabled: !!disabled }}
      testID={testID}
      // min 56pt tap target → comfortably above the 44pt iOS / 48dp
      // Android floor for the whole card surface.
      className={`flex-row items-center bg-light rounded-2xl px-4 py-4 mb-3 ${disabled ? "opacity-60" : ""}`}
    >
      <View className="w-11 h-11 rounded-full bg-light-primary-red/10 items-center justify-center mr-3">
        {icon}
      </View>
      <View className="flex-1 pr-2">
        <Text className="text-light-matte-black font-bold text-base">
          {title}
        </Text>
        <Text className="text-light-matte-black/60 text-sm mt-0.5">
          {subtitle}
        </Text>
      </View>
      <ChevronRight size={20} color="#20222c80" />
    </Pressable>
  );
});

const AddWalletSheet: React.FC<Props> = memo(function AddWalletSheet({
  visible,
  onClose,
  onWalletAdded,
}: Props) {
  const [step, setStep] = useState<AddWalletStep>("picker");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const { addWallets } = useWallet();
  const { bottom } = useSafeAreaInsets();
  const bottomOffset = Platform.OS === "ios" ? 16 : bottom > 0 ? bottom : 16;

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(PICKER_HEIGHT)).current;
  const prevVisibleRef = useRef<boolean>(false);

  // Close handler: always wipe the step so next open starts on the
  // picker (spec §14.5). Parent controls the `visible` flag; we just
  // report the close event.
  const handleClose = useCallback(() => {
    setStep("picker");
    onClose();
  }, [onClose]);

  // Edge-detect hidden→visible transitions. If the parent re-opens the
  // sheet without an intermediate close (e.g. deep-link that flips
  // visible true→false→true quickly), still land on the picker.
  useEffect(() => {
    if (shouldResetOnVisibleChange(prevVisibleRef.current, visible)) {
      setStep("picker");
    }
    prevVisibleRef.current = visible;
  }, [visible]);

  // Animate picker modal open. Only runs while the picker step is
  // active — sub-sheet modals run their own animations.
  useEffect(() => {
    if (visible && step === "picker") {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Snap animation state back to "closed" so next time we become
      // the picker, the open animation plays from the bottom.
      fadeAnim.setValue(0);
      translateY.setValue(PICKER_HEIGHT);
    }
  }, [visible, step, fadeAnim, translateY]);

  // Android hardware back while picker is visible → close entirely.
  useEffect(() => {
    if (!visible || step !== "picker") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      handleClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, step, handleClose]);

  const animateCloseThen = useCallback(
    (after: () => void) => {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: PICKER_HEIGHT,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => after());
    },
    [fadeAnim, translateY],
  );

  // Swipe-dismiss on the picker drag handle. Mirrors the thresholds
  // used by `CreateWalletSheet` / `WalletSwitcherModal`.
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 0,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 60 || g.vy > 0.5) {
          animateCloseThen(handleClose);
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 4,
          }).start();
        }
      },
    }),
  ).current;

  // ── Sub-sheet wiring ───────────────────────────────────────────────
  // Each sub-sheet gets `visible={visible && step === "..."}` so only
  // one modal is ever mounted at a time. On success they forward
  // their wallet payload through `onWalletAdded` and we close the
  // whole sheet (resetting the step). On their own `onClose`, we rewind
  // to the picker so the user can try another option.
  const handleSubSheetClose = useCallback(() => {
    setStep("picker");
  }, []);

  // "Create new wallet" → silently auto-mint one wallet per registered
  // kit from a single CSPRNG mnemonic (spec §14.3). No seed reveal, no
  // verify step, no namespace picker. Backup lives on wallet.tsx as a
  // follow-up settings flow.
  const handleCreatePressed = useCallback(async () => {
    if (creating) return;
    setCreateError(null);
    setCreating(true);
    try {
      const minted = await bootstrapFirstLoginWallets();
      if (minted.length === 0) {
        setCreateError("Could not create a wallet — please try again.");
        return;
      }
      await addWallets(minted);
      onWalletAdded(minted);
      setCreating(false);
      handleClose();
    } catch {
      setCreateError("Could not create a wallet — please try again.");
    } finally {
      setCreating(false);
    }
  }, [creating, addWallets, onWalletAdded, handleClose]);

  const handleSeedWalletsAdded = useCallback(
    (wallets: TWallet[]) => {
      onWalletAdded(wallets);
      handleClose();
    },
    [onWalletAdded, handleClose],
  );

  const handlePrivateKeyWalletAdded = useCallback(
    (wallet: TWallet) => {
      onWalletAdded(wallet);
      handleClose();
    },
    [onWalletAdded, handleClose],
  );

  const handleImportSeedPhraseInstead = useCallback(() => {
    setStep((prev) => reducerOnImportSeedPhraseInstead(prev));
  }, []);

  // ── Render: mutual exclusion between picker modal and sub-sheets ──
  // "create" is no longer a sub-sheet step — it's an inline auto-mint
  // triggered from the picker card. Only "seed" and "pk" route to
  // dedicated sub-sheets.
  if (step === "seed") {
    return (
      <ImportSeedPhraseSheet
        visible={visible}
        onClose={handleSubSheetClose}
        onWalletsAdded={handleSeedWalletsAdded}
      />
    );
  }

  if (step === "pk") {
    return (
      <ImportPrivateKeySheet
        visible={visible}
        onClose={handleSubSheetClose}
        onWalletAdded={handlePrivateKeyWalletAdded}
        onImportSeedPhraseInstead={handleImportSeedPhraseInstead}
      />
    );
  }

  // step === "picker"
  if (!visible) return null;

  return (
    <Modal
      transparent
      visible
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
                transform: [{ translateY }],
                height: PICKER_HEIGHT,
                marginTop: "auto",
                paddingBottom: bottomOffset,
              }}
              className="bg-light-main-container rounded-t-3xl"
            >
              {/* Drag handle — swipe-down closes. */}
              <View
                {...panResponder.panHandlers}
                className="items-center py-3"
              >
                <View className="w-10 h-1 bg-light-matte-black/20 rounded-full" />
              </View>

              {/* Header */}
              <View className="flex-row items-center justify-between px-4 pb-3">
                <Text className="text-light-matte-black text-xl font-bold">
                  Add wallet
                </Text>
                <Pressable
                  onPress={handleClose}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  className="w-9 h-9 rounded-full bg-light-matte-black/10 items-center justify-center"
                >
                  <X size={18} color="#20222c" />
                </Pressable>
              </View>

              {/* Cards */}
              <View className="px-4 pt-2">
                <PickerCard
                  testID="add-wallet-card-create"
                  icon={
                    creating ? (
                      <ActivityIndicator size="small" color="#c71c4b" />
                    ) : (
                      <Plus size={22} color="#c71c4b" />
                    )
                  }
                  title={creating ? "Creating wallet…" : "Create new wallet"}
                  subtitle="Generates a wallet on every supported chain"
                  onPress={handleCreatePressed}
                  disabled={creating}
                />
                {createError ? (
                  <Text className="text-light-primary-red text-xs mb-2 px-1">
                    {createError}
                  </Text>
                ) : null}
                <PickerCard
                  testID="add-wallet-card-seed"
                  icon={<ShieldCheck size={22} color="#c71c4b" />}
                  title="Import seed phrase"
                  subtitle="12 or 24 words"
                  onPress={() => setStep("seed")}
                  disabled={creating}
                />
                <PickerCard
                  testID="add-wallet-card-pk"
                  icon={<KeyRound size={22} color="#c71c4b" />}
                  title="Import private key"
                  subtitle="One chain, one key"
                  onPress={() => setStep("pk")}
                  disabled={creating}
                />
              </View>
            </Animated.View>
          </TouchableWithoutFeedback>
        </Animated.View>
      </TouchableWithoutFeedback>
    </Modal>
  );
});

export default AddWalletSheet;
export { AddWalletSheet };
export type { Props as AddWalletSheetProps };
