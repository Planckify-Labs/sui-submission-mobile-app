// Boot step: importing the detectors barrel is the single side-effect
// import that registers every `Detector` with `detectorRegistry.ts`.
// Must stay at the top of the module — `classify()` below returns
// `null` for every payload if this import is missing. Task 05 (the
// TakumiPay JWS detector) lands in parallel with task 07; whatever
// the barrel currently exports is what the scanner recognises.
import "@/services/paymentIntent/detectors";

import { type BarcodeScanningResult, Camera, CameraView } from "expo-camera";
import { router } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
  Image,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  ToastAndroid,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { classify, switchToScannedTarget } from "@/services/paymentIntent";

/**
 * Cross-platform toast shim. `ToastAndroid` is Android-only; on iOS we
 * fall back to a `console.warn` rather than block the scanner on new
 * toast infra. Task 44 (error-matrix component) is expected to
 * upgrade this to a proper UI toast.
 */
const showToast = (message: string) => {
  if (ToastAndroid && typeof ToastAndroid.show === "function") {
    ToastAndroid.show(message, ToastAndroid.SHORT);
    return;
  }
  console.warn(message);
};

export default function ScanToPay() {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    const getBarCodeScannerPermissions = async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === "granted");
    };

    getBarCodeScannerPermissions();
  }, []);

  // Drives classify + route dispatch after a successful scan. The
  // function never signs, never hits the network, and never inspects
  // `namespace` directly — namespace-specific activation is the send
  // flow's job at render time (chain-extension discipline, memory
  // `feedback_chain_extension_discipline.md`).
  const handleBarCodeScanned = async (result: BarcodeScanningResult) => {
    if (scanned) return;
    setScanned(true);

    try {
      const raw = result.data.trim();
      const intent = await classify(raw);

      if (!intent) {
        showToast("Couldn't understand this QR");
        setScanned(false);
        return;
      }

      const next = switchToScannedTarget(intent);
      if (next.kind === "unsupported") {
        showToast(next.reason);
        setScanned(false);
        return;
      }

      // `/pay-merchant` and `/pay-x402` are typed-routes-registered by
      // task 08 / task 39 respectively; until the generated
      // `.expo/types/router.d.ts` union catches up, the literal isn't
      // in the typed routes. Cast narrowly so we don't erase the
      // pathname typing at every other callsite.
      router.replace({
        pathname: next.route as "/send",
        params: next.params,
      });
    } catch (error) {
      console.error("scan-to-pay classify failed:", error);
      showToast("Couldn't understand this QR");
      setScanned(false);
    }
  };

  if (hasPermission === null) {
    return (
      <SafeAreaView className="flex-1 bg-black">
        <Text className="text-white text-center p-4">
          Requesting camera permission...
        </Text>
      </SafeAreaView>
    );
  }

  if (hasPermission === false) {
    return (
      <SafeAreaView className="flex-1 bg-black">
        <Text className="text-white text-center p-4">No access to camera</Text>
        <Pressable
          className="bg-light-primary-red p-3 rounded-lg m-5 items-center"
          onPress={() => router.back()}
        >
          <Text className="text-white font-bold">Go Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <>
      <StatusBar
        barStyle="light-content"
        translucent
        backgroundColor="transparent"
      />
      <SafeAreaView className="flex-1 bg-black" edges={[]}>
        <View className="flex-1 overflow-hidden relative">
          <CameraView
            style={StyleSheet.absoluteFillObject}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: ["qr"],
            }}
            onBarcodeScanned={handleBarCodeScanned}
          />

          <View className="absolute inset-0 bg-black/50 justify-center items-center">
            <View className="w-[250px] h-[250px] border-4 border-matte-black bg-transparent rounded-2xl">
              <View className="absolute inset-0 items-center justify-center">
                <Image
                  source={require("@/assets/images/takumipay-no-bg.png")}
                  style={{ width: 50, height: 46 }}
                  className="opacity-70"
                />
              </View>
            </View>
          </View>
        </View>

        <View className="flex-row items-center p-4 absolute top-8 left-0 right-0 z-10">
          <Pressable onPress={() => router.back()} className="mr-4">
            <ArrowLeft color="#ffffff" size={24} />
          </Pressable>
          <Text className="text-light-main-container text-lg font-bold bg-light-matte-black/70 px-4 py-1 rounded-full">
            Scan QR Code
          </Text>
        </View>

        <View className="p-5 items-center absolute bottom-8 left-0 right-0">
          <Text className="text-white text-center bg-light-matte-black/70 px-4 py-1 rounded-full">
            Position the QR code within the frame to scan
          </Text>
        </View>
      </SafeAreaView>
    </>
  );
}
