import { Globe, ShieldCheck, Sparkles } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useWallet } from "@/hooks/useWallet";
import type { ApprovalIntent } from "@/services/bridge/approval";
import { getDappBridge } from "@/services/bridge/DappBridge";
import { InspectorRegistry } from "@/services/bridge/inspector";
import { truncateAddress } from "@/utils/walletUtils";
import { RiskBanner } from "./RiskBanner";

interface Props {
  intent: ApprovalIntent;
  title: string;
  children: React.ReactNode;
}

export function ApprovalShell({
  intent,
  title,
  children,
}: Props): React.ReactElement {
  const { activeWallet, activeChain } = useWallet();
  const isSecure = intent.origin.url.startsWith("https://");
  let host = intent.origin.url;
  try {
    host = new URL(intent.origin.url).hostname;
  } catch {
    // keep raw url as fallback
  }

  const onDemandInspectors = InspectorRegistry.list("on-demand").filter(
    (i) => !i.namespaces || i.namespaces.includes(intent.namespace),
  );
  const canAskAgent = onDemandInspectors.some((i) => i.name === "agent");

  return (
    <View className="flex-1">
      <View className="px-4 pt-2 pb-3">
        <Text className="text-lg font-semibold text-gray-900">{title}</Text>
        <View className="flex-row items-center mt-2">
          <Globe size={14} color={isSecure ? "#059669" : "#ea580c"} />
          <Text className="ml-1 text-xs text-gray-600 flex-1" numberOfLines={1}>
            {host}
          </Text>
          {isSecure ? (
            <ShieldCheck size={12} color="#059669" />
          ) : (
            <Text className="text-xs text-orange-600">insecure</Text>
          )}
        </View>
        {activeWallet?.address && (
          <View className="flex-row items-center mt-2">
            <Text className="text-xs text-gray-500">
              {activeWallet.name ?? "Wallet"} ·{" "}
              {truncateAddress({ address: activeWallet.address })}
              {activeChain?.chain?.name ? ` · ${activeChain.chain.name}` : ""}
            </Text>
          </View>
        )}
      </View>

      <View className="px-4">
        <RiskBanner annotations={intent.annotations} />
        {canAskAgent && (
          <TouchableOpacity
            onPress={() => {
              getDappBridge()?.runOnDemandInspector("agent", intent.id);
            }}
            className="flex-row items-center self-start bg-purple-50 border border-purple-200 rounded-full px-3 py-1.5 mb-3"
          >
            <Sparkles size={12} color="#7c3aed" />
            <Text className="ml-1 text-xs text-purple-700 font-medium">
              Ask Takumi AI to review
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <View className="flex-1 px-4">{children}</View>
    </View>
  );
}
