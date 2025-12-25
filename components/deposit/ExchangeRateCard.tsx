import { TrendingUp } from "lucide-react-native";
import React, { memo } from "react";
import { Text, View } from "react-native";
import { TToken } from "@/api/types/token";

interface ExchangeRateCardProps {
  selectedToken: TToken;
  exchangeRate: number;
}

export const ExchangeRateCard = memo<ExchangeRateCardProps>(
  ({ selectedToken, exchangeRate }) => {
    return (
      <View className="mb-6 px-5">
        <View className="bg-light-main-container p-4 rounded-xl border border-light-matte-black/5">
          <View className="flex-row items-center justify-between">
            <View className="flex-1">
              <Text className="text-light-matte-black/50 text-[11px] font-medium mb-1">
                EXCHANGE RATE
              </Text>
              <View className="flex-row items-baseline gap-1.5">
                <Text className="text-light-matte-black text-2xl font-bold">
                  ${exchangeRate.toFixed(4)}
                </Text>
                <Text className="text-light-matte-black/60 text-sm font-medium">
                  USD
                </Text>
              </View>
              <Text className="text-light-matte-black/40 text-[10px] mt-1">
                per 1 {selectedToken.symbol}
              </Text>
            </View>
            <View className="items-end">
              <View className="bg-light-primary-red/10 p-2.5 rounded-full mb-1">
                <TrendingUp size={18} color="#c71c4b" strokeWidth={2.5} />
              </View>
              <Text className="text-light-matte-black/40 text-[9px]">
                {new Date().toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Text>
            </View>
          </View>
        </View>
      </View>
    );
  }
);
