/**
 * `CreateWalletSheet` — generate → verify-words → namespace-select →
 * derive N wallets from ONE mnemonic (spec §14.6).
 *
 * Replaces the legacy `components/login/WalletSetup.tsx` route-based
 * flow. The verify-words UX is carried over faithfully: the user is
 * quizzed on four fixed mnemonic positions (word #2 / #4 / #8 / #12)
 * and each row is a three-chip choice. Advancement is blocked until
 * every pick matches — no swipe-through.
 *
 * Rules (non-negotiable):
 *   - CSPRNG-only via `generateWalletMnemonic(128)` (TWV-2026-002).
 *   - NEVER log or persist the mnemonic outside the wallet bundle
 *     (TWV-2026-057). The sheet holds it in state only for the
 *     duration of the flow and drops references on close.
 *   - Copy disabled on the reveal view; screenshots are blocked by
 *     `useScreenshotGuard()`.
 *   - Swipe-dismiss during the verify step resets state — users must
 *     not be able to re-enter the flow mid-verify.
 *   - Default all registered namespaces checked (spec §14.6).
 *
 * Pattern: matches `components/wallet/WalletSwitcherModal.tsx` /
 * `WalletRenameModal.tsx` — `react-native` `Modal` + `Animated` +
 * `PanResponder`. The repo has no `@gorhom/bottom-sheet` outside
 * `components/agent/ApprovalSheet.tsx`, so a custom sheet keeps the
 * dependency surface aligned with the existing wallet modals.
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
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import SeedPhraseGrid from "@/components/common/SeedPhraseGrid";
import type { TWallet } from "@/constants/types/walletTypes";
import { useWallet } from "@/hooks/useWallet";
import type { Namespace } from "@/services/chains/types";
import { useScreenshotGuard } from "@/services/security/screenshotGuard";
import { defaultWalletNameFor } from "@/services/walletKit/bootstrap";
import { deriveWalletsFromMnemonic } from "@/services/walletKit/deriveAll";
import { walletKitRegistry } from "@/services/walletKit/registry";
import { generateWalletMnemonic } from "@/services/walletService";
import {
  computeStep,
  type StepState,
  shuffleWords,
  type VerifyResult,
  verifyWords,
} from "./CreateWalletSheet.helpers";
import NamespacePicker from "./NamespacePicker";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.92;

// Verify-words quiz positions — 4 words at indices 1 / 3 / 7 / 11
// (word #2, #4, #8, #12). Carried over verbatim from
// `components/login/WalletSetup/index.tsx` so the UX feels identical.
const VERIFICATION_INDICES = [1, 3, 7, 11] as const;

type Props = {
  visible: boolean;
  onClose: () => void;
  onWalletAdded: (wallets: TWallet[]) => void;
};

type QuizOptions = { [position: number]: string[] };
type QuizPicks = { [position: number]: string };

/**
 * Build the 3-chip option set for a single verification row. The
 * correct word is always present; two distractors are drawn from the
 * remaining mnemonic words (deduped against the correct word). Final
 * order is shuffled so the correct answer isn't always at index 0.
 */
function buildRowOptions(mnemonic: string[], wordIndex: number): string[] {
  const correctWord = mnemonic[wordIndex];
  if (!correctWord) return [];
  const distractors = Array.from(
    new Set(mnemonic.filter((w, i) => i !== wordIndex && w !== correctWord)),
  );
  // Shuffle distractors pool (Fisher–Yates via helper), then take 2.
  const picked = shuffleWords(distractors).slice(0, 2);
  return shuffleWords([correctWord, ...picked]);
}

function buildAllRowOptions(mnemonic: string[]): QuizOptions {
  const opts: QuizOptions = {};
  for (const wi of VERIFICATION_INDICES) {
    opts[wi] = buildRowOptions(mnemonic, wi);
  }
  return opts;
}

function quizVerifyState(picks: QuizPicks, mnemonic: string[]): VerifyResult {
  // Map the quiz-row state into the shuffled/picked model
  // `verifyWords` expects. Each verification row is its own tiny
  // "shuffled" list, so we flatten: answer[i] is the correct word and
  // pickedIndices[i] = shuffled[i].indexOf(picks[wi]).
  const answer: string[] = [];
  const shuffled: string[] = [];
  const pickedIndices: number[] = [];
  let picksSoFar = 0;
  for (const wi of VERIFICATION_INDICES) {
    answer.push(mnemonic[wi]);
    // Offset into the flat `shuffled` list so row indices stay unique.
    // We don't actually need the flattening to match what `verifyWords`
    // checks character-wise — the helper compares shuffled[idx] against
    // answer[i], which still holds when the "shuffled" list is just the
    // picked word for this row (single-entry slice). Keeping this tight
    // minimises the call-site surface.
    const picked = picks[wi];
    if (picked === undefined) {
      return "incomplete";
    }
    shuffled.push(picked);
    pickedIndices.push(picksSoFar);
    picksSoFar += 1;
  }
  return verifyWords(shuffled, pickedIndices, answer);
}

function allRegisteredNamespaces(): Namespace[] {
  return walletKitRegistry.getAll().map((k) => k.namespace);
}

const CreateWalletSheet: React.FC<Props> = memo(function CreateWalletSheet({
  visible,
  onClose,
  onWalletAdded,
}: Props) {
  // Screenshot guard — refcounted; engages when this component mounts
  // while `visible`, releases on unmount. Prevents recording of
  // mnemonic display AND verify step (both reveal partial seed info).
  // `alertOnScreenshot` surfaces the iOS "Never screenshot this" popup
  // because this flow renders the plaintext mnemonic.
  useScreenshotGuard(visible, { alertOnScreenshot: true });

  const { addWallets } = useWallet();
  const { bottom } = useSafeAreaInsets();
  const bottomOffset = Platform.OS === "ios" ? 16 : bottom > 0 ? bottom : 16;

  // ── State ─────────────────────────────────────────────────────────
  // Mnemonic lives in state for the flow's duration only; `resetState`
  // wipes it on close (TWV-2026-057 dwell discipline).
  const [mnemonic, setMnemonic] = useState<string[]>([]);
  const [mnemonicAcknowledged, setMnemonicAcknowledged] = useState(false);
  const [quizOptions, setQuizOptions] = useState<QuizOptions>({});
  const [quizPicks, setQuizPicks] = useState<QuizPicks>({});
  const [verifyAttempted, setVerifyAttempted] = useState(false);
  const [verifyConfirmed, setVerifyConfirmed] = useState(false);
  const [namespaces, setNamespaces] = useState<Namespace[]>(() =>
    allRegisteredNamespaces(),
  );
  const [namespacesConfirmed, setNamespacesConfirmed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const verifyState: VerifyResult = useMemo(
    () => quizVerifyState(quizPicks, mnemonic),
    [quizPicks, mnemonic],
  );

  const stepState: StepState = useMemo(
    () => ({
      mnemonicAcknowledged,
      verifyState,
      verifyConfirmed,
      namespacesConfirmed,
      isSaving,
      completed,
    }),
    [
      mnemonicAcknowledged,
      verifyState,
      verifyConfirmed,
      namespacesConfirmed,
      isSaving,
      completed,
    ],
  );

  const step = computeStep(stepState);

  // ── Animated sheet ────────────────────────────────────────────────
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;

  const resetState = useCallback(() => {
    // TWV-2026-057 dwell discipline — drop every reference to the
    // mnemonic / picks before the sheet next opens. Regeneration
    // happens lazily on next open (see the `visible` effect below).
    setMnemonic([]);
    setMnemonicAcknowledged(false);
    setQuizOptions({});
    setQuizPicks({});
    setVerifyAttempted(false);
    setVerifyConfirmed(false);
    setNamespaces(allRegisteredNamespaces());
    setNamespacesConfirmed(false);
    setIsSaving(false);
    setCompleted(false);
    setErrorMsg(null);
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

  // Cancel / dismiss — reset AND close. Used by the X button, swipe
  // down, and hardware back on Android.
  const handleCancel = useCallback(() => {
    if (isSaving) return; // cannot cancel mid-save
    animateClose(() => {
      resetState();
      onClose();
    });
  }, [animateClose, resetState, onClose, isSaving]);

  // Generate-on-open: the first time `visible` flips true with no
  // mnemonic in state, mint one. Subsequent reopens after a reset
  // also re-mint. The `mnemonic.length === 0` guard stops re-minting
  // mid-flow when the parent re-renders.
  useEffect(() => {
    if (!visible) return;
    if (mnemonic.length > 0) return;
    const phrase = generateWalletMnemonic(128).split(" ");
    setMnemonic(phrase);
    setQuizOptions(buildAllRowOptions(phrase));
  }, [visible, mnemonic.length]);

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

  // Android hardware back — behave like the X button.
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      handleCancel();
      return true;
    });
    return () => sub.remove();
  }, [visible, handleCancel]);

  // Swipe-dismiss gesture (only the top drag handle area is
  // responder-capable — see `panResponder.panHandlers` attachment
  // below). Spec §14.6: dismissing during verify must reset state.
  // Our `resetState` runs on every cancel, so verify resets
  // automatically. We mirror the `WalletSwitcherModal` thresholds.
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

  // ── Handlers ──────────────────────────────────────────────────────
  const handlePickWord = useCallback((rowIndex: number, word: string) => {
    setVerifyAttempted(false);
    setVerifyConfirmed(false);
    setQuizPicks((prev) => ({ ...prev, [rowIndex]: word }));
  }, []);

  const handleStep1Next = useCallback(() => {
    if (!mnemonicAcknowledged) return;
    // advancement computed by `computeStep`
  }, [mnemonicAcknowledged]);

  const handleStep2Next = useCallback(() => {
    setVerifyAttempted(true);
    if (verifyState === "correct") {
      setVerifyConfirmed(true);
    }
    // If incorrect / incomplete, `verifyAttempted` flips the UI to show
    // the error hint. `computeStep` only advances once `verifyConfirmed`
    // is true — picking the correct last word alone never skips ahead.
  }, [verifyState]);

  const handleStep3Next = useCallback(() => {
    if (namespaces.length === 0) return;
    setNamespacesConfirmed(true);
  }, [namespaces]);

  const handleConfirm = useCallback(async () => {
    if (isSaving || completed) return;
    setErrorMsg(null);
    setIsSaving(true);
    try {
      const mnemonicString = mnemonic.join(" ");
      // TWV-2026-057 — derive immediately and hand off; local
      // references drop at function exit.
      const derived = await deriveWalletsFromMnemonic(
        mnemonicString,
        namespaces,
        defaultWalletNameFor,
      );
      if (derived.length === 0) {
        throw new Error("No wallets were derived");
      }
      const ok = await addWallets(derived);
      if (!ok) {
        throw new Error("Failed to save wallets");
      }
      setCompleted(true);
      onWalletAdded(derived);
      // Defer close so users see the success flash briefly.
      animateClose(() => {
        resetState();
        onClose();
      });
    } catch (e) {
      if (__DEV__) {
        console.warn("[CreateWalletSheet] confirm threw", e);
      }
      setErrorMsg("We couldn't create your wallet. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }, [
    mnemonic,
    namespaces,
    addWallets,
    onWalletAdded,
    onClose,
    animateClose,
    resetState,
    isSaving,
    completed,
  ]);

  const handleBack = useCallback(() => {
    // Step-wise back. Only legal before confirm kicks off.
    if (isSaving) return;
    if (namespacesConfirmed) {
      setNamespacesConfirmed(false);
      return;
    }
    if (verifyConfirmed) {
      // rewind to step 2 — clear the verification commit and picks so
      // the user re-verifies (spec §14.6 dismissal-resets-verify rule
      // applies in spirit when stepping backwards too).
      setVerifyConfirmed(false);
      setQuizPicks({});
      setVerifyAttempted(false);
      return;
    }
    if (mnemonicAcknowledged) {
      setMnemonicAcknowledged(false);
      return;
    }
    // step 1 — cancel altogether
    handleCancel();
  }, [
    isSaving,
    namespacesConfirmed,
    verifyConfirmed,
    mnemonicAcknowledged,
    handleCancel,
  ]);

  if (!visible) return null;

  // ── Step renderers ────────────────────────────────────────────────
  const renderStep1 = () => (
    <>
      <Text className="text-light-matte-black text-2xl font-bold mb-2">
        Your secret recovery phrase
      </Text>
      <Text className="text-light-matte-black/70 mb-4">
        Write down these 12 words in order and keep them somewhere safe. This
        phrase is the only way to restore your wallet.
      </Text>

      {/* Reveal view — copy disabled per spec §14.6. Screenshot blur is
          enforced by the module-level `useScreenshotGuard`. */}
      <SeedPhraseGrid mnemonic={mnemonic} showCopyButton={false} />

      <View className="bg-light-primary-red/10 rounded-xl p-4 mb-4">
        <View className="flex-row items-start gap-2">
          <Info size={20} color="#c71c4b" />
          <Text className="text-light-matte-black flex-1 font-medium">
            Never share this phrase. TakumiPay will never ask for it.
          </Text>
        </View>
      </View>

      <Pressable
        className="flex-row items-center p-2 mb-2"
        onPress={() => setMnemonicAcknowledged((v) => !v)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: mnemonicAcknowledged }}
      >
        <View
          className={`w-8 h-8 rounded-lg mr-3 items-center justify-center ${
            mnemonicAcknowledged
              ? "bg-light-primary-red"
              : "border-2 border-gray-400"
          }`}
        >
          {mnemonicAcknowledged ? (
            <Check size={18} color="white" strokeWidth={3} />
          ) : null}
        </View>
        <Text className="text-light-matte-black font-medium flex-1">
          I have written down my recovery phrase in a secure location.
        </Text>
      </Pressable>
    </>
  );

  const renderStep2 = () => (
    <>
      <Text className="text-light-matte-black text-2xl font-bold mb-2">
        Confirm your recovery phrase
      </Text>
      <Text className="text-light-matte-black/70 mb-4">
        Tap the correct word for each position to prove you saved them.
      </Text>

      {VERIFICATION_INDICES.map((wi) => {
        const opts = quizOptions[wi] ?? [];
        const selected = quizPicks[wi];
        return (
          <View key={wi} className="mb-5">
            <Text className="text-light-matte-black font-medium mb-2">
              Word #{wi + 1}
            </Text>
            <View className="flex-row gap-2">
              {opts.map((word, oi) => {
                const isSelected = selected === word;
                return (
                  <Pressable
                    key={`${wi}-${oi}`}
                    onPress={() => handlePickWord(wi, word)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    className={`flex-1 p-4 rounded-xl bg-light-main-container items-center justify-center ${
                      isSelected
                        ? "border-2 border-light-primary-red"
                        : "border border-transparent"
                    }`}
                  >
                    <Text
                      className={`${
                        isSelected
                          ? "text-light-primary-red font-bold"
                          : "text-light-matte-black"
                      }`}
                    >
                      {word}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}

      {verifyAttempted && verifyState === "incorrect" ? (
        <View className="bg-light-primary-red/10 rounded-xl p-3 mb-2">
          <Text className="text-light-primary-red font-medium">
            One or more words are incorrect. Please try again.
          </Text>
        </View>
      ) : null}
    </>
  );

  const renderStep3 = () => (
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

  const renderStep4 = () => (
    <View className="items-center justify-center py-6">
      {isSaving ? (
        <>
          <ActivityIndicator size="large" color="#c71c4b" />
          <Text className="text-light-matte-black font-medium mt-4">
            Creating your wallets…
          </Text>
        </>
      ) : completed ? (
        <>
          <View className="w-16 h-16 rounded-full bg-light-primary-red/10 items-center justify-center mb-3">
            <Check size={36} color="#c71c4b" strokeWidth={3} />
          </View>
          <Text className="text-light-matte-black text-xl font-bold mb-1">
            Wallet created
          </Text>
          <Text className="text-light-matte-black/70 text-center">
            You&apos;re all set.
          </Text>
        </>
      ) : (
        <>
          <Text className="text-light-matte-black font-medium text-center mb-4">
            Ready to derive {namespaces.length} wallet
            {namespaces.length === 1 ? "" : "s"} from your phrase?
          </Text>
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

  // ── Footer buttons per step ───────────────────────────────────────
  const renderFooter = () => {
    // Step 4 has its own confirm button; other steps share the "Next"
    // shape.
    if (step === 4) {
      if (completed) return null;
      return (
        <Pressable
          onPress={handleConfirm}
          disabled={isSaving}
          className={`bg-light-primary-red py-4 rounded-full items-center ${
            isSaving ? "opacity-60" : ""
          }`}
        >
          <Text className="text-light font-bold text-lg">
            {isSaving ? "Saving…" : "Confirm & create"}
          </Text>
        </Pressable>
      );
    }

    let label = "Next";
    let onPress: () => void = handleStep1Next;
    let disabled = false;

    if (step === 1) {
      label = "I've saved my phrase";
      // step 1 advances implicitly via `mnemonicAcknowledged` → the
      // button just commits that flag; `computeStep` picks it up.
      onPress = () => {
        if (!mnemonicAcknowledged) return;
        handleStep1Next();
      };
      disabled = !mnemonicAcknowledged;
    } else if (step === 2) {
      label = "Confirm";
      onPress = handleStep2Next;
      // Button stays disabled until every slot has a pick; once all
      // four are picked we allow the tap so the UI can show a "wrong
      // word" hint on a bad attempt. Advancement to step 3 requires
      // `verifyConfirmed`, which `handleStep2Next` only sets when
      // `verifyState === "correct"` — picking all-correctly alone
      // does not silently skip.
      disabled = verifyState === "incomplete";
    } else if (step === 3) {
      label = "Review";
      onPress = handleStep3Next;
      disabled = namespaces.length === 0;
    }

    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        className={`bg-light-primary-red py-4 rounded-full items-center ${
          disabled ? "opacity-50" : ""
        }`}
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
              {/* Drag handle — panResponder attached so swipe-down
                  triggers cancel + reset (spec §14.6). */}
              <View {...panResponder.panHandlers} className="items-center py-3">
                <View className="w-10 h-1 bg-light-matte-black/20 rounded-full" />
              </View>

              {/* Header: back / title / close */}
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
                  Create wallet
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
                {[1, 2, 3, 4].map((i) => (
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
                {step === 4 ? renderStep4() : null}
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
});

export default CreateWalletSheet;
export { CreateWalletSheet };
export type { Props as CreateWalletSheetProps };
