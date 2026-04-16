import React, { useMemo, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { formatEther } from "viem";
import type {
  ApprovalDecision,
  ApprovalIntent,
} from "@/services/bridge/approval";
import type {
  EvmSendTxPayload,
  GasEstimate,
} from "@/services/chains/evm/payloads";
import { decodeCalldata } from "@/services/decoders";
import { truncateAddress } from "@/utils/walletUtils";
import { ApprovalShell } from "./ApprovalShell";
import { PrimaryActions, SheetModal } from "./SheetModal";

interface Props {
  intent: ApprovalIntent<EvmSendTxPayload & { gasEstimate?: GasEstimate }>;
  onDecision: (d: ApprovalDecision) => void;
}

export function EvmTransactionSheet({
  intent,
  onDecision,
}: Props): React.ReactElement {
  const tx = intent.payload;
  const [source, setSource] = useState<"wallet" | "dApp">(
    tx.gasEstimate?.recommended ?? "wallet",
  );
  const decoded = useMemo(() => decodeCalldata(tx.data), [tx.data]);

  const feeLabel =
    tx.type === 0 ? "Legacy" : tx.type === 1 ? "Access list" : "Dynamic fee";

  const gasCost = useMemo(() => {
    const est =
      source === "wallet" && tx.gasEstimate
        ? tx.gasEstimate.wallet
        : tx.gasEstimate?.dApp;
    if (!est) return null;
    const maxFee = (est.maxFeePerGas ?? est.gasPrice) || undefined;
    const gas = est.gas ?? tx.gas;
    if (!maxFee || !gas) return null;
    try {
      return formatEther(maxFee * gas);
    } catch {
      return null;
    }
  }, [source, tx.gas, tx.gasEstimate]);

  return (
    <SheetModal
      onDismiss={() => onDecision({ id: intent.id, outcome: "reject" })}
    >
      <ApprovalShell intent={intent} title="Approve transaction">
        <ScrollView className="flex-1">
          <View className="bg-gray-50 rounded-xl p-3 mb-3">
            <Text className="text-xs text-gray-500">To</Text>
            <Text className="text-sm text-gray-900" selectable>
              {tx.to}
            </Text>
            {tx.value && tx.value > 0n && (
              <>
                <Text className="text-xs text-gray-500 mt-2">Value</Text>
                <Text className="text-sm text-gray-900">
                  {formatEther(tx.value)} {intent.wallet ? "native" : ""}
                </Text>
              </>
            )}
          </View>

          {decoded && decoded.signature && (
            <View className="bg-white rounded-xl border border-gray-200 p-3 mb-3">
              <Text className="text-xs text-gray-500 mb-1">Function</Text>
              <Text className="text-sm font-medium text-gray-900">
                {decoded.functionName}
              </Text>
              {decoded.args?.map((a, i) => (
                <View key={`${a.name}-${i}`} className="flex-row mt-1">
                  <Text className="text-xs text-gray-500 w-20">{a.name}</Text>
                  <Text className="text-xs text-gray-900 flex-1" selectable>
                    {formatArg(a.value)}
                  </Text>
                </View>
              ))}
              {decoded.ambiguous && (
                <Text className="text-xs text-amber-700 mt-1">
                  Selector matches multiple signatures; best-guess shown.
                </Text>
              )}
            </View>
          )}
          {decoded && !decoded.signature && tx.data && tx.data !== "0x" && (
            <View className="bg-white rounded-xl border border-gray-200 p-3 mb-3">
              <Text className="text-xs text-gray-500">
                Calldata (unknown selector)
              </Text>
              <Text className="text-xs text-gray-900" selectable>
                {decoded.selector}…
              </Text>
            </View>
          )}

          <View className="bg-white rounded-xl border border-gray-200 p-3">
            <View className="flex-row items-center mb-2">
              <Text className="text-xs text-gray-500 flex-1">
                Gas · {feeLabel}
              </Text>
              {tx.gasEstimate && (
                <View className="flex-row">
                  <TouchableOpacity
                    onPress={() => setSource("dApp")}
                    className={`px-2 py-1 rounded-l-md ${
                      source === "dApp" ? "bg-gray-900" : "bg-gray-100"
                    }`}
                  >
                    <Text
                      className={`text-xs ${
                        source === "dApp" ? "text-white" : "text-gray-700"
                      }`}
                    >
                      dApp
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setSource("wallet")}
                    className={`px-2 py-1 rounded-r-md ${
                      source === "wallet" ? "bg-gray-900" : "bg-gray-100"
                    }`}
                  >
                    <Text
                      className={`text-xs ${
                        source === "wallet" ? "text-white" : "text-gray-700"
                      }`}
                    >
                      Wallet
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
            <Text className="text-sm text-gray-900">
              {gasCost ? `~${gasCost}` : "—"}
            </Text>
            {tx.gasEstimate && (
              <Text className="text-xs text-gray-500 mt-1">
                {tx.gasEstimate.rationale}
              </Text>
            )}
          </View>

          {(intent.wallet?.type === "Smart4337" ||
            intent.wallet?.type === "Smart7702") && (
            <Text className="text-xs text-gray-500 mt-3">
              Smart wallet · Executed as a UserOperation
            </Text>
          )}
        </ScrollView>
      </ApprovalShell>
      <PrimaryActions
        approveLabel="Confirm"
        onApprove={() => {
          // Stash the user-picked source on the payload so adapter uses it.
          if (tx.gasEstimate) tx.gasEstimate.recommended = source;
          onDecision({ id: intent.id, outcome: "approve" });
        }}
        onReject={() => onDecision({ id: intent.id, outcome: "reject" })}
      />
    </SheetModal>
  );
}

function formatArg(v: unknown): string {
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "string" && v.startsWith("0x") && v.length === 42)
    return truncateAddress({ address: v, preset: "medium" });
  if (Array.isArray(v)) return `[${v.length} items]`;
  return String(v);
}
