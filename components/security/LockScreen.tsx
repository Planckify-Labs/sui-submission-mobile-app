/**
 * `<LockScreen />` — full-screen overlay gating wallet access. Rendered
 * above the Stack so it covers every route + blocks touch through to
 * the home content behind it.
 *
 * Uses a native `Modal` instead of an inline SafeAreaView so:
 *   - It renders above the expo-router Stack (the previous inline
 *     SafeAreaView let users still interact with the screen behind
 *     it — see screenshot in the review).
 *   - It participates in the OS's modal z-stack, which keeps the
 *     platform biometric sheet anchored correctly on Android.
 *
 * Visual: `BlurView` (expo-blur) with `experimentalBlurMethod` so
 * Android uses the same Gaussian blur implementation as iOS. A thin
 * tint layer on top in the app's existing `bg-light-main-container`
 * colour preserves readability without pulling in the red primary
 * surface colour (the card surfaces behind the blur keep their
 * accent).
 *
 * No sign-out / reset button by design — self-custodial recovery is
 * the user's seed phrase, not an in-app "forget device" button.
 *
 * Contract with the rest of the app:
 *   - The parent (`InitializeApp`) flips `locked=true` whenever
 *     `hasStoredWallets() === true && !didUnlockThisSession`.
 *   - `onUnlocked` runs after a successful `LocalAuthentication` call
 *     + wallet bundle load; the parent is responsible for flipping
 *     the session unlock flag and invalidating the wallets query.
 */

import { BlurView } from "expo-blur";
import * as LocalAuthentication from "expo-local-authentication";
import { Fingerprint } from "lucide-react-native";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  clearWalletCache,
  loadWalletsFromStorage,
} from "@/services/walletService";

type Props = {
  onUnlocked: () => void;
};

export default function LockScreen({ onUnlocked }: Props) {
  const [isUnlocking, setIsUnlocking] = useState(false);

  const attempt = useCallback(async () => {
    if (isUnlocking) return;
    setIsUnlocking(true);
    try {
      // App-level auth gate. `disableDeviceFallback: false` gives the
      // user a "Use passcode" / "Use pattern" link on the native sheet
      // so the flow survives a missing / unenrolled biometric. This
      // prompt is the single source of truth — we never re-auth at
      // the SecureStore layer afterwards.
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock TakumiAI Wallet",
        disableDeviceFallback: false,
        cancelLabel: "Cancel",
      });
      if (!result.success) return;

      // Load wallets. The bundle read is no longer OS-auth-gated (see
      // `walletSecureStore.ts`). Legacy entries saved under the old
      // `requireAuthentication: true` flag may still trigger ONE final
      // OS prompt at the keystore level; the next save rewrites them
      // without that flag so this is a one-time upgrade cost.
      clearWalletCache();
      const wallets = await loadWalletsFromStorage();
      if (wallets.length > 0) onUnlocked();
    } catch {
      // Swallow — user can tap Unlock again. No state-change copy
      // because the OS sheet already surfaced the error.
    } finally {
      setIsUnlocking(false);
    }
  }, [isUnlocking, onUnlocked]);

  return (
    <Modal
      visible
      transparent
      statusBarTranslucent
      animationType="fade"
      // Intercept the hardware back button on Android — we don't want
      // the user silently backing out to an interactable home screen.
      onRequestClose={() => {}}
    >
      <StatusBar barStyle="dark-content" />
      <BlurView
        intensity={18}
        tint="light"
        experimentalBlurMethod="dimezisBlurView"
        style={StyleSheet.absoluteFill}
      >
        {/* Tint layer — a light wash in the app's neutral surface so
            whatever renders behind stays recognisable through the
            glass while remaining non-interactive. */}
        <View
          style={StyleSheet.absoluteFill}
          className="bg-light-main-container/40"
          pointerEvents="none"
        />
        <SafeAreaView className="flex-1" edges={["top", "bottom"]}>
          <View className="flex-1 items-center justify-center px-8">
            <View className="w-20 h-20 rounded-full bg-light-primary-red/10 items-center justify-center mb-6">
              <Fingerprint size={40} color="#c71c4b" />
            </View>

            <Text className="text-light-matte-black text-2xl font-bold text-center mb-2">
              Welcome back
            </Text>
            <Text className="text-light-matte-black/60 text-center text-sm leading-5 mb-8">
              Tap Unlock to continue.
            </Text>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={attempt}
              disabled={isUnlocking}
              accessibilityRole="button"
              accessibilityLabel="Unlock wallet"
              className={`w-full flex-row items-center justify-center py-4 px-6 rounded-2xl ${
                isUnlocking ? "bg-light-primary-red/60" : "bg-light-primary-red"
              }`}
            >
              {isUnlocking ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <>
                  <Fingerprint size={20} color="#ffffff" />
                  <Text className="text-white font-semibold ml-2">Unlock</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </BlurView>
    </Modal>
  );
}
