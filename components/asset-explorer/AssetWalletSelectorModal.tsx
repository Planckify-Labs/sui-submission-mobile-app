import { TAssetWalletSelectorModalProps } from "@/constants/types/assetTypes";
import { Check } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";

const AssetWalletSelectorModal = ({
  visible,
  onClose,
  wallets,
  asset,
  assets,
  onConfirm,
}: TAssetWalletSelectorModalProps) => {
  const [selectedWallets, setSelectedWallets] = useState<number[]>([0]);

  useEffect(() => {
    if (visible) {
      setSelectedWallets([0]);
    }
  }, [visible]);

  const toggleWalletSelection = (index: number) => {
    setSelectedWallets((prev) => {
      if (prev.includes(index)) {
        return prev.filter((i) => i !== index);
      } else {
        return [...prev, index];
      }
    });
  };

  const handleConfirm = () => {
    if (selectedWallets.length === 0) {
      return;
    }
    onConfirm(selectedWallets, asset, assets);
  };

  if (!visible) return null;

  const isMultipleAssets = assets && assets.length > 0;
  const assetsToShow = isMultipleAssets ? assets : asset ? [asset] : [];
  const assetCount = assetsToShow.length;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-black/50 justify-end">
        <View className="bg-white rounded-t-3xl p-5">
          <View className="flex-row justify-between items-center mb-4">
            <Text className="text-xl font-bold text-light-matte-black">
              Select Wallet
            </Text>
            <Pressable
              onPress={onClose}
              className="w-8 h-8 rounded-full bg-light-matte-black/5 items-center justify-center"
            >
              <Text className="text-light-matte-black text-lg">×</Text>
            </Pressable>
          </View>

          {assetsToShow.length > 0 && (
            <View className="bg-light-main-container p-4 rounded-xl mb-4">
              <Text className="text-light-matte-black/60 mb-1">
                {isMultipleAssets ? "Adding Multiple Assets" : "Adding Asset"}
              </Text>

              {isMultipleAssets ? (
                <View>
                  <Text className="text-light-matte-black font-bold">
                    {assetCount} asset{assetCount > 1 ? "s" : ""} selected
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    className="mt-2"
                  >
                    {assetsToShow.slice(0, 5).map((item) => (
                      <View
                        key={item.id}
                        className="flex-row items-center mr-3"
                      >
                        <View className="w-6 h-6 bg-light-primary-red/10 rounded-full items-center justify-center mr-1">
                          <Text className="text-light-primary-red font-bold text-xs">
                            {item.logo}
                          </Text>
                        </View>
                        <Text className="text-light-matte-black text-xs">
                          {item.symbol}
                        </Text>
                      </View>
                    ))}
                    {assetCount > 5 && (
                      <Text className="text-light-matte-black/60 text-xs ml-1">
                        +{assetCount - 5} more
                      </Text>
                    )}
                  </ScrollView>
                </View>
              ) : (
                <View className="flex-row items-center">
                  <View className="w-8 h-8 bg-light-primary-red/10 rounded-full items-center justify-center mr-2">
                    <Text className="text-light-primary-red font-bold">
                      {asset?.logo}
                    </Text>
                  </View>
                  <Text className="text-light-matte-black font-bold">
                    {asset?.name} ({asset?.symbol})
                  </Text>
                </View>
              )}
            </View>
          )}

          <Text className="text-light-matte-black/60 mb-2">
            Choose wallet(s) to add{" "}
            {isMultipleAssets ? "these assets" : "this asset"} to:
          </Text>

          <ScrollView className="max-h-80">
            {wallets.map((wallet, index) => {
              const isSelected = selectedWallets.includes(index);

              return (
                <Pressable
                  key={wallet.address}
                  className={`flex-row items-center p-4 mb-2 rounded-xl ${
                    isSelected
                      ? "bg-light-primary-red/10"
                      : "bg-light-main-container"
                  }`}
                  onPress={() => toggleWalletSelection(index)}
                >
                  <View className="flex-1">
                    <Text className="font-bold text-light-matte-black">
                      {wallet.name || `Wallet ${index + 1}`}
                    </Text>
                    <Text className="text-sm text-light-matte-black/70">
                      {wallet.address.substring(0, 6)}...
                      {wallet.address.substring(wallet.address.length - 4)}
                    </Text>
                  </View>

                  <View
                    className={`w-6 h-6 rounded-full items-center justify-center ${
                      isSelected
                        ? "bg-light-primary-red"
                        : "border border-light-matte-black/20"
                    }`}
                  >
                    {isSelected && (
                      <Check size={14} color="#fff" strokeWidth={3} />
                    )}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>

          <Pressable
            className="bg-light-primary-red py-3 rounded-xl mt-4"
            onPress={handleConfirm}
            disabled={selectedWallets.length === 0}
          >
            <Text className="text-white font-bold text-center">Confirm</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

export default AssetWalletSelectorModal;
