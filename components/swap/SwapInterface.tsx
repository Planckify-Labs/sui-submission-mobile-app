import { useQuery } from "@tanstack/react-query";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { formatEther } from "viem";
import {
  getPriceImpactSeverity,
  getSwapRoute,
  type SwapRoute,
  validateSlippage,
} from "@/services/swap/aggregator";
import {
  getMevSettings,
  isMevProtectionApplicable,
} from "@/services/swap/mevProtection";

interface SwapInterfaceProps {
  chainId: number;
  userAddress: string;
  onSwap: (route: SwapRoute) => void;
}

export function SwapInterface({
  chainId,
  userAddress,
  onSwap,
}: SwapInterfaceProps) {
  const [fromToken] = useState("");
  const [toToken] = useState("");
  const [amount, setAmount] = useState("");
  const [slippage] = useState(0.5);

  const slippageValidation = validateSlippage(slippage);
  const showMev = isMevProtectionApplicable(chainId);
  const mevSettings = getMevSettings();

  const { data: route, isLoading } = useQuery({
    queryKey: ["swapRoute", fromToken, toToken, amount, slippage, chainId],
    queryFn: () =>
      getSwapRoute({
        fromToken,
        toToken,
        amount,
        slippage,
        chainId,
        userAddress,
      }),
    enabled: !!fromToken && !!toToken && !!amount && parseFloat(amount) > 0,
    staleTime: 15_000,
  });

  const priceImpactSeverity = route
    ? getPriceImpactSeverity(route.priceImpact)
    : "safe";

  return (
    <View className="flex-1 bg-white dark:bg-gray-900 p-4">
      {/* From token */}
      <View className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 mb-2">
        <Text className="text-xs text-gray-500 dark:text-gray-400 mb-2">
          From
        </Text>
        <View className="flex-row items-center">
          <TextInput
            value={amount}
            onChangeText={setAmount}
            placeholder="0.0"
            keyboardType="decimal-pad"
            className="flex-1 text-2xl font-bold text-gray-900 dark:text-white"
            placeholderTextColor="#9CA3AF"
          />
          <Pressable className="bg-gray-200 dark:bg-gray-700 rounded-full px-3 py-1.5">
            <Text className="text-sm font-medium text-gray-900 dark:text-white">
              {fromToken || "Select"}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Swap direction */}
      <View className="items-center -my-3 z-10">
        <View className="w-10 h-10 rounded-full bg-blue-600 items-center justify-center">
          <Text className="text-white text-lg">{"\u2193"}</Text>
        </View>
      </View>

      {/* To token */}
      <View className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 mt-2 mb-4">
        <Text className="text-xs text-gray-500 dark:text-gray-400 mb-2">
          To
        </Text>
        <View className="flex-row items-center">
          <Text className="flex-1 text-2xl font-bold text-gray-900 dark:text-white">
            {route
              ? parseFloat(formatEther(BigInt(route.toAmount))).toFixed(4)
              : "0.0"}
          </Text>
          <Pressable className="bg-gray-200 dark:bg-gray-700 rounded-full px-3 py-1.5">
            <Text className="text-sm font-medium text-gray-900 dark:text-white">
              {toToken || "Select"}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Route preview */}
      {route && (
        <View className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 mb-4">
          <View className="flex-row justify-between mb-1">
            <Text className="text-xs text-gray-500 dark:text-gray-400">
              Price Impact
            </Text>
            <Text
              className={`text-xs font-medium ${
                priceImpactSeverity === "safe"
                  ? "text-green-600"
                  : priceImpactSeverity === "warn"
                    ? "text-yellow-600"
                    : "text-red-600"
              }`}
            >
              {route.priceImpact.toFixed(2)}%
            </Text>
          </View>
          <View className="flex-row justify-between mb-1">
            <Text className="text-xs text-gray-500 dark:text-gray-400">
              Min. Received
            </Text>
            <Text className="text-xs text-gray-700 dark:text-gray-300">
              {parseFloat(formatEther(BigInt(route.toAmountMin))).toFixed(4)}
            </Text>
          </View>
          <View className="flex-row justify-between">
            <Text className="text-xs text-gray-500 dark:text-gray-400">
              Via
            </Text>
            <Text className="text-xs text-gray-700 dark:text-gray-300">
              {route.aggregator}
            </Text>
          </View>
        </View>
      )}

      {/* Warnings */}
      {priceImpactSeverity === "warn" && (
        <View className="bg-yellow-50 dark:bg-yellow-900/30 rounded-xl p-3 mb-4">
          <Text className="text-xs text-yellow-800 dark:text-yellow-200">
            Price impact is high ({route!.priceImpact.toFixed(2)}%). You may
            receive significantly less.
          </Text>
        </View>
      )}

      {slippageValidation.warning && (
        <View className="bg-yellow-50 dark:bg-yellow-900/30 rounded-xl p-3 mb-4">
          <Text className="text-xs text-yellow-800 dark:text-yellow-200">
            {slippageValidation.warning}
          </Text>
        </View>
      )}

      {/* MEV badge */}
      {showMev && mevSettings.enabled && (
        <View className="flex-row items-center mb-4">
          <View className="bg-green-100 dark:bg-green-900 px-2 py-1 rounded-full">
            <Text className="text-xs text-green-700 dark:text-green-300">
              MEV Protected
            </Text>
          </View>
        </View>
      )}

      {/* Swap button */}
      <Pressable
        onPress={() => route && onSwap(route)}
        disabled={!route || isLoading || priceImpactSeverity === "danger"}
        className={`rounded-xl py-4 items-center ${
          route && priceImpactSeverity !== "danger"
            ? "bg-blue-600"
            : "bg-gray-300 dark:bg-gray-700"
        }`}
      >
        {isLoading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text className="text-white font-semibold text-base">
            {priceImpactSeverity === "danger"
              ? "Price Impact Too High"
              : "Swap"}
          </Text>
        )}
      </Pressable>
    </View>
  );
}
