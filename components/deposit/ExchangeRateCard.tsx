import { TrendingUp } from "lucide-react-native";
import React, { memo } from "react";
import { Text, View } from "react-native";
import type { TPointPriceResponse } from "@/api/types/points";

interface ExchangeRateCardProps {
  pointPrice: TPointPriceResponse | undefined;
  tokenAmountNeeded: { human: number; raw: bigint } | null;
  pointsRequested: string;
  isLoading: boolean;
}

export const ExchangeRateCard = memo<ExchangeRateCardProps>(
  ({ pointPrice, tokenAmountNeeded, pointsRequested, isLoading }) => {
    if (isLoading || !pointPrice) return null;

    const tokenSymbol = pointPrice.token.symbol;
    const pointsPerToken = parseFloat(
      pointPrice.pointsPerToken,
    ).toLocaleString();
    const payAmount = tokenAmountNeeded
      ? tokenAmountNeeded.human.toFixed(4)
      : "...";
    const receivePoints = parseInt(pointsRequested, 10);

    return (
      <View className="mb-6 px-5">
        <View className="bg-light-main-container p-4 rounded-xl border border-light-matte-black/5">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-light-matte-black/50 text-[11px] font-medium">
              EXCHANGE RATE
            </Text>
            <View className="flex-row items-center gap-1">
              <TrendingUp size={14} color="#c71c4b" strokeWidth={2.5} />
              <Text className="text-light-primary-red text-[10px] font-medium">
                {new Date().toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Text>
            </View>
          </View>

          <Text className="text-light-matte-black/70 text-xs mb-3">
            1 {tokenSymbol} = {pointsPerToken} points
          </Text>

          <View className="gap-2">
            <View className="flex-row items-center justify-between">
              <Text className="text-light-matte-black/60 text-sm">You pay</Text>
              <Text className="text-light-matte-black font-semibold text-sm">
                {payAmount} {tokenSymbol}
              </Text>
            </View>
            <View className="flex-row items-center justify-between">
              <Text className="text-light-matte-black/60 text-sm">You get</Text>
              <Text className="text-light-primary-red font-semibold text-sm">
                {isNaN(receivePoints) ? "..." : receivePoints.toLocaleString()}{" "}
                points
              </Text>
            </View>
          </View>
        </View>
      </View>
    );
  },
);
