import React from "react";
import { Text, View } from "react-native";
import { TPurchaseResponse } from "@/api/types/purchase";
import PLNCard from "./PLNCard";

export default function AditionalInformationCard({
  purchase,
}: {
  purchase: TPurchaseResponse;
}) {
  return (
    <View className="bg-white rounded-2xl p-4 shadow-sm">
      <View className="flex-row items-center mb-4">
        <Text className="text-light-matte-black font-bold text-lg ml-2">
          Adtional Information
        </Text>
      </View>

      <View>
        {purchase?.voucherCode?.includes("kWh") ||
          (purchase?.voucherCode?.includes("KWH") &&
            purchase.booking.customerInfo.length > 0 && (
              <PLNCard
                plnCustomerInfo={{
                  vcGamerVoucher: purchase.voucherCode,
                  meterNumber: Number(purchase.booking.customerInfo[0].value),
                }}
              />
            ))}
      </View>
    </View>
  );
}
