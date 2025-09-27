import { Copy, Zap } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { copyToClipboard } from "@/utils/helperUtils";
import { extractVoucher } from "@/utils/vcGamerUtils";

type TPLNCustomerInfo = {
  meterNumber: number;
  vcGamerVoucher: string;
};
export default function PLNCard({
  plnCustomerInfo,
}: {
  plnCustomerInfo: TPLNCustomerInfo;
}) {
  const voucher = extractVoucher("PLN", plnCustomerInfo.vcGamerVoucher);
  const handleCopyTokenCode = () => {
    voucher?.tokenCode &&
      copyToClipboard(voucher.tokenCode, "Token code copied!");
  };

  return (
    <View className="p-4">
      <View className="bg-gradient-to-r from-light-main-container to-white rounded-2xl mb-4">
        <View className="flex-row items-center mb-3">
          <View className="bg-yellow-500/10 p-3 rounded-2xl mr-4 shadow-sm">
            <Zap size={24} color="#f97316" strokeWidth={2} />
          </View>
          <View className="flex-1">
            <Text className="text-light-matte-black font-bold text-xl tracking-tight">
              PLN Token Details
            </Text>
            <View className="h-1 bg-light-primary-red/20 rounded-full mt-1 w-12" />
          </View>
        </View>

        <Text className="text-light-matte-black/70 text-base leading-6 font-medium">
          Electricity prepaid token from PLN
        </Text>

        <View className="flex-row justify-between items-center mt-4 pt-3 border-t border-gray-100">
          <Text className="text-light-matte-black/40 text-xs font-semibold uppercase tracking-wider">
            Token Information
          </Text>
          <View className="flex-row space-x-1">
            <View className="w-2 h-2 bg-light-primary-red/30 rounded-full" />
            <View className="w-2 h-2 bg-light-primary-red/50 rounded-full" />
            <View className="w-2 h-2 bg-light-primary-red rounded-full" />
          </View>
        </View>
      </View>

      <View className="bg-light-main-container/35 rounded-xl p-3 mb-4">
        <Text className="text-light-matte-black font-medium text-sm mb-3">
          Customer Information
        </Text>

        <View className="space-y-2">
          <View className="flex-row justify-between items-center">
            <Text className="text-light-matte-black/70 text-sm">Name:</Text>
            <Text className="text-light-matte-black text-sm font-medium">
              {voucher?.name}
            </Text>
          </View>
          <View className="flex-row justify-between items-center">
            <Text className="text-light-matte-black/70 text-sm">
              Meter Number:
            </Text>
            <Text className="text-light-primary-red text-sm font-medium">
              {plnCustomerInfo.meterNumber}
            </Text>
          </View>

          <View className="flex-row justify-between items-center">
            <Text className="text-light-matte-black/70 text-sm">
              Tarif/Power:
            </Text>
            <Text className="text-light-matte-black text-sm font-medium">
              {voucher?.tarifOrPower}
            </Text>
          </View>

          {voucher?.kwhCapacity && (
            <View className="flex-row justify-between items-center">
              <Text className="text-light-matte-black/70 text-sm">kWh:</Text>
              <Text className="text-light-matte-black text-sm font-medium">
                {voucher?.kwhCapacity.includes("KWH")
                  ? voucher?.kwhCapacity.split("KWH")[0]
                  : voucher?.kwhCapacity}{" "}
                kWh
              </Text>
            </View>
          )}
        </View>
      </View>

      <View className="bg-light-main-container/35 rounded-xl p-3">
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-light-matte-black font-medium text-sm">
            Token Code
          </Text>
        </View>

        <TouchableOpacity
          className="bg-white rounded-lg p-3 shadow-sm"
          activeOpacity={0.5}
          onPress={handleCopyTokenCode}
        >
          <Text className="text-light-primary-red font-bold text-lg tracking-wider text-center mb-1">
            {voucher?.tokenCode}
          </Text>
          <View className="items-center flex-row justify-center gap-2">
            <Text className="text-light-matte-black/50 text-xs text-center">
              Tap copy here to copy token code
            </Text>
            <Copy size={10} color="#c71c4b" />
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}
