import { router } from "expo-router";
import { Copy } from "lucide-react-native";
import React from "react";
import {
  Animated,
  Modal,
  Pressable,
  Text,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import QRCodeStyled from "react-native-qrcode-styled";
import { takumipayLogoBase64 } from "@/constants/takumipay";
import { TWallet } from "@/constants/types/walletTypes";
import { copyToClipboard } from "@/utils/helperUtils";
import Chip from "../../common/Chip";

type ReceivePaymentModalProps = {
  modalVisible: boolean;
  closeModal: () => void;
  activeWallet: TWallet;
  activeChain: {
    chain: {
      name: string;
    };
  };
  fadeAnim: Animated.Value;
  translateY: Animated.Value;
  panResponder: any;
  isModalAnimationComplete: boolean;
};

export default function RecievePaymentModal({
  modalVisible,
  closeModal,
  activeWallet,
  activeChain,
  fadeAnim,
  translateY,
  panResponder,
  isModalAnimationComplete,
}: ReceivePaymentModalProps) {
  return (
    <Modal
      transparent
      visible={modalVisible}
      animationType="none"
      onRequestClose={closeModal}
    >
      <View style={{ flex: 1 }}>
        <TouchableWithoutFeedback onPress={closeModal}>
          <Animated.View
            style={{
              flex: 1,
              backgroundColor: "rgba(0, 0, 0, 0.5)",
              opacity: fadeAnim,
            }}
          />
        </TouchableWithoutFeedback>

        <Animated.View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "auto",
            paddingBottom: 20,
            backgroundColor: "#f5f6f9",
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            transform: [{ translateY: translateY }],
            shadowColor: "#000",
            shadowOffset: { width: 0, height: -3 },
            shadowOpacity: 0.1,
            shadowRadius: 10,
            elevation: 10,
          }}
        >
          <View
            {...panResponder.panHandlers}
            className="w-full items-center pt-4 pb-2"
          >
            <View className="w-12 h-1 bg-gray-300 rounded-full" />
          </View>

          <View className="px-6 flex-1">
            <View className="flex-row items-center justify-between mb-6">
              <Text className="text-light-matte-black text-xl font-bold">
                Receive Funds
              </Text>
              <Pressable
                onPress={closeModal}
                className="bg-light-main-container p-2 rounded-full"
              >
                <Text className="text-light-primary-red font-bold">✕</Text>
              </Pressable>
            </View>

            <View className="bg-white rounded-3xl p-6 shadow-sm mb-5">
              <View className="items-center mb-6 h-64">
                <View className="bg-light-main-container/50 p-4 rounded-2xl aspect-square grow">
                  {isModalAnimationComplete && (
                    <QRCodeStyled
                      data={activeWallet.address}
                      style={{ backgroundColor: "rgb(245 246 249 / 0.5)" }}
                      padding={0}
                      className="w-full h-full"
                      size={205}
                      pieceBorderRadius={3.5}
                      isPiecesGlued={true}
                      color="#20222c"
                      gradient={{
                        type: "linear",
                        options: {
                          colors: ["#c71c4b", "#20222c"],
                          start: [0, 0],
                          end: [1, 1],
                        },
                      }}
                      outerEyesOptions={{
                        topLeft: {
                          borderRadius: 15,
                          color: "#c71c4b",
                        },
                        topRight: {
                          borderRadius: 15,
                          color: "#c71c4b",
                        },
                        bottomLeft: {
                          borderRadius: 15,
                          color: "#c71c4b",
                        },
                      }}
                      innerEyesOptions={{
                        borderRadius: 10,
                        color: "#20222c",
                      }}
                      logo={{
                        href: takumipayLogoBase64,
                        scale: 1.2,
                        padding: 2,
                      }}
                    />
                  )}
                </View>
              </View>

              <View className="items-center mb-4">
                <View className="bg-light-primary-red/10 px-3 py-1 rounded-full mb-2">
                  <Text className="text-light-primary-red text-xs font-medium">
                    {activeChain.chain.name}
                  </Text>
                </View>
                <Text className="text-light-matte-black font-medium text-base">
                  {activeWallet.name || "My Wallet"}
                </Text>
              </View>

              <View className="bg-light-main-container p-4 rounded-xl w-full">
                <View className="flex-row items-center justify-between mb-1">
                  <Text className="text-light-matte-black/70 text-xs font-medium">
                    WALLET ADDRESS
                  </Text>
                  <Chip label={activeWallet?.source} size="small" />
                </View>
                <Text
                  className="text-light-matte-black text-sm font-medium"
                  numberOfLines={1}
                  ellipsizeMode="middle"
                >
                  {activeWallet.address}
                </Text>
              </View>
            </View>

            <View className="flex-row gap-4">
              <Pressable
                className="flex-1 bg-light-main-container p-4 rounded-xl"
                onPress={() => copyToClipboard(activeWallet.address, "Address")}
              >
                <View className="flex-row items-center justify-center gap-2">
                  <Copy size={18} color="#c71c4b" className="mr-2" />
                  <Text className="text-light-matte-black font-medium">
                    Copy Address
                  </Text>
                </View>
              </Pressable>

              <Pressable
                className="flex-1 bg-light-primary-red p-4 rounded-xl"
                onPress={() => {
                  router.push("/scan-to-pay");
                }}
              >
                <Text className="text-white font-bold text-center">
                  Scan QR
                </Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
