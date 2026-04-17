import { Copy, Hash } from "lucide-react-native";
import React from "react";
import { Pressable, Text, View } from "react-native";

type AddressDisplayProps = {
  address: string;
  onCopy: () => void;
  chainLabel?: string;
  hideHeader?: boolean;
};

export default function AddressDisplay({
  address,
  onCopy,
  chainLabel,
  hideHeader,
}: AddressDisplayProps) {
  const formattedAddress = address
    ? `${address.substring(0, 10)}...${address.substring(address.length - 8)}`
    : "";

  return (
    <View className="mb-4">
      {!hideHeader && (
        <View className="flex-row items-center mb-2">
          <Hash size={12} color="#c71c4b" />
          <Text className="text-light-matte-black/50 text-xs font-medium ml-1 uppercase tracking-wide">
            {chainLabel ? `${chainLabel} Address` : "Address"}
          </Text>
        </View>
      )}
      <Pressable
        onPress={onCopy}
        className="bg-light-main-container/50 p-4 rounded-2xl flex-row items-center active:bg-light-main-container"
      >
        <Text
          className="text-light-matte-black font-medium flex-1 text-sm tracking-wide"
          numberOfLines={1}
        >
          {formattedAddress}
        </Text>
        <View className="w-8 h-8 rounded-xl bg-light-primary-red/10 items-center justify-center ml-3">
          <Copy size={14} color="#c71c4b" />
        </View>
      </Pressable>
    </View>
  );
}
