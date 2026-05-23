/**
 * Inline CTA that surfaces inside DeFi tool cards when the user has
 * no `UserStrategy` yet. Renders `null` when one already exists —
 * the card stays untouched in that case (spec §14.6: "Onboarding
 * sheet untouched. Users who tap into /strategies from the home tab
 * still see the 9-step sheet. The inline path is a *parallel* entry
 * point, not a replacement").
 */

import { router } from "expo-router";
import { Sparkles } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useUserStrategy } from "@/hooks/queries/useStrategy";

const BRAND_RED = "#c71c4b";

interface SetupStrategyCTAProps {
  variant?: "compact" | "block";
}

export default function SetupStrategyCTA({
  variant = "compact",
}: SetupStrategyCTAProps) {
  const { data: strategy, isLoading } = useUserStrategy();
  if (isLoading || strategy) return null;

  if (variant === "block") {
    return (
      <View className="mt-3 rounded-xl border border-light-primary-red/20 bg-light-primary-red/5 p-3">
        <View className="flex-row items-center gap-2 mb-1">
          <Sparkles size={14} color={BRAND_RED} />
          <Text className="text-xs font-bold uppercase tracking-wide text-light-primary-red">
            Set up to start earning
          </Text>
        </View>
        <Text className="text-sm text-light-matte-black/80 mt-1 mb-2.5">
          Pick a risk tier and you're ready to deposit into any of these.
        </Text>
        <TouchableOpacity
          onPress={() => router.push("/strategies/onboarding")}
          activeOpacity={0.85}
          className="bg-light-primary-red rounded-full px-4 py-2 self-start"
        >
          <Text className="text-white font-semibold text-xs">
            Set up DeFi strategy
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <TouchableOpacity
      onPress={() => router.push("/strategies/onboarding")}
      activeOpacity={0.85}
      className="mt-3 flex-row items-center justify-between rounded-xl border border-light-primary-red/20 bg-light-primary-red/5 px-3 py-2.5"
    >
      <View className="flex-row items-center gap-2 flex-1 pr-2">
        <Sparkles size={14} color={BRAND_RED} />
        <Text className="text-xs font-semibold text-light-primary-red flex-1">
          Set up your DeFi strategy to start depositing
        </Text>
      </View>
      <Text className="text-xs font-bold text-light-primary-red">Set up →</Text>
    </TouchableOpacity>
  );
}
