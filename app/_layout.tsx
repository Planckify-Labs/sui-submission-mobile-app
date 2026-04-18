// TWV-2026-002 — pollyfills MUST load before any module that can transitively
// pull in Viem or `@scure/bip39`. Keep this the first import of the app.
import "../pollyfills";
import {
  QueryClient,
  useIsRestoring,
  useQueryClient,
} from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { router, SplashScreen, Stack } from "expo-router";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { LogBox } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ChainSwitchingOverlay } from "@/components/common/ChainSwitchingOverlay";
import { PerformanceProvider } from "@/components/providers/PerformanceProvider";
import LockScreen from "@/components/security/LockScreen";
import QKEY_Wallets from "@/constants/queryKeys/walletQueryKeys";
import {
  mmkvPersister,
  shouldPersistQuery,
} from "@/lib/storage/queryPersister";
// Ordering (spec §6.2): polyfill import → bootWalletKits() → any screen/provider.
import { bootWalletKits } from "@/services/walletKit/boot";
import { hasStoredWallets } from "@/services/walletService";
import "../global.css";

// Register WalletKit adapters before any screen/provider reads the registry.
bootWalletKits();

SplashScreen.preventAutoHideAsync();

/**
 * App-level lock gate. `true` whenever the LockScreen is floating over
 * the Stack — i.e. wallets are persisted on device but the user hasn't
 * unlocked this session yet. Exposed so screens and expensive hooks
 * (SecureStore cascades in `useIsAuthenticated`, BIP-32 / Ed25519
 * pre-warm in `useWallet`, network queries gated by auth) can short-
 * circuit their work while the user is behind the blur. The Stack
 * still renders so the LockScreen's BlurView has home content to
 * blur — but the heavy work doesn't fire until after unlock.
 */
export const AppLockedContext = createContext<boolean>(false);
export const useAppLocked = (): boolean => useContext(AppLockedContext);

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
    if (isRestoring || isLoading) return;

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
  const [locked, setLocked] = useState<boolean>(hasStoredWallets());
  const [didUnlockThisSession, setDidUnlockThisSession] = useState(false);

  // Two-phase unlock — lift the gate first (so all `useAppLocked()`
  // consumers fire their gated effects + the React re-render cascade
  // runs), then dismiss the LockScreen after a short settle window.
  // The spinner stays up while home's hooks wake up; the user only
  // sees the home screen once the cascade has quieted and taps land
  // instantly.
  //
  // Without this two-phase approach, `locked` and `didUnlockThisSession`
  // flipped in the same commit. The LockScreen dismissed at the exact
  // frame the cascade started — user saw home but couldn't interact
  // for ~300–500 ms while the re-render wave settled. Classic "freeze
  // right after unlock" bug.
  //
  // `await new Promise(setTimeout(400))` is the same yield hack as the
  // rest of the crypto UI (pattern 1 in `docs/crypto-ui-perf-patterns
  // .md`), just with a larger value because we're covering a bigger
  // window (multiple React commits + deferred effects via
  // `InteractionManager.runAfterInteractions`).
  const handleUnlocked = useCallback(async () => {
    // LockScreen already loaded wallets via `loadWalletsFromStorage()`
    // into the `walletService` module cache. The `[wallets]` query
    // picks up that cached value on first use — no invalidation needed.
    // Previously this fired an `invalidateQueries({wallets})` which
    // queued a 2nd `loadWallets` deferredTask (visible in logs), for
    // no new data.
    //
    // Phase 1 — lift the gate. Gated hooks fire while the LockScreen
    // is still visible. Heavy work runs behind the spinner.
    setDidUnlockThisSession(true);
    // Phase 2 — wait for the React cascade to quiet, then dismiss.
    // 100 ms is enough now that signer caches + auth state + wallet
    // index are all primed synchronously inside LockScreen — the
    // cascade from flipping `isLocked` is just React re-renders, not
    // any heavy work.
    await new Promise((r) => setTimeout(r, 100));
    setLocked(false);
  }, []);

  return (
    <AppLockedContext.Provider value={locked}>
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
      <ChainSwitchingOverlay />
    </AppLockedContext.Provider>
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
