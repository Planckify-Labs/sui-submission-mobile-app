import { BarcodeScanningResult, Camera, CameraView } from "expo-camera";
import { router } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
  Image,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  isValidSolanaAddress,
} from "@/utils/walletUtils";

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

  const handleBarCodeScanned = (result: BarcodeScanningResult) => {
    if (scanned) return;

    setScanned(true);
    // Strip common URI prefixes used by wallet QR codes so the raw
    // address regex matches. `solana:<addr>?...` is the Solana Pay
    // convention; EVM wallets sometimes use `ethereum:<addr>@<chainId>`.
    const raw = result.data.trim();
    const withoutScheme = raw
      .replace(/^solana:/i, "")
      .replace(/^ethereum:/i, "")
      .split("?")[0]
      .split("@")[0];

    const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;
    if (ethAddressRegex.test(withoutScheme)) {
      router.replace({
        pathname: "/send",
        params: { recipientAddress: withoutScheme },
      });
      return;
    }
    if (isValidSolanaAddress(withoutScheme)) {
      router.replace({
        pathname: "/send",
        params: { recipientAddress: withoutScheme },
      });
      return;
    }
    console.error(
      "Invalid QR Code: The scanned QR code does not contain a valid wallet address.",
    );
    setScanned(false);
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
