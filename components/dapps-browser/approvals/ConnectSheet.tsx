import { Check } from "lucide-react-native";
import React, { useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useWallet } from "@/hooks/useWallet";
import type {
  ApprovalDecision,
  ApprovalIntent,
} from "@/services/bridge/approval";
import type { EvmConnectPayload } from "@/services/chains/evm/payloads";
import { truncateAddress } from "@/utils/walletUtils";
import { ApprovalShell } from "./ApprovalShell";
import { PrimaryActions, SheetModal } from "./SheetModal";

interface Props {
  intent: ApprovalIntent<EvmConnectPayload>;
  onDecision: (d: ApprovalDecision) => void;
}

export function ConnectSheet({
  intent,
  onDecision,
}: Props): React.ReactElement {
  const { wallets, activeWalletIndex } = useWallet();
  const [selected, setSelected] = useState<number>(activeWalletIndex);

  return (
    <SheetModal
      onDismiss={() => onDecision({ id: intent.id, outcome: "reject" })}
    >
      <ApprovalShell intent={intent} title="Connect wallet">
        <ScrollView className="flex-1">
          <Text className="text-sm text-gray-500 mb-3">
            This site is requesting access to your wallet address.
          </Text>
          {wallets.map((w, i) => (
            <TouchableOpacity
              key={w.address}
              onPress={() => setSelected(i)}
              className={`p-3 rounded-xl border mb-2 ${
                selected === i
                  ? "border-black bg-gray-50"
                  : "border-gray-200 bg-white"
              }`}
            >
              <View className="flex-row items-center">
                <View className="flex-1">
                  <Text className="text-base font-medium text-gray-900">
                    {w.name || `Wallet ${i + 1}`}
                  </Text>
                  <Text className="text-xs text-gray-500">
                    {truncateAddress({ address: w.address, preset: "medium" })}
                  </Text>
                </View>
                {selected === i && <Check size={18} color="#111" />}
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </ApprovalShell>
      <PrimaryActions
        approveLabel="Connect"
        onApprove={() =>
          onDecision({
            id: intent.id,
            outcome: "approve",
            data: { walletIndex: selected },
          })
        }
        onReject={() => onDecision({ id: intent.id, outcome: "reject" })}
      />
    </SheetModal>
  );
}
