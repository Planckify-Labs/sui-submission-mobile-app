/**
 * `<ChainSwitchingOverlay />` — full-screen floating loader shown while
 * a wallet / chain switch is doing heavy crypto work (BIP-32, Ed25519,
 * seed derivation across namespaces). Mirrors the `LockScreen`
 * aesthetic so the user immediately recognizes it as a system gate,
 * not a form / toast.
 *
 * Drive it via the module-level store below — call `chainSwitching
 * .begin("Switching to Solana…")` before the heavy work, yield one
 * animation frame (100 ms recommended, matching `app/send.tsx:392`) so
 * React commits + paints the overlay, THEN run the crypto, THEN
 * `chainSwitching.end()` in a `finally` block.
 *
 * Mounted once at the root (`app/_layout.tsx`) so it floats above every
 * screen. Callers don't render the overlay themselves — they just
 * toggle the store.
 */

import { BlurView } from "expo-blur";
import { Loader2 } from "lucide-react-native";
import React, { useEffect, useRef, useSyncExternalStore } from "react";
import {
  Animated,
  Easing,
  Modal,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type State = { visible: boolean; message: string };

let state: State = { visible: false, message: "" };
const listeners = new Set<() => void>();
const notify = () => {
  for (const l of listeners) l();
};

/**
 * Module-level store for the chain-switching overlay. Intentionally
 * not React Context — callers deep inside hooks (`useWallet`, chain-
 * switcher callbacks) don't need to grab a hook reference just to
 * toggle a spinner. Straight imperative API.
 */
export const chainSwitching = {
  begin(message: string): void {
    state = { visible: true, message };
    notify();
  },
  end(): void {
    state = { visible: false, message: "" };
    notify();
  },
  getState(): State {
    return state;
  },
  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

/**
 * Convenience wrapper around the most common pattern: show overlay,
 * yield one frame so React paints it, run the work, hide overlay in a
 * finally block. Mirrors the `/send.tsx:385-392` yield hack exactly.
 */
export async function runWithChainSwitchingOverlay<T>(
  message: string,
  fn: () => Promise<T>,
): Promise<T> {
  chainSwitching.begin(message);
  await new Promise((r) => setTimeout(r, 100));
  try {
    return await fn();
  } finally {
    chainSwitching.end();
  }
}

export function useChainSwitchingState(): State {
  return useSyncExternalStore(
    chainSwitching.subscribe,
    chainSwitching.getState,
    chainSwitching.getState,
  );
}

export function ChainSwitchingOverlay() {
  const { visible, message } = useChainSwitchingState();
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    spin.setValue(0);
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [visible, spin]);

  if (!visible) return null;

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <Modal
      visible
      transparent
      statusBarTranslucent
      animationType="fade"
      // Intentionally block hardware-back — the work in progress is
      // signer derivation that we can't safely cancel mid-flight.
      onRequestClose={() => {}}
    >
      <BlurView
        intensity={18}
        tint="light"
        experimentalBlurMethod="dimezisBlurView"
        style={StyleSheet.absoluteFill}
      >
        <View
          style={StyleSheet.absoluteFill}
          className="bg-light-main-container/40"
          pointerEvents="none"
        />
        <SafeAreaView className="flex-1" edges={["top", "bottom"]}>
          <View className="flex-1 items-center justify-center px-8">
            <View className="w-20 h-20 rounded-full bg-light-primary-red/10 items-center justify-center mb-6">
              <Animated.View style={{ transform: [{ rotate }] }}>
                <Loader2 size={40} color="#c71c4b" />
              </Animated.View>
            </View>
            <Text className="text-light-matte-black text-lg font-semibold text-center">
              {message || "Switching chain…"}
            </Text>
          </View>
        </SafeAreaView>
      </BlurView>
    </Modal>
  );
}
