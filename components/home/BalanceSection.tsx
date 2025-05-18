import { useWallet } from "@/hooks/useWallet";
import {
  ArrowBigDown,
  ChevronDown,
  Eye,
  EyeClosed,
  PlusIcon,
} from "lucide-react-native";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  Vibration,
  View,
} from "react-native";

export default function BalanceSection() {
  const { activeWallet, isLoading } = useWallet();
  const [isShowBalance, setShowBalance] = useState(true);

  if (isLoading) {
    return (
      <View className="bg-light rounded-[14px] w-full p-[22px] items-center justify-center">
        <ActivityIndicator size="small" color="#c71c4b" />
        <Text className="text-light-matte-black mt-2">Loading wallet...</Text>
      </View>
    );
  }

  return (
    <View className="bg-light rounded-[14px] w-full p-[22px]">
      <View className="flex-row">
        <Pressable
          className="justify-center items-center w-fit mr-auto flex flex-row mb-auto"
          onPress={() => {
            Vibration.vibrate(100);
            setShowBalance((prevValue) => !prevValue);
          }}
        >
          <Text className="font-bold text-light-matte-black text-[11px]">
            TakumiPay
          </Text>
          {isShowBalance ? (
            <Eye size={15} color="#c71c4b" />
          ) : (
            <EyeClosed size={15} color="#c71c4b" />
          )}
        </Pressable>
        <View className="flex-row gap-2">
          <Pressable className="justify-center items-center">
            <View className="bg-light-matte-black rounded-full items-center justify-center aspect-square w-11">
              <PlusIcon size={25} color="#fff" />
            </View>
            <Text className="text-[8px] text-light-matte-black font-bold">
              Top Up
            </Text>
          </Pressable>
          <Pressable className="justify-center items-center">
            <View className="bg-light-matte-black rounded-full items-center justify-center aspect-square w-11">
              <ArrowBigDown size={25} color="#fff" />
            </View>
            <Text className="text-[8px] text-light-matte-black font-bold">
              Withdraw
            </Text>
          </Pressable>
        </View>
      </View>
      <View>
        <Pressable>
          <View className="flex-row items-center">
            <Text className="text-sm">USDC</Text>
            <ChevronDown size={20} color="#c71c4b" />
          </View>
          <View className="flex-row">
            <Text className="text-light-primary-red font-bold text-7xl">$</Text>
            {isShowBalance ? (
              <Text className="text-light-primary-red font-bold text-7xl">
                {activeWallet.balance}
              </Text>
            ) : (
              <View className="flex-row items-center gap-4">
                <View className="aspect-square bg-light-primary-red w-5 rounded-full" />
                <View className="aspect-square bg-light-primary-red w-5 rounded-full" />
                <View className="aspect-square bg-light-primary-red w-5 rounded-full" />
                <View className="aspect-square bg-light-primary-red w-5 rounded-full" />
                <View className="aspect-square bg-light-primary-red w-5 rounded-full" />
              </View>
            )}
          </View>
        </Pressable>
      </View>
    </View>
  );
}
