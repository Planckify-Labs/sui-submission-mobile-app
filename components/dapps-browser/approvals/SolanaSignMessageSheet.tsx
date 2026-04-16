import React from "react";
import { Text, View } from "react-native";
import type {
  ApprovalDecision,
  ApprovalIntent,
} from "@/services/bridge/approval";
import type { SolanaSignMessagePayload } from "@/services/chains/solana/payloads";
import { ApprovalShell } from "./ApprovalShell";
import { PrimaryActions, SheetModal } from "./SheetModal";

interface Props {
  intent: ApprovalIntent<SolanaSignMessagePayload>;
  onDecision: (d: ApprovalDecision) => void;
}

export function SolanaSignMessageSheet({
  intent,
  onDecision,
}: Props): React.ReactElement {
  const p = intent.payload;
  return (
    <SheetModal
      onDismiss={() => onDecision({ id: intent.id, outcome: "reject" })}
    >
      <ApprovalShell intent={intent} title="Sign Solana message">
        <View className="bg-gray-50 rounded-xl p-3">
          <Text className="text-sm text-gray-900" selectable>
            {p.message}
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
