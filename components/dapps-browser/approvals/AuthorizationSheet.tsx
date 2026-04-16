import React from "react";
import { Text, View } from "react-native";
import type {
  ApprovalDecision,
  ApprovalIntent,
} from "@/services/bridge/approval";
import type { EvmAuthorizationPayload } from "@/services/chains/evm/payloads";
import { ApprovalShell } from "./ApprovalShell";
import { PrimaryActions, SheetModal } from "./SheetModal";

interface Props {
  intent: ApprovalIntent<EvmAuthorizationPayload>;
  onDecision: (d: ApprovalDecision) => void;
}

export function AuthorizationSheet({
  intent,
  onDecision,
}: Props): React.ReactElement {
  const p = intent.payload;
  const expires = p.expiresAt
    ? new Date(p.expiresAt).toLocaleString()
    : "24 hours";
  return (
    <SheetModal
      onDismiss={() => onDecision({ id: intent.id, outcome: "reject" })}
    >
      <ApprovalShell intent={intent} title="Smart account delegation">
        <View className="bg-amber-50 rounded-xl p-3">
          <Text className="text-sm text-amber-900 mb-2">
            This grants a smart-account delegator permission to run code on your
            behalf until {expires}. You keep your address and funds.
          </Text>
          <Text className="text-xs text-gray-500">Delegator</Text>
          <Text className="text-sm text-gray-900 mb-2" selectable>
            {p.delegator}
          </Text>
          <Text className="text-xs text-gray-500">Chain</Text>
          <Text className="text-sm text-gray-900">{p.chainId}</Text>
        </View>
      </ApprovalShell>
      <PrimaryActions
        approveLabel="Authorize"
        onApprove={() => onDecision({ id: intent.id, outcome: "approve" })}
        onReject={() => onDecision({ id: intent.id, outcome: "reject" })}
      />
    </SheetModal>
  );
}
