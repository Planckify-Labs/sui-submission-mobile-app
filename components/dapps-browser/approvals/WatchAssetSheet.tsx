import React from "react";
import { Text, View } from "react-native";
import type {
  ApprovalDecision,
  ApprovalIntent,
} from "@/services/bridge/approval";
import type { EvmWatchAssetPayload } from "@/services/chains/evm/payloads";
import { ApprovalShell } from "./ApprovalShell";
import { PrimaryActions, SheetModal } from "./SheetModal";

interface Props {
  intent: ApprovalIntent<EvmWatchAssetPayload>;
  onDecision: (d: ApprovalDecision) => void;
}

export function WatchAssetSheet({
  intent,
  onDecision,
}: Props): React.ReactElement {
  const p = intent.payload;
  return (
    <SheetModal
      onDismiss={() => onDecision({ id: intent.id, outcome: "reject" })}
    >
      <ApprovalShell intent={intent} title="Add asset">
        <View className="bg-gray-50 rounded-xl p-3">
          <Text className="text-xs text-gray-500">Standard</Text>
          <Text className="text-base text-gray-900 mb-2">{p.standard}</Text>
          <Text className="text-xs text-gray-500">Contract</Text>
          <Text className="text-sm text-gray-900 mb-2" selectable>
            {p.address}
          </Text>
          {p.standard === "ERC20" && (
            <>
              <Text className="text-xs text-gray-500">Symbol</Text>
              <Text className="text-sm text-gray-900 mb-2">{p.symbol}</Text>
              <Text className="text-xs text-gray-500">Decimals</Text>
              <Text className="text-sm text-gray-900 mb-2">{p.decimals}</Text>
            </>
          )}
          {p.standard !== "ERC20" && p.tokenId && (
            <>
              <Text className="text-xs text-gray-500">Token ID</Text>
              <Text className="text-sm text-gray-900 mb-2">{p.tokenId}</Text>
            </>
          )}
        </View>
      </ApprovalShell>
      <PrimaryActions
        approveLabel="Add"
        onApprove={() => onDecision({ id: intent.id, outcome: "approve" })}
        onReject={() => onDecision({ id: intent.id, outcome: "reject" })}
      />
    </SheetModal>
  );
}
