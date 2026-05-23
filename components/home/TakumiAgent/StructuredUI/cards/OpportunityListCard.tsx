/**
 * OpportunityListCard — renders `defi_list_opportunities` results.
 *
 * Reads the structured payload emitted by the mobile executor in
 * `services/agent-executors/defi/reads.ts` (`{ opportunities: [...] }`).
 * Per CLAUDE.md user-facing-error rule the failure branch shows
 * hand-written friendly copy; the raw `output.error` (curated code
 * like `unknown_error` / `authentication_required`) goes to dev logs
 * only.
 */

import { router } from "expo-router";
import {
  AlertTriangle,
  LogIn,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react-native";
import type React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import SingleLoadingSekeleton from "@/components/common/SingleLoadingSekeleton";
import { useUserStrategy } from "@/hooks/queries/useStrategy";
import type { ToolComponentProps } from "../types";
import SetupStrategyCTA from "./SetupStrategyCTA";

const BRAND_RED = "#c71c4b";

type RiskTier = "conservative" | "balanced" | "aggressive";

type OpportunityRow = {
  id?: string;
  protocol_slug: string;
  chain_id?: number;
  chain_name?: string;
  namespace?: string;
  asset_symbol?: string;
  pool_id?: string;
  apy?: number | string;
  apy_7d_avg?: number | string;
  tvl_usd?: number | string;
  score?: number;
  tier?: RiskTier | string;
  il_exposure?: boolean;
};

type OpportunityInput = {
  tier?: string;
  asset_symbol?: string;
  chain_id?: number;
  liquidity_profile?: string;
  amount_usd?: number;
};

type OpportunityOutput = {
  status?: "success" | "failed" | string;
  error?: string;
  data?: {
    opportunities?: OpportunityRow[];
    count?: number;
  };
};

const TIER_LABEL: Record<string, string> = {
  conservative: "Low risk",
  balanced: "Moderate risk",
  aggressive: "High risk",
};

const TIER_PILL_COLOR: Record<string, string> = {
  conservative: "bg-green-100 text-green-700",
  balanced: "bg-amber-100 text-amber-700",
  aggressive: "bg-rose-100 text-rose-700",
};

function formatApy(value: OpportunityRow["apy"]): string {
  if (value === undefined || value === null) return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  // Backend stores APY in percent units (e.g. 5.2 == 5.2%) so render
  // directly without multiplying.
  return `${n.toFixed(2)}%`;
}

function formatTvl(value: OpportunityRow["tvl_usd"]): string | null {
  if (value === undefined || value === null) return null;
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B TVL`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M TVL`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K TVL`;
  return `$${n.toFixed(0)} TVL`;
}

// Prefer the backend's DeFiLlama-provided label (covers testnets like
// "Ethereum Sepolia" and any chain we haven't hardcoded). Fall back to a
// best-effort lookup by chainId for legacy payloads that omit the name.
function chainLabel(
  chainName?: string,
  chainId?: number,
  namespace?: string,
): string | null {
  if (chainName && chainName.trim()) return chainName;
  if (namespace === "solana") return "Solana";
  if (namespace === "sui") return "Sui";
  switch (chainId) {
    case 1:
      return "Ethereum";
    case 8453:
      return "Base";
    case 42161:
      return "Arbitrum";
    case 10:
      return "Optimism";
    case 137:
      return "Polygon";
    case 56:
      return "BNB Chain";
    default:
      return chainId ? `Chain ${chainId}` : null;
  }
}

function SkeletonRow() {
  return (
    <View className="flex-row items-center gap-3 py-2.5">
      <View className="flex-1">
        <SingleLoadingSekeleton width={140} height={12} borderRadius={4} />
        <SingleLoadingSekeleton
          width={90}
          height={10}
          borderRadius={4}
          style={{ marginTop: 6 }}
        />
      </View>
      <View className="items-end">
        <SingleLoadingSekeleton width={60} height={12} borderRadius={4} />
        <SingleLoadingSekeleton
          width={40}
          height={10}
          borderRadius={4}
          style={{ marginTop: 6 }}
        />
      </View>
    </View>
  );
}

function OpportunityRowItem({ row }: { row: OpportunityRow }) {
  const tierKey = String(row.tier ?? "").toLowerCase();
  const tierLabel = TIER_LABEL[tierKey] ?? tierKey;
  const tierClass = TIER_PILL_COLOR[tierKey] ?? "bg-gray-100 text-gray-700";
  const chain = chainLabel(row.chain_name, row.chain_id, row.namespace);
  const tvl = formatTvl(row.tvl_usd);

  return (
    <View className="flex-row items-start gap-3 py-2.5">
      <View className="flex-1 min-w-0">
        <Text
          className="text-sm font-semibold text-light-matte-black"
          numberOfLines={1}
        >
          {row.protocol_slug}
        </Text>
        <View className="flex-row flex-wrap gap-1.5 mt-1">
          {row.asset_symbol ? (
            <Text className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
              {row.asset_symbol}
            </Text>
          ) : null}
          {chain ? (
            <Text className="text-[10px] text-gray-500">· {chain}</Text>
          ) : null}
          {row.il_exposure ? (
            <Text className="text-[10px] text-rose-600">· IL risk</Text>
          ) : null}
        </View>
      </View>
      <View className="items-end">
        <Text className="text-sm font-bold text-emerald-700">
          {formatApy(row.apy)}
        </Text>
        <View
          className={`rounded-full px-2 py-0.5 mt-1 ${tierClass.split(" ")[0]}`}
        >
          <Text
            className={`text-[10px] font-semibold ${tierClass.split(" ")[1]}`}
          >
            {tierLabel || "—"}
          </Text>
        </View>
        {tvl ? (
          <Text className="text-[10px] text-gray-500 mt-1">{tvl}</Text>
        ) : null}
      </View>
    </View>
  );
}

const OpportunityListCard: React.FC<
  ToolComponentProps<OpportunityInput, OpportunityOutput>
> = ({ state, input, output, onUserPrompt }) => {
  const { data: strategy } = useUserStrategy();
  const tierLabel = input?.tier ? (TIER_LABEL[input.tier] ?? input.tier) : null;
  const header = tierLabel
    ? `${tierLabel} opportunities`
    : "Yield opportunities";

  if (state === "input-streaming" || state === "input-available" || !output) {
    return (
      <View className="my-1.5 rounded-2xl border border-light-matte-black/10 bg-white px-3.5 py-3">
        <View className="flex-row items-center gap-2 mb-1">
          <TrendingUp size={14} color={BRAND_RED} />
          <Text className="text-xs font-bold uppercase tracking-wide text-light-matte-black">
            {header}
          </Text>
          <View className="ml-auto">
            <SingleLoadingSekeleton width={50} height={10} borderRadius={4} />
          </View>
        </View>
        <View className="divide-y divide-gray-100">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </View>
      </View>
    );
  }

  if (state === "output-error" || output.status === "failed") {
    if (__DEV__ && output.error) {
      console.warn("[OpportunityListCard] tool result failed:", output.error);
    }
    if (output.error === "authentication_required") {
      return (
        <View className="my-1.5 rounded-2xl border border-light-matte-black/10 bg-white px-3.5 py-4">
          <View className="flex-row items-center gap-2 mb-2">
            <View className="w-8 h-8 rounded-full bg-light-primary-red/10 items-center justify-center">
              <LogIn size={16} color={BRAND_RED} />
            </View>
            <Text className="text-sm font-semibold text-light-matte-black">
              Sign in to explore DeFi
            </Text>
          </View>
          <Text className="text-sm text-light-matte-black/70 mb-3">
            Sign in to see real-time yield opportunities tailored to your
            wallet's risk profile.
          </Text>
          <TouchableOpacity
            onPress={() => router.push("/auth")}
            className="bg-light-primary-red rounded-full px-5 py-2.5 self-start"
          >
            <Text className="text-white font-semibold text-sm">Sign in</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View className="my-1.5 rounded-2xl border border-light-primary-red/30 bg-light-primary-red/5 px-3.5 py-3">
        <View className="flex-row items-center gap-2">
          <AlertTriangle size={14} color={BRAND_RED} />
          <Text className="text-xs font-bold uppercase tracking-wide text-light-primary-red">
            Couldn't load opportunities
          </Text>
        </View>
        <Text className="text-sm text-light-matte-black/80 mt-1.5">
          We couldn't load yield opportunities right now. Please try again in a
          moment.
        </Text>
      </View>
    );
  }

  const rows = output.data?.opportunities ?? [];

  if (rows.length === 0) {
    return (
      <View className="my-1.5 rounded-2xl border border-light-matte-black/10 bg-white px-3.5 py-3">
        <View className="flex-row items-center gap-2">
          <ShieldCheck size={14} color={BRAND_RED} />
          <Text className="text-xs font-bold uppercase tracking-wide text-light-matte-black">
            {header}
          </Text>
        </View>
        <Text className="text-sm text-light-matte-black/80 mt-1.5">
          No matching opportunities right now. Try widening your filters.
        </Text>
      </View>
    );
  }

  return (
    <View className="my-1.5 rounded-2xl border border-light-matte-black/10 bg-white px-3.5 py-3">
      <View className="flex-row items-center gap-2 mb-1">
        <TrendingUp size={14} color={BRAND_RED} />
        <Text className="text-xs font-bold uppercase tracking-wide text-light-matte-black">
          {header}
        </Text>
        <Text className="ml-auto text-[10px] text-gray-500">
          {rows.length} option{rows.length === 1 ? "" : "s"}
        </Text>
      </View>
      <View className="divide-y divide-gray-100">
        {rows.slice(0, 6).map((row, idx) => (
          <OpportunityRowItem
            key={row.id ?? row.pool_id ?? `${row.protocol_slug}-${idx}`}
            row={row}
          />
        ))}
      </View>
      {rows.length > 6 ? (
        <Text className="text-[11px] text-gray-500 mt-2">
          +{rows.length - 6} more in the agent's reply.
        </Text>
      ) : null}
      {strategy && onUserPrompt ? (
        <TouchableOpacity
          onPress={() =>
            onUserPrompt(
              "Pick the best opportunity for me from the ones you just listed and propose a deposit.",
            )
          }
          activeOpacity={0.85}
          className="mt-3 flex-row items-center justify-center gap-2 rounded-xl border border-dashed border-light-primary-red/40 bg-light-primary-red/5 px-3 py-2.5"
        >
          <Sparkles size={14} color={BRAND_RED} />
          <Text className="text-xs font-semibold text-light-primary-red">
            Not sure? Let Takumi pick for you
          </Text>
        </TouchableOpacity>
      ) : null}
      <SetupStrategyCTA />
    </View>
  );
};

export default OpportunityListCard;
