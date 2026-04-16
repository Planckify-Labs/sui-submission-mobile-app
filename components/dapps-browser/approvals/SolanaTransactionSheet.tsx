import React from "react";
import { Text, View } from "react-native";
import type {
  ApprovalDecision,
  ApprovalIntent,
} from "@/services/bridge/approval";
import type { SolanaSignTxPayload } from "@/services/chains/solana/payloads";
import { ApprovalShell } from "./ApprovalShell";
import { PrimaryActions, SheetModal } from "./SheetModal";

interface Props {
  intent: ApprovalIntent<SolanaSignTxPayload>;
  onDecision: (d: ApprovalDecision) => void;
}

export function SolanaTransactionSheet({
  intent,
  onDecision,
}: Props): React.ReactElement {
  const p = intent.payload;
  return (
    <SheetModal
      onDismiss={() => onDecision({ id: intent.id, outcome: "reject" })}
    >
      <ApprovalShell intent={intent} title="Approve Solana transaction">
        <View className="bg-gray-50 rounded-xl p-3">
          <Text className="text-xs text-gray-500">Cluster</Text>
          <Text className="text-sm text-gray-900 mb-2">{p.cluster}</Text>
          <Text className="text-xs text-gray-500">From</Text>
          <Text className="text-sm text-gray-900 mb-2" selectable>
            {p.address}
          </Text>
          <Text className="text-xs text-gray-500">
            Transaction (base64, truncated)
          </Text>
          <Text className="text-xs text-gray-900" selectable numberOfLines={3}>
            {p.transaction.slice(0, 120)}
            {p.transaction.length > 120 ? "…" : ""}
          </Text>
        </View>
      </ApprovalShell>
      <PrimaryActions
        onApprove={() => onDecision({ id: intent.id, outcome: "approve" })}
        onReject={() => onDecision({ id: intent.id, outcome: "reject" })}
      />
    </SheetModal>
  );
}
