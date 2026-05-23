/**
 * RebalancePreviewCard — preview step for `defi_rebalance`.
 *
 * Spec: docs/defi-strategies-spec.md §14.5.4.
 *
 * Live mode: shows the from→to diff, APY delta, fees, and Approve /
 * Reject buttons. Approve calls `addToolResult({ status: "ok",
 * user_decision: "approved" })`; the executor then fires the two writes
 * sequentially, each rendering its own PendingTxCard underneath.
 *
 * Historical mode: frozen badge showing the approved/declined state and
 * timestamp. Tx hashes of the executed legs are surfaced by the
 * trailing PendingTxCard entries, not duplicated here.
 */

import { ArrowRight, CheckCircle2, XCircle } from "lucide-react-native";
import { Text, TouchableOpacity, View } from "react-native";
import type { ToolComponentProps } from "../types";

const BRAND_RED = "#c71c4b";

export type RebalancePreviewInput = {
  from?: {
    protocol_slug?: string;
    chain_id?: number | string;
    asset_symbol?: string;
    amount_raw?: string;
    apy?: number;
    display_name?: string;
  };
  to?: {
    protocol_slug?: string;
    chain_id?: number | string;
    asset_symbol?: string;
    min_amount_raw?: string;
    apy?: number;
    display_name?: string;
  };
  reason?: "yield_improvement" | "depeg_emergency" | "user_initiated" | string;
  estimated?: {
    apy_delta_bps?: number;
    total_fee_usd?: number;
    route_steps?: number;
  };
};

export type RebalancePreviewOutput = {
  status?: "ok" | "rejected" | "error" | string;
  user_decision?: "approved" | "rejected";
  error?: string;
};

function fmtApy(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value.toFixed(2)}%`;
}

function fmtUsd(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (value < 0.01) return "<$0.01";
  return `$${value.toFixed(2)}`;
}

function fmtDeltaBps(bps: number | undefined): {
  label: string;
  positive: boolean;
} {
  if (typeof bps !== "number" || !Number.isFinite(bps)) {
    return { label: "—", positive: true };
  }
  const sign = bps >= 0 ? "+" : "−";
  const abs = Math.abs(bps);
  return { label: `${sign}${(abs / 100).toFixed(2)}%`, positive: bps >= 0 };
}

function reasonLabel(reason?: string): string {
  switch (reason) {
    case "yield_improvement":
      return "Higher yield available";
    case "depeg_emergency":
      return "Stablecoin depeg — moving funds to safety";
    case "user_initiated":
      return "You asked to rebalance";
    default:
      return "Rebalance proposed";
  }
}

export function RebalancePreviewCard({
  input,
  output,
  mode,
  addToolResult,
}: ToolComponentProps<RebalancePreviewInput, RebalancePreviewOutput>) {
  const from = input.from;
  const to = input.to;
  const delta = fmtDeltaBps(input.estimated?.apy_delta_bps);

  // Historical render — frozen decision.
  if (mode === "historical" || output?.user_decision) {
    const approved = output?.user_decision === "approved";
    return (
      <View className="bg-light-main-container rounded-2xl p-4 border border-light-matte-black/10 mb-3">
        <View className="flex-row items-center mb-2">
          {approved ? (
            <CheckCircle2 color="#16a34a" size={20} />
          ) : (
            <XCircle color={BRAND_RED} size={20} />
          )}
          <Text className="ml-2 font-semibold text-light-matte-black">
            {approved
              ? "You approved this rebalance"
              : "You declined this rebalance"}
          </Text>
        </View>
        <View className="flex-row items-center mt-1">
          <Text
            className="text-light-matte-black/60 text-sm flex-1"
            numberOfLines={1}
          >
            {from?.display_name ?? from?.protocol_slug ?? "From"}
          </Text>
          <ArrowRight color="#64748b" size={16} />
          <Text
            className="text-light-matte-black/80 text-sm flex-1 ml-2"
            numberOfLines={1}
          >
            {to?.display_name ?? to?.protocol_slug ?? "To"}
          </Text>
        </View>
      </View>
    );
  }

  // Live render — interactive approval.
  return (
    <View className="bg-light rounded-3xl p-5 shadow-md- mb-3 border border-light-matte-black/5">
      <View className="mb-3">
        <Text className="text-light-matte-black/60 text-xs uppercase tracking-wide">
          {reasonLabel(input.reason)}
        </Text>
        <Text className="text-light-matte-black font-bold text-lg mt-1">
          Rebalance suggested
        </Text>
      </View>

      <View className="flex-row items-center mb-4">
        <View className="flex-1 bg-light-main-container rounded-xl p-3">
          <Text className="text-light-matte-black/60 text-xs">From</Text>
          <Text
            className="text-light-matte-black font-semibold mt-1"
            numberOfLines={1}
          >
            {from?.display_name ?? from?.protocol_slug ?? "—"}
          </Text>
          <Text className="text-light-matte-black/60 text-xs mt-1">
            {fmtApy(from?.apy)} APY
          </Text>
        </View>
        <View className="px-2">
          <ArrowRight color="#475569" size={18} />
        </View>
        <View className="flex-1 bg-emerald-50 rounded-xl p-3 border border-emerald-100">
          <Text className="text-emerald-900/70 text-xs">To</Text>
          <Text
            className="text-emerald-950 font-semibold mt-1"
            numberOfLines={1}
          >
            {to?.display_name ?? to?.protocol_slug ?? "—"}
          </Text>
          <Text className="text-emerald-800 text-xs mt-1">
            {fmtApy(to?.apy)} APY
          </Text>
        </View>
      </View>

      <View className="flex-row items-center mb-4 gap-3">
        <View className="flex-1 bg-light-main-container rounded-xl p-3">
          <Text className="text-light-matte-black/60 text-xs">APY delta</Text>
          <Text
            className={`mt-1 font-semibold ${
              delta.positive ? "text-emerald-600" : "text-rose-600"
            }`}
          >
            {delta.label}
          </Text>
        </View>
        <View className="flex-1 bg-light-main-container rounded-xl p-3">
          <Text className="text-light-matte-black/60 text-xs">Est. fee</Text>
          <Text className="text-light-matte-black mt-1 font-semibold">
            {fmtUsd(input.estimated?.total_fee_usd)}
          </Text>
        </View>
        <View className="flex-1 bg-light-main-container rounded-xl p-3">
          <Text className="text-light-matte-black/60 text-xs">Steps</Text>
          <Text className="text-light-matte-black mt-1 font-semibold">
            {input.estimated?.route_steps ?? 2}
          </Text>
        </View>
      </View>

      <View className="flex-row gap-3">
        <TouchableOpacity
          onPress={() =>
            addToolResult?.({ status: "rejected", user_decision: "rejected" })
          }
          className="flex-1 bg-light-main-container rounded-2xl py-3 items-center"
        >
          <Text className="text-light-matte-black font-semibold">Not now</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() =>
            addToolResult?.({ status: "ok", user_decision: "approved" })
          }
          className="flex-1 bg-light-matte-black rounded-2xl py-3 items-center"
        >
          <Text className="text-light font-semibold">Approve rebalance</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default RebalancePreviewCard;
