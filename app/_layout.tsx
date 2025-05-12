import { Stack } from "expo-router";
import "../global.css";
import "../pollyfills";

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    />
  );
}
