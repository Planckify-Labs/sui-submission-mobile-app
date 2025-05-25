import { PerformanceProvider } from "@/components/providers/PerformanceProvider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { LogBox } from "react-native";
import "../global.css";
import "../pollyfills";

// Ignore specific warnings that might affect performance
LogBox.ignoreLogs([
  "VirtualizedLists should never be nested",
  "Sending `onAnimatedValueUpdate` with no listeners registered",
]);

// Configure React Query with performance in mind
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
    },
  },
});

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <PerformanceProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            animation: "ios_from_left",
            contentStyle: { backgroundColor: "#f5f6f9" },
          }}
        />
      </PerformanceProvider>
    </QueryClientProvider>
  );
}
