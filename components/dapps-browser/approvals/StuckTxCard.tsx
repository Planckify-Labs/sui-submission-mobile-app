import { Clock } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import {
  NonceTracker,
  type PendingNonce,
} from "@/services/bridge/nonceTracker";
import { truncateAddress } from "@/utils/walletUtils";

interface Props {
  walletAddress: string;
  chainId: number;
  pending: PendingNonce;
  onSpeedUp: (pending: PendingNonce) => void;
  onCancel: (pending: PendingNonce) => void;
}

/**
 * Surfaces a stuck transaction to the user with Speed up / Cancel actions.
 * Rendered by the tx-history screen when `NonceTracker.detectStuck()` is
 * non-empty for the active wallet + chain.
 */
export function StuckTxCard({
  pending,
  onSpeedUp,
  onCancel,
}: Props): React.ReactElement {
  return (
    <View className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3">
      <View className="flex-row items-center mb-2">
        <Clock size={14} color="#b45309" />
        <Text className="ml-2 text-sm font-medium text-amber-900 flex-1">
          Transaction pending
        </Text>
        <Text className="text-xs text-amber-700">nonce {pending.nonce}</Text>
      </View>
      <Text className="text-xs text-amber-800 mb-2">
        Sent to {truncateAddress({ address: pending.to, preset: "short" })} ·{" "}
        {Math.round((Date.now() - pending.submittedAt) / 1000)}s ago
      </Text>
      <View className="flex-row gap-2">
        <TouchableOpacity
          onPress={() => onSpeedUp(pending)}
          className="flex-1 py-2 rounded-full bg-amber-900 items-center"
        >
          <Text className="text-white text-xs font-semibold">Speed up</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onCancel(pending)}
          className="flex-1 py-2 rounded-full border border-amber-400 items-center"
        >
          <Text className="text-amber-900 text-xs font-semibold">Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export { NonceTracker };
