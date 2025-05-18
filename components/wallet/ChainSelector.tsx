import { supportedChains } from "@/constants/configs/chainConfig";
import { useWallet } from "@/hooks/useWallet";
import { Check, ChevronDown } from "lucide-react-native";
import React, { useState } from "react";
import { Image, Modal, Pressable, ScrollView, Text, View } from "react-native";

export default function ChainSelector() {
  const { activeChain, changeActiveChain } = useWallet();
  const [modalVisible, setModalVisible] = useState(false);

  const handleChainSelect = async (chainId: number) => {
    await changeActiveChain(chainId);
    setModalVisible(false);
  };

  return (
    <>
      <Pressable
        onPress={() => setModalVisible(true)}
        className="flex-row items-center bg-light-main-container px-3 py-2 rounded-full"
      >
        {activeChain.iconUrl && (
          <Image
            source={{ uri: activeChain.iconUrl }}
            style={{ width: 20, height: 20 }}
            className="mr-2"
          />
        )}
        <Text className="text-light-matte-black font-medium mr-2">
          {activeChain.name}
        </Text>
        <ChevronDown size={16} color="#c71c4b" />
      </Pressable>

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View className="flex-1 justify-end bg-black/50">
          <View className="bg-light rounded-t-3xl p-6 h-2/3">
            <View className="w-12 h-1 bg-gray-300 rounded-full self-center mb-6" />

            <Text className="text-light-matte-black text-xl font-bold mb-4">
              Select Network
            </Text>

            <ScrollView className="flex-1">
              {supportedChains.map((chain) => (
                <Pressable
                  key={chain.id}
                  className={`flex-row items-center p-4 mb-2 rounded-xl ${
                    activeChain.id === chain.id
                      ? "bg-light-primary-red/10"
                      : "bg-light-main-container"
                  }`}
                  onPress={() => handleChainSelect(chain.id)}
                >
                  {chain.iconUrl && (
                    <Image
                      source={{ uri: chain.iconUrl }}
                      style={{ width: 24, height: 24 }}
                      className="mr-3"
                    />
                  )}

                  <View className="flex-1">
                    <Text className="text-light-matte-black font-bold">
                      {chain.name}
                    </Text>
                    <Text className="text-light-matte-black/70 text-sm">
                      {chain.nativeCurrency.symbol}
                    </Text>
                  </View>

                  {chain.isTestnet && (
                    <View className="bg-yellow-500/20 px-2 py-1 rounded-full mr-2">
                      <Text className="text-yellow-700 text-xs font-medium">
                        Testnet
                      </Text>
                    </View>
                  )}

                  {activeChain.id === chain.id && (
                    <View className="w-6 h-6 rounded-full bg-light-primary-red/10 items-center justify-center">
                      <Check size={14} color="#c71c4b" strokeWidth={3} />
                    </View>
                  )}
                </Pressable>
              ))}
            </ScrollView>

            <Pressable
              className="bg-light-main-container p-4 rounded-xl mt-4"
              onPress={() => setModalVisible(false)}
            >
              <Text className="text-light-matte-black font-bold text-center">
                Close
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}
