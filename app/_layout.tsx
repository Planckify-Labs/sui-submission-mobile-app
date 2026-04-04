import { QueryClient, useIsRestoring } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { router, SplashScreen, Stack } from "expo-router";
import { useEffect } from "react";
import { LogBox } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PerformanceProvider } from "@/components/providers/PerformanceProvider";
import {
  mmkvPersister,
  shouldPersistQuery,
} from "@/lib/storage/queryPersister";
import "../global.css";
import "../pollyfills";

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

function InitializeApp() {
  const isRestoring = useIsRestoring();
  const { wallets, isLoading } = require("@/hooks/useWallet").useWallet();

  useEffect(() => {
    // Wait for both the persisted query cache to be restored AND
    // the wallets query to finish loading before making a decision.
    if (isRestoring || isLoading) return;

    if (wallets.length === 0) {
      router.replace("/login");
    }

    SplashScreen.hideAsync();
  }, [isRestoring, isLoading, wallets.length]);

  return null;
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
          <InitializeApp />
          <Stack
            screenOptions={{
              headerShown: false,
              animation: "ios_from_left",
              contentStyle: { backgroundColor: "#f5f6f9" },
              animationDuration: 300,
            }}
          />
        </SafeAreaProvider>
      </PerformanceProvider>
    </PersistQueryClientProvider>
  );
}
