import React from "react";
import { Pressable, Text, View } from "react-native";
import { Copy } from "lucide-react-native";

type AddressDisplayProps = {
  address: string;
  onCopy: () => void;
};

export default function AddressDisplay({ address, onCopy }: AddressDisplayProps) {
  return (
    <View className="mb-4">
      <Text className="text-light-matte-black/70 mb-1">Wallet Address</Text>
      <View className="flex-row items-center justify-between bg-light-main-container p-4 rounded-xl">
        <Text className="text-light-matte-black flex-1 mr-3 text-wrap" numberOfLines={2}>
          {address}
        </Text>
        <Pressable onPress={onCopy} className="flex-shrink-0">
          <Copy size={20} color="#c71c4b" />
        </Pressable>
      </View>
    </View>
  );
}