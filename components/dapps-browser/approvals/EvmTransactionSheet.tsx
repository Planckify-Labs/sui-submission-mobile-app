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
import {
  predictAssetDeltasFromCalldata,
  type TxSimulationResult,
} from "@/services/security/txSimulator";
import { truncateAddress } from "@/utils/walletUtils";
import { ApprovalShell } from "./ApprovalShell";
import { PrimaryActions, SheetModal } from "./SheetModal";

// TWV-2026-009 — user-visible copy for the high-risk calldata variants.
// Keep the sentences identical to the spec so reviewers can grep for
// them; copy drift is a merge-block.
const SET_APPROVAL_FOR_ALL_COPY =
  "This gives the operator permission to move ALL current and future NFTs you hold in this collection. Revoke as soon as the dApp is done.";
const UNLIMITED_APPROVE_COPY =
  "This lets the spender move an unlimited amount of this token from your wallet — now and forever, until you revoke.";

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

  // TWV-2026-011 — predict asset deltas from calldata. Network-backed
  // simulation (revert detection via pinned RPC) is wired through the
  // bridge's inspector pipeline; here we surface the predicted delta as
  // the primary UX block. If coverage is partial, the UI must warn that
  // asset movement could not be enumerated.
  const simulation: Pick<
    Extract<TxSimulationResult, { status: "ok" }>,
    "deltas" | "coverage"
  > = useMemo(
    () =>
      predictAssetDeltasFromCalldata({
        from: tx.from,
        to: tx.to,
        value: tx.value,
        data: tx.data,
        chainId: tx.chainId,
      }),
    [tx.from, tx.to, tx.value, tx.data, tx.chainId],
  );

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
          {/*
            TWV-2026-011 — asset-delta block. Rendered above and larger
            than the decoded calldata so the user reads "what moves"
            before "what runs". Partial coverage is surfaced explicitly.
          */}
          <View className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-3">
            <Text className="text-xs font-semibold text-blue-800 uppercase">
              Asset movement
            </Text>
            {simulation.deltas.length === 0 ? (
              <Text className="text-sm text-blue-900 mt-1">
                No predicted asset movement.
              </Text>
            ) : (
              simulation.deltas.map((d, i) => (
                <View
                  key={`${d.kind}-${i}`}
                  className="flex-row items-center mt-1"
                >
                  <Text
                    className={`text-base font-bold ${
                      d.direction === "out" ? "text-red-700" : "text-green-700"
                    }`}
                  >
                    {d.direction === "out" ? "−" : "+"}{" "}
                    {d.amount === "unlimited"
                      ? "Unlimited"
                      : d.amount.toString()}{" "}
                    {d.symbol}
                  </Text>
                </View>
              ))
            )}
            {simulation.coverage === "partial" && (
              <Text className="text-xs text-amber-700 mt-2">
                ⚠ Asset movement could not be enumerated for this calldata. Sign
                with caution — a full pre-sign simulator is on the roadmap
                (TWV-2026-011 follow-up).
              </Text>
            )}
          </View>
          {decoded?.risk?.kind === "setApprovalForAll" &&
            decoded.risk.approved && (
              <View className="bg-red-50 border border-red-300 rounded-xl p-3 mb-3">
                <Text className="text-xs font-bold text-red-800 uppercase">
                  High risk — grants control of entire collection
                </Text>
                <Text className="text-sm text-red-900 mt-1">
                  {SET_APPROVAL_FOR_ALL_COPY}
                </Text>
                <View className="flex-row mt-2">
                  <Text className="text-xs text-red-700 w-20">Operator</Text>
                  <Text className="text-xs text-red-900 flex-1" selectable>
                    {decoded.risk.operator}
                  </Text>
                </View>
                <View className="flex-row mt-1">
                  <Text className="text-xs text-red-700 w-20">Collection</Text>
                  <Text className="text-xs text-red-900 flex-1" selectable>
                    {tx.to}
                  </Text>
                </View>
              </View>
            )}
          {decoded?.risk?.kind === "approve" && decoded.risk.isUnlimited && (
            <View className="bg-red-50 border border-red-300 rounded-xl p-3 mb-3">
              <Text className="text-xs font-bold text-red-800 uppercase">
                Unlimited approval
              </Text>
              <Text className="text-sm text-red-900 mt-1">
                {UNLIMITED_APPROVE_COPY}
              </Text>
              <View className="flex-row mt-2">
                <Text className="text-xs text-red-700 w-20">Spender</Text>
                <Text className="text-xs text-red-900 flex-1" selectable>
                  {decoded.risk.spender}
                </Text>
              </View>
              <View className="flex-row mt-1">
                <Text className="text-xs text-red-700 w-20">Token</Text>
                <Text className="text-xs text-red-900 flex-1" selectable>
                  {tx.to}
                </Text>
              </View>
            </View>
          )}
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
        approveLabel={
          decoded?.risk?.kind === "setApprovalForAll" && decoded.risk.approved
            ? "Grant full collection access"
            : decoded?.risk?.kind === "approve" && decoded.risk.isUnlimited
              ? "Approve unlimited"
              : "Confirm"
        }
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
