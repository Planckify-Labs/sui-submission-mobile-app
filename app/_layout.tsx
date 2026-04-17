// TWV-2026-002 — pollyfills MUST load before any module that can transitively
// pull in Viem or `@scure/bip39`. Keep this the first import of the app.
import "../pollyfills";
// Ordering (spec §6.2): polyfill import → bootWalletKits() → any screen/provider.
import { bootWalletKits } from "@/services/walletKit/boot";
import QKEY_Wallets from "@/constants/queryKeys/walletQueryKeys";
import {
  QueryClient,
  useIsRestoring,
  useQueryClient,
} from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { router, SplashScreen, Stack } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { LogBox } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import LockScreen from "@/components/security/LockScreen";
import { PerformanceProvider } from "@/components/providers/PerformanceProvider";
import {
  mmkvPersister,
  shouldPersistQuery,
} from "@/lib/storage/queryPersister";
import { hasStoredWallets } from "@/services/walletService";
import "../global.css";

// Register WalletKit adapters before any screen/provider reads the registry.
bootWalletKits();

SplashScreen.preventAutoHideAsync();

LogBox.ignoreLogs([
  "VirtualizedLists should never be nested",
  "Sending `onAnimatedValueUpdate` with no listeners registered",
]);

const PERSIST_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      // gcTime must be >= PERSIST_MAX_AGE so data isn't GC'd before persistence reads it
      gcTime: PERSIST_MAX_AGE,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnMount: true,
      // Re-enable reconnect refetch so stale data refreshes when coming back online
      refetchOnReconnect: true,
    },
  },
});

function InitializeApp({
  didUnlockThisSession,
  onShouldLock,
}: {
  didUnlockThisSession: boolean;
  onShouldLock: (locked: boolean) => void;
}) {
  const isRestoring = useIsRestoring();
  const { wallets, isLoading } = require("@/hooks/useWallet").useWallet();

  useEffect(() => {
    // Wait for both the persisted query cache to be restored AND
    // the wallets query to finish loading before making a decision.
    if (isRestoring || isLoading) return;

    // Decision tree, evaluated on every cold boot AND after the user
    // unlocks:
    //   1. No wallets on device AND session already unlocked (edge
    //        case: user signed out via /login) → route to /login.
    //   2. hasStoredWallets() && !didUnlockThisSession
    //        → lock. The bundle now loads without an OS prompt (see
    //          `walletSecureStore.ts`), so the LockScreen is the only
    //          auth gate. Always show it on cold start regardless of
    //          whether the query has resolved wallets yet.
    //   3. No wallets AND !hasStoredWallets() → fresh install / new
    //        signup → /login.
    //   4. Otherwise (unlocked, wallets present) → let the current
    //        route render.
    if (hasStoredWallets() && !didUnlockThisSession) {
      onShouldLock(true);
    } else if (wallets.length === 0 && !hasStoredWallets()) {
      onShouldLock(false);
      router.replace("/login");
    } else {
      onShouldLock(false);
    }

    SplashScreen.hideAsync();
  }, [
    isRestoring,
    isLoading,
    wallets.length,
    didUnlockThisSession,
    onShouldLock,
  ]);

  return null;
}

function AppShell() {
  const queryClient = useQueryClient();
  const [locked, setLocked] = useState(false);
  // Session-scoped unlock signal. Defaults to false on every cold
  // boot (React state is reset). Backgrounding the app alone does
  // NOT re-lock — `hasStoredWallets()` + this flag is evaluated in
  // `InitializeApp` which only reacts to mount + its own deps.
  const [didUnlockThisSession, setDidUnlockThisSession] = useState(false);

  const handleUnlocked = useCallback(() => {
    // Make sure the wallets query is fresh in case it raced ahead
    // (or ran against a stale cache from a previous persist cycle).
    queryClient.invalidateQueries({ queryKey: [QKEY_Wallets.wallets] });
    setDidUnlockThisSession(true);
    setLocked(false);
  }, [queryClient]);

  return (
    <>
      <InitializeApp
        didUnlockThisSession={didUnlockThisSession}
        onShouldLock={setLocked}
      />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "ios_from_left",
          contentStyle: { backgroundColor: "#f5f6f9" },
          animationDuration: 300,
        }}
      />
      {locked ? <LockScreen onUnlocked={handleUnlocked} /> : null}
    </>
  );
}

export default function RootLayout() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: mmkvPersister,
        maxAge: PERSIST_MAX_AGE,
        dehydrateOptions: {
          shouldDehydrateQuery: shouldPersistQuery,
        },
      }}
    >
      <PerformanceProvider>
        <SafeAreaProvider>
          <AppShell />
        </SafeAreaProvider>
      </PerformanceProvider>
    </PersistQueryClientProvider>
  );
}
