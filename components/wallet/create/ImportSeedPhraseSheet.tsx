/**
 * `ImportSeedPhraseSheet` — namespace-agnostic paste of a 12/24-word
 * BIP-39 mnemonic, namespace multi-select, and batch import (spec
 * §14.6, §14.7, Task 24).
 *
 * Flow:
 *   1. Paste textarea — a 12 or 24 word BIP-39 phrase. On blur we trim,
 *      collapse whitespace, lowercase, then validate the checksum via
 *      `@scure/bip39::validateMnemonic` (through
 *      `validateMnemonicState`). Invalid → inline error; valid →
 *      "Next" enables.
 *   2. Namespace picker (multi-select) — defaults to every registered
 *      namespace. User can uncheck chains they don't want on this
 *      device. Confirm disabled when the selection is empty.
 *   3. Confirm — `deriveWalletsFromMnemonic(mnemonic, namespaces,
 *      defaultWalletNameFor)`, then `filterDuplicates(...)` to skip any
 *      `namespace:address` pair already in the bundle. A non-fatal
 *      banner surfaces the skipped chain(s); the remaining wallets
 *      still import via `useWallet.addWallets(...)` (one
 *      `saveWalletsToStorage` round-trip, one biometric prompt —
 *      TWV-2026-060 bundle-mode).
 *
 * Rules (non-negotiable, spec §14.6 / §14.7):
 *   - BIP-39 checksum runs BEFORE derivation so users see a clear
 *     inline error instead of a cryptic derive throw.
 *   - Default all namespaces checked (matches the "import my seed gets
 *     me everywhere" expectation from Task 23).
 *   - TWV-2026-057 dwell discipline: the mnemonic lives only in the
 *     component's local state while the sheet is open. On
 *     `resetState` — called by cancel, swipe-down, Android back, and
 *     after a successful import — we drop every reference. We never
 *     log the mnemonic or pass it to a crash-reporter sink.
 *   - Trim + normalise on input — accept mixed case and extra
 *     whitespace; normalise before validation and before handing the
 *     mnemonic to the derivation helper.
 *   - Batch add → single save → single biometric prompt.
 *   - We do NOT mutate / replace `useWallet.addWallets`; we call the
 *     existing one landed in Task 23.
 *
 * Pattern: matches `CreateWalletSheet.tsx` — `react-native` `Modal` +
 * `Animated` + `PanResponder`. No `@gorhom/bottom-sheet` because the
 * sibling sheets don't use it.
 */

import { ArrowLeft, Check, Info, X } from "lucide-react-native";
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
  BackHandler,
  Dimensions,
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
import type { TWallet } from "@/constants/types/walletTypes";
import { useWallet } from "@/hooks/useWallet";
import type { Namespace } from "@/services/chains/types";
import { useScreenshotGuard } from "@/services/security/screenshotGuard";
import { defaultWalletNameFor } from "@/services/walletKit/bootstrap";
import { deriveWalletsFromMnemonic } from "@/services/walletKit/deriveAll";
import { walletKitRegistry } from "@/services/walletKit/registry";
import {
  filterDuplicates,
  normalizeMnemonic,
  validateMnemonicState,
} from "./ImportSeedPhraseSheet.helpers";
import NamespacePicker from "./NamespacePicker";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.92;

type Props = {
  visible: boolean;
  onClose: () => void;
  onWalletsAdded: (wallets: TWallet[]) => void;
};

type Step = 1 | 2 | 3;

function allRegisteredNamespaces(): Namespace[] {
  return walletKitRegistry.getAll().map((k) => k.namespace);
}

/**
 * Human label for a namespace, preferring the registered kit's
 * `displayName` and falling back to a hard-coded table for the common
 * chain families. Keeps the banner copy readable (`"Ethereum"` rather
 * than `"eip155"`) — a single import derives Ethereum + Polygon + BSC
 * from the same seed, and most users recognise "Ethereum" as the
 * family label.
 */
function displayNameFor(ns: Namespace): string {
  const kit = walletKitRegistry.getAll().find((k) => k.namespace === ns);
  if (kit?.displayName) return kit.displayName;
  switch (ns) {
    case "eip155":
      return "Ethereum";
    case "solana":
      return "Solana";
    case "sui":
      return "Sui";
    default:
      return ns;
  }
}

const ImportSeedPhraseSheet: React.FC<Props> = memo(
  function ImportSeedPhraseSheet({ visible, onClose, onWalletsAdded }: Props) {
    // Screenshot guard — the paste textarea displays the mnemonic in
    // plaintext; engage the refcounted guard while the sheet is open so
    // recording / screenshotting during the flow is blocked.
    // `alertOnScreenshot` is on because the user can paste their full
    // mnemonic into the textarea.
    useScreenshotGuard(visible, { alertOnScreenshot: true });

    const { addWallets } = useWallet();
    const { bottom } = useSafeAreaInsets();
    const bottomOffset = Platform.OS === "ios" ? 16 : bottom > 0 ? bottom : 16;

    // ── State ──────────────────────────────────────────────────────
    // Step machine — explicit enum rather than derived from state so
    // back-navigation is unambiguous.
    const [step, setStep] = useState<Step>(1);

    // Paste textarea — raw user input. `normalisedMnemonic` is derived
    // lazily so we never stash a second copy in state.
    const [rawInput, setRawInput] = useState<string>("");
    // `hasBlurred` flips true the first time the field loses focus so
    // we don't flash a red error while the user is still typing.
    const [hasBlurred, setHasBlurred] = useState<boolean>(false);

    const [namespaces, setNamespaces] = useState<Namespace[]>(() =>
      allRegisteredNamespaces(),
    );

    // Confirm step.
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [completed, setCompleted] = useState<boolean>(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [skippedNamespaces, setSkippedNamespaces] = useState<Namespace[]>([]);
    const [allDuplicates, setAllDuplicates] = useState<boolean>(false);

    const validationState = useMemo(
      () => validateMnemonicState(rawInput),
      [rawInput],
    );

    // Show the inline error only AFTER the user has blurred the field
    // at least once (or tried to advance). This keeps the red copy from
    // flashing while they're still typing / pasting in chunks.
    const showInvalidError = hasBlurred && validationState === "invalid";

    // ── Animated sheet ────────────────────────────────────────────
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;

    const resetState = useCallback(() => {
      // TWV-2026-057 dwell discipline — drop every reference to the
      // mnemonic before the sheet next opens.
      setStep(1);
      setRawInput("");
      setHasBlurred(false);
      setNamespaces(allRegisteredNamespaces());
      setIsSaving(false);
      setCompleted(false);
      setErrorMsg(null);
      setSkippedNamespaces([]);
      setAllDuplicates(false);
    }, []);

    const animateClose = useCallback(
      (after?: () => void) => {
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: SHEET_HEIGHT,
            duration: 200,
            useNativeDriver: true,
          }),
        ]).start(() => {
          after?.();
        });
      },
      [fadeAnim, translateY],
    );

    const handleCancel = useCallback(() => {
      if (isSaving) return; // cannot cancel mid-save
      animateClose(() => {
        resetState();
        onClose();
      });
    }, [animateClose, resetState, onClose, isSaving]);

    // Open-animation effect
    useEffect(() => {
      if (visible) {
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
      }
    }, [visible, fadeAnim, translateY]);

    // Android hardware back — mirror the X button.
    useEffect(() => {
      if (!visible) return;
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        handleCancel();
        return true;
      });
      return () => sub.remove();
    }, [visible, handleCancel]);

    // Swipe-down gesture on the drag handle.
    const panResponder = useRef(
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) => g.dy > 0,
        onPanResponderMove: (_, g) => {
          if (g.dy > 0) translateY.setValue(g.dy);
        },
        onPanResponderRelease: (_, g) => {
          if (g.dy > 60 || g.vy > 0.5) {
            animateClose(() => {
              resetState();
              onClose();
            });
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

    // ── Handlers ───────────────────────────────────────────────────
    const handlePasteBlur = useCallback(() => {
      setHasBlurred(true);
      // Normalise the stored value so the textarea shows the cleaned
      // phrase on subsequent focus. This is NOT the moment we validate
      // — the memoised `validationState` already re-runs on any input
      // change — but it does give the user visible feedback that we
      // collapsed their whitespace before the check.
      const normalised = normalizeMnemonic(rawInput);
      if (normalised !== rawInput) {
        setRawInput(normalised);
      }
    }, [rawInput]);

    const handleStep1Next = useCallback(() => {
      // Mark as blurred so we can surface the error if somehow the
      // user taps Next with an invalid value (e.g. software keyboard
      // quirks swallowing the blur event).
      setHasBlurred(true);
      if (validationState !== "valid") return;
      setStep(2);
    }, [validationState]);

    const handleStep2Next = useCallback(() => {
      if (namespaces.length === 0) return;
      setStep(3);
    }, [namespaces]);

    const handleConfirm = useCallback(async () => {
      if (isSaving || completed) return;
      setErrorMsg(null);
      setSkippedNamespaces([]);
      setAllDuplicates(false);
      setIsSaving(true);
      try {
        const mnemonicString = normalizeMnemonic(rawInput);
        // Defence-in-depth — re-validate here so we never feed an
        // invalid mnemonic to the derivation layer even if the UI
        // state somehow drifted.
        if (validateMnemonicState(mnemonicString) !== "valid") {
          throw new Error("This doesn't look like a valid BIP-39 phrase.");
        }
        // TWV-2026-057 — derive, partition, hand off. Local refs drop
        // at function exit.
        const derived = await deriveWalletsFromMnemonic(
          mnemonicString,
          namespaces,
          defaultWalletNameFor,
        );
        if (derived.length === 0) {
          throw new Error("We couldn't derive any wallets from this phrase.");
        }
        // Snapshot the existing wallets AT CONFIRM-TIME — the
        // `useWallet` hook's `addWallets` does its own secondary
        // dedup, so the partition here is purely for the UX banner.
        const { toAdd, skipped } = filterDuplicates(
          derived,
          (useWalletSnapshot.current as { wallets: TWallet[] }).wallets,
        );
        if (skipped.length > 0) {
          setSkippedNamespaces(skipped);
        }
        if (toAdd.length === 0) {
          // Every derived wallet is already imported — surface the
          // banner and let the user cancel. Confirm button disables
          // via `allDuplicates` so they don't get an opaque retry.
          setAllDuplicates(true);
          return;
        }
        const ok = await addWallets(toAdd);
        if (!ok) {
          throw new Error("Failed to save wallets");
        }
        setCompleted(true);
        onWalletsAdded(toAdd);
        // Defer close so users see the success flash briefly.
        animateClose(() => {
          resetState();
          onClose();
        });
      } catch (e) {
        if (__DEV__) {
          console.warn("[ImportSeedPhraseSheet] confirm threw", e);
        }
        setErrorMsg("We couldn't import this wallet. Please try again.");
      } finally {
        setIsSaving(false);
      }
    }, [
      rawInput,
      namespaces,
      addWallets,
      onWalletsAdded,
      onClose,
      animateClose,
      resetState,
      isSaving,
      completed,
    ]);

    // `useWallet` returns a fresh `wallets` reference on every bundle
    // change — capture it in a ref so `handleConfirm` doesn't close
    // over a stale list if the user opens the sheet, waits, and only
    // then confirms. Kept separate from the `addWallets` dep so the
    // confirm callback doesn't re-create on every unrelated
    // wallet-state tick.
    const useWalletSnapshot = useRef<{ wallets: TWallet[] }>({ wallets: [] });
    const { wallets } = useWallet();
    useEffect(() => {
      useWalletSnapshot.current.wallets = wallets;
    }, [wallets]);

    const handleBack = useCallback(() => {
      if (isSaving) return;
      if (step === 1) {
        handleCancel();
        return;
      }
      setStep((s) => (s === 3 ? 2 : 1) as Step);
    }, [step, isSaving, handleCancel]);

    if (!visible) return null;

    // ── Step renderers ──────────────────────────────────────────────
    const renderStep1 = () => (
      <>
        <Text className="text-light-matte-black text-2xl font-bold mb-2">
          Enter your recovery phrase
        </Text>
        <Text className="text-light-matte-black/70 mb-4">
          Paste or type your 12 or 24 word BIP-39 seed phrase. Your phrase stays
          on this device — we never send it anywhere.
        </Text>

        <TextInput
          value={rawInput}
          onChangeText={setRawInput}
          onBlur={handlePasteBlur}
          placeholder="word1 word2 word3 …"
          placeholderTextColor="#00000066"
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          className={`bg-light-main-container border rounded-xl px-4 py-3 text-light-matte-black min-h-[140px] ${
            showInvalidError
              ? "border-light-primary-red"
              : "border-light-matte-black/10"
          }`}
        />
        {showInvalidError ? (
          <Text className="text-light-primary-red text-sm mt-2 font-medium">
            This doesn&apos;t look like a valid BIP-39 phrase.
          </Text>
        ) : null}
        {validationState === "valid" ? (
          <Text className="text-light-matte-black/60 text-xs mt-2">
            Phrase looks good. Tap Next to pick the chains to derive.
          </Text>
        ) : null}

        <View className="bg-light-primary-red/10 rounded-xl p-4 mt-4">
          <View className="flex-row items-start gap-2">
            <Info size={20} color="#c71c4b" />
            <Text className="text-light-matte-black flex-1 font-medium">
              Never share this phrase. TakumiPay will never ask for it.
            </Text>
          </View>
        </View>
      </>
    );

    const renderStep2 = () => (
      <>
        <Text className="text-light-matte-black text-2xl font-bold mb-2">
          Choose chains
        </Text>
        <Text className="text-light-matte-black/70 mb-4">
          Your phrase can create a wallet on each chain below. Uncheck any you
          don&apos;t want on this device — you can always add them later.
        </Text>
        <NamespacePicker
          mode="multi"
          selected={namespaces}
          onChange={setNamespaces}
        />
        {namespaces.length === 0 ? (
          <Text className="text-light-primary-red mt-3 font-medium">
            Pick at least one chain to continue.
          </Text>
        ) : null}
      </>
    );

    const renderStep3 = () => (
      <View className="py-6">
        {isSaving ? (
          <View className="items-center justify-center">
            <ActivityIndicator size="large" color="#c71c4b" />
            <Text className="text-light-matte-black font-medium mt-4">
              Importing your wallets…
            </Text>
          </View>
        ) : completed ? (
          <View className="items-center justify-center">
            <View className="w-16 h-16 rounded-full bg-light-primary-red/10 items-center justify-center mb-3">
              <Check size={36} color="#c71c4b" strokeWidth={3} />
            </View>
            <Text className="text-light-matte-black text-xl font-bold mb-1">
              Wallets imported
            </Text>
            <Text className="text-light-matte-black/70 text-center">
              You&apos;re all set.
            </Text>
          </View>
        ) : (
          <>
            <Text className="text-light-matte-black font-medium text-center mb-4">
              Ready to import {namespaces.length} wallet
              {namespaces.length === 1 ? "" : "s"} from your phrase?
            </Text>

            {skippedNamespaces.length > 0 ? (
              <View className="bg-yellow-100 rounded-xl p-3 mb-3 w-full">
                <Text className="text-light-matte-black font-semibold mb-1">
                  Already imported:{" "}
                  {skippedNamespaces.map(displayNameFor).join(", ")}
                </Text>
                <Text className="text-light-matte-black/70 text-xs">
                  {allDuplicates
                    ? "Every chain you picked already lives in your wallet list. Tap close to exit."
                    : "We'll skip these and import the rest."}
                </Text>
              </View>
            ) : null}

            {errorMsg ? (
              <View className="bg-light-primary-red/10 rounded-xl p-3 mb-2 w-full">
                <Text className="text-light-primary-red font-medium">
                  {errorMsg}
                </Text>
              </View>
            ) : null}
          </>
        )}
      </View>
    );

    // ── Footer buttons per step ─────────────────────────────────────
    const renderFooter = () => {
      if (step === 3) {
        if (completed) return null;
        const confirmDisabled = isSaving || allDuplicates;
        return (
          <Pressable
            onPress={handleConfirm}
            disabled={confirmDisabled}
            className={`bg-light-primary-red py-4 rounded-full items-center ${
              confirmDisabled ? "opacity-60" : ""
            }`}
            accessibilityRole="button"
            accessibilityState={{ disabled: confirmDisabled }}
          >
            <Text className="text-light font-bold text-lg">
              {isSaving ? "Importing…" : "Confirm & import"}
            </Text>
          </Pressable>
        );
      }

      const isStep1 = step === 1;
      const label = "Next";
      const onPress = isStep1 ? handleStep1Next : handleStep2Next;
      const disabled = isStep1
        ? validationState !== "valid"
        : namespaces.length === 0;

      return (
        <Pressable
          onPress={onPress}
          disabled={disabled}
          className={`bg-light-primary-red py-4 rounded-full items-center ${
            disabled ? "opacity-50" : ""
          }`}
          accessibilityRole="button"
          accessibilityState={{ disabled }}
        >
          <Text className="text-light font-bold text-lg">{label}</Text>
        </Pressable>
      );
    };

    return (
      <Modal
        transparent
        visible
        animationType="none"
        onRequestClose={handleCancel}
      >
        <TouchableWithoutFeedback onPress={handleCancel}>
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
                  height: SHEET_HEIGHT,
                  marginTop: "auto",
                }}
                className="bg-light-main-container rounded-t-3xl"
              >
                {/* Drag handle */}
                <View
                  {...panResponder.panHandlers}
                  className="items-center py-3"
                >
                  <View className="w-10 h-1 bg-light-matte-black/20 rounded-full" />
                </View>

                {/* Header */}
                <View className="flex-row items-center justify-between px-4 pb-2">
                  <Pressable
                    onPress={handleBack}
                    disabled={isSaving}
                    accessibilityLabel="Back"
                    className={`w-9 h-9 items-center justify-center ${
                      isSaving ? "opacity-30" : ""
                    }`}
                  >
                    <ArrowLeft size={22} color="#c71c4b" />
                  </Pressable>
                  <Text className="text-light-matte-black text-lg font-bold">
                    Import seed phrase
                  </Text>
                  <Pressable
                    onPress={handleCancel}
                    disabled={isSaving}
                    accessibilityLabel="Close"
                    className={`w-9 h-9 items-center justify-center ${
                      isSaving ? "opacity-30" : ""
                    }`}
                  >
                    <X size={22} color="#20222c" />
                  </Pressable>
                </View>

                {/* Step indicator */}
                <View className="flex-row gap-2 px-4 mb-3">
                  {[1, 2, 3].map((i) => (
                    <View
                      key={i}
                      className={`h-1 flex-1 rounded-full ${
                        i <= step ? "bg-light-primary-red" : "bg-gray-300"
                      }`}
                    />
                  ))}
                </View>

                {/* Body */}
                <ScrollView
                  className="flex-1 px-4"
                  contentContainerStyle={{ paddingBottom: 16 }}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  {step === 1 ? renderStep1() : null}
                  {step === 2 ? renderStep2() : null}
                  {step === 3 ? renderStep3() : null}
                </ScrollView>

                <View className="px-4" style={{ paddingBottom: bottomOffset }}>
                  {renderFooter()}
                </View>
              </Animated.View>
            </TouchableWithoutFeedback>
          </Animated.View>
        </TouchableWithoutFeedback>
      </Modal>
    );
  },
);

export default ImportSeedPhraseSheet;
export { ImportSeedPhraseSheet };
export type { Props as ImportSeedPhraseSheetProps };
