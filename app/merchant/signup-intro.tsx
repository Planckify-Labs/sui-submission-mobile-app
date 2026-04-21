/**
 * Merchant onboarding — scan-or-manual fork (spec §1.1.1 step 2,
 * milestone M1). This is the first screen after tapping "Register as
 * Merchant" on `app/login.tsx` (task 10). It forks the path into:
 *
 *   - Scan my QRIS sticker → camera, decode EMVCo locally, route to
 *     `/merchant/signup-form?source=qris&qris=<raw>&stickerPhotoKey=<k>`.
 *   - Enter my details manually → straight to
 *     `/merchant/signup-form?source=manual`.
 *
 * Copy-audience rule (spec §1.1): merchants are non-crypto users, so
 * NO USDC / chain / gas language appears on this screen. Allowed:
 * "TakumiPay", "merchant", "QRIS", "sticker".
 *
 * Three-role separation (memory `feedback_role_separation.md`): this
 * screen only classifies and routes. No server calls, no signup POST
 * (that's task 12, eventually M3 backend).
 *
 * Chain-extension discipline (memory
 * `feedback_chain_extension_discipline.md`): the scan branch imports
 * `qrisDetector` by name because QRIS is the ONLY scan target on this
 * surface per §1.1.1 — this is a legitimate single-purpose detector
 * call, not a namespace branch.
 */

import { type BarcodeScanningResult, Camera, CameraView } from "expo-camera";
import { router } from "expo-router";
import { ArrowLeft, Camera as CameraIcon, Pencil } from "lucide-react-native";
import React, { useCallback, useState } from "react";
import {
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  CaptureCanceledError,
  CapturePermissionDeniedError,
  UploadFailedError,
  useCaptureStickerPhoto,
} from "@/hooks/useCaptureStickerPhoto";
import { qrisDetector } from "@/services/paymentIntent/detectors";

/**
 * Cross-platform toast shim — mirrors `app/scan-to-pay.tsx`. iOS has
 * no ToastAndroid so we fall back to `console.warn`. Task 44 (error-
 * matrix component) will upgrade this to a proper UI toast.
 */
const showToast = (message: string) => {
  if (ToastAndroid && typeof ToastAndroid.show === "function") {
    ToastAndroid.show(message, ToastAndroid.SHORT);
    return;
  }
  console.warn(message);
};

type Mode = "intro" | "scanning";

export default function MerchantSignupIntro() {
  const [mode, setMode] = useState<Mode>("intro");
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);
  // Task 14: capture + compress + upload the sticker photo after a
  // successful QRIS decode. Hook owns all media I/O; this screen
  // only orchestrates the sequence and surfaces toast copy.
  const { captureFromCamera, compress, upload } = useCaptureStickerPhoto();

  const handlePressScan = useCallback(async () => {
    const { status } = await Camera.requestCameraPermissionsAsync();
    setHasPermission(status === "granted");
    setScanned(false);
    setMode("scanning");
  }, []);

  const handlePressManual = useCallback(() => {
    router.push("/merchant/signup-form?source=manual" as never);
  }, []);

  const handleBarCodeScanned = useCallback(
    async (result: BarcodeScanningResult) => {
      if (scanned) return;
      setScanned(true);

      const raw = result.data.trim();
      // QRIS is the only scan target on this surface (spec §1.1.1).
      // The QRIS detector is synchronous (see
      // `services/paymentIntent/detectors/qris.ts` — no `await` inside
      // `detect`), so the return type union's `Promise` branch is
      // unreachable in practice. The `Detector` interface is shared
      // with async detectors (e.g. TakumiPay JWS) which is why the
      // union exists. Narrow via `Promise.resolve` so the union
      // collapses safely whether the call stays sync or evolves.
      const intent = await Promise.resolve(qrisDetector.detect(raw));

      if (!intent || intent.channel.kind !== "merchant") {
        showToast("Couldn't read QRIS, try manually");
        setScanned(false);
        return;
      }

      // Task 14: capture a still of the physical sticker as
      // lightweight dispute evidence (§12 Q9). We briefly unmount the
      // barcode scanner (by flipping `mode` back to "intro") and
      // hand off to `expo-image-picker`'s system camera — sharing
      // the live `CameraView` for a still capture is not supported
      // by `expo-camera` on Android's current SDK.
      //
      // Three-role separation: the hook posts to our backend; the
      // wallet is not involved. Upload failure is NON-BLOCKING per
      // spec §12 Q9 (the merchant record is still valid; ops just
      // loses a dispute-review artifact). Base64 is in-memory only
      // and discarded once we have `stickerPhotoKey`.
      setMode("intro");
      let stickerPhotoKey: string | undefined;
      try {
        const captured = await captureFromCamera();
        const compressed = await compress(captured.uri);
        console.log(
          `[signup-intro] sticker compressed to ${compressed.bytes} bytes`,
        );
        const uploaded = await upload({ uri: compressed.uri });
        stickerPhotoKey = uploaded.stickerPhotoKey;
        showToast("Photo attached \u2713");
      } catch (err) {
        if (err instanceof CaptureCanceledError) {
          // User dismissed the camera after the QR decode. We still
          // proceed to signup — the photo is optional evidence.
          console.log("[signup-intro] sticker capture canceled");
        } else if (err instanceof CapturePermissionDeniedError) {
          showToast("Camera permission needed for sticker photo");
        } else if (err instanceof UploadFailedError) {
          // M1 backend (task 45) may still be stubbed; a 404 here is
          // expected and must not block the merchant from signing up.
          console.warn("[signup-intro] sticker upload failed:", err.message);
          showToast("Couldn't attach sticker photo, continuing");
        } else {
          console.warn("[signup-intro] unexpected capture error:", err);
        }
      }

      const qrisParam = encodeURIComponent(raw);
      const photoSuffix = stickerPhotoKey
        ? `&stickerPhotoKey=${encodeURIComponent(stickerPhotoKey)}`
        : "";

      router.replace(
        `/merchant/signup-form?source=qris&qris=${qrisParam}${photoSuffix}` as never,
      );
    },
    [scanned, captureFromCamera, compress, upload],
  );

  const handleCancelScan = useCallback(() => {
    setMode("intro");
    setScanned(false);
  }, []);

  if (mode === "scanning") {
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
          <Text className="text-white text-center p-4">
            No access to camera
          </Text>
          <Pressable
            className="bg-light-primary-red p-3 rounded-lg m-5 items-center"
            onPress={handleCancelScan}
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
              <View className="w-[250px] h-[250px] border-4 border-matte-black bg-transparent rounded-2xl" />
            </View>
          </View>

          <View className="flex-row items-center p-4 absolute top-8 left-0 right-0 z-10">
            <Pressable onPress={handleCancelScan} className="mr-4">
              <ArrowLeft color="#ffffff" size={24} />
            </Pressable>
            <Text className="text-light-main-container text-lg font-bold bg-light-matte-black/70 px-4 py-1 rounded-full">
              Scan your QRIS sticker
            </Text>
          </View>

          <View className="p-5 items-center absolute bottom-8 left-0 right-0">
            <Text className="text-white text-center bg-light-matte-black/70 px-4 py-1 rounded-full">
              Aim at your QRIS sticker to get started
            </Text>
          </View>
        </SafeAreaView>
      </>
    );
  }

  return (
    <>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="dark-content"
      />
      <SafeAreaView className="flex-1 bg-light-main-container">
        <View className="flex-row items-center px-4 pt-2">
          <Pressable onPress={() => router.back()} className="p-2 -ml-2">
            <ArrowLeft color="#20222c" size={24} />
          </Pressable>
        </View>

        <View className="flex-1 px-6 pt-6">
          <Text className="text-light-matte-black text-3xl font-bold mb-2">
            Register as Merchant
          </Text>
          <Text className="text-light-matte-black/70 text-base mb-8">
            Let's set up your shop in TakumiPay.
          </Text>

          <TouchableOpacity
            activeOpacity={0.7}
            className="bg-light rounded-2xl p-5 mb-4 border border-light-matte-black/10"
            onPress={handlePressScan}
          >
            <View className="flex-row items-center">
              <View className="w-12 h-12 bg-light-primary-red/10 rounded-full items-center justify-center mr-4">
                <CameraIcon color="#c71c4b" size={22} />
              </View>
              <View className="flex-1">
                <Text className="text-light-matte-black font-semibold text-base mb-1">
                  Scan my QRIS sticker
                </Text>
                <Text className="text-light-matte-black/60 text-sm">
                  Use your phone camera to read the QRIS you already have.
                </Text>
              </View>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            className="bg-light rounded-2xl p-5 mb-4 border border-light-matte-black/10"
            onPress={handlePressManual}
          >
            <View className="flex-row items-center">
              <View className="w-12 h-12 bg-light-primary-red/10 rounded-full items-center justify-center mr-4">
                <Pencil color="#c71c4b" size={22} />
              </View>
              <View className="flex-1">
                <Text className="text-light-matte-black font-semibold text-base mb-1">
                  Enter my details manually
                </Text>
                <Text className="text-light-matte-black/60 text-sm">
                  No QRIS sticker yet? Type your shop details instead.
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </>
  );
}
