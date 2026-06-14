/**
 * X402FetchCard — receipt/disclosure UI for the `x402_fetch` tool.
 *
 * Agent-initiated x402 micropayments settle silently within the user's
 * pre-signed allowance (spec Phase 5 §6.2). "Silent" means no approval
 * prompt — NOT invisible: this card discloses exactly what was paid
 * (amount + resource + rail + on-chain tx) so the user always sees the
 * price of an autonomous spend. Over-budget / allowance-needed states
 * are where the user is actually asked to act.
 *
 * Reads the executor's `ToolResult` (payload in `output.data`, shaped by
 * `services/agent-executors/wallet/x402.ts`). Renders the same in live
 * and historical mode — it's a disclosure, not an interactive step.
 */

import * as Linking from "expo-linking";
import {
  CircleDollarSign,
  ExternalLink,
  KeyRound,
  ShieldAlert,
  XCircle,
} from "lucide-react-native";
import type React from "react";
import { Pressable, Text, View } from "react-native";
import { useBlockchainByChainId } from "@/hooks/useBlockchainsWithStorage";
import {
  buildExplorerUrl,
  explorerTxUrlFromBase,
} from "../../PendingTxCard/explorerUrl";
import type { ToolComponentProps } from "../types";

const SUCCESS_GREEN = "#10b981";
const BRAND_RED = "#c71c4b";
const AMBER = "#d97706";
const MUTED_GRAY = "#6b7280";

type X402FetchInput = {
  url?: string;
  method?: string;
  maxSpendUsdc?: number | string;
  chain_id?: number;
};

type X402Data = {
  paid?: boolean;
  chain_id?: number;
  amount_usdc?: string;
  rail?: "facilitator" | "relayer" | string;
  tx_hash?: string;
  over_budget?: boolean;
  requested_usdc?: string;
  remaining_usdc?: string;
  needs_allowance?: boolean;
  message?: string;
};

type X402FetchOutput = {
  status?: string;
  tx_hash?: string;
  error?: string;
  data?: X402Data;
};

/**
 * Friendly label naming the resource *family*, not the sub-action — so
 * `/api/v1/security-audit/incidents` reads as "security audit", never the
 * alarming "incidents". Strips scheme + host + `api`/`vN` prefixes and
 * uses the first meaningful path segment. Stays API-derived (no hardcoded
 * resource names); falls back to neutral copy.
 */
function resourceLabel(url?: string): string {
  if (!url) return "premium data";
  try {
    const afterScheme = url.replace(/^[a-z]+:\/\//i, "");
    const segs = afterScheme.split("?")[0].split("/").filter(Boolean);
    // segs[0] is the host — drop it, then drop api/version prefixes.
    const meaningful = segs.slice(1).filter((s) => !/^(api|v\d+)$/i.test(s));
    const seg = meaningful[0];
    return seg ? seg.replace(/[-_]/g, " ") : "premium data";
  } catch {
    return "premium data";
  }
}

function truncateHash(hash: string): string {
  if (hash.length <= 14) return hash;
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

function railLabel(rail?: string): string | null {
  // Not "gas-free": the relayer abstracts gas (no ETH needed) but is paid
  // a fee in the user's own USDC. Label it honestly.
  if (rail === "relayer") return "relayer · USDC gas";
  if (rail === "facilitator") return "facilitator";
  return null;
}

function Shell({
  border,
  bg,
  children,
  onPress,
}: {
  border: string;
  bg: string;
  children: React.ReactNode;
  onPress?: () => void;
}) {
  const className = `my-1.5 rounded-2xl border ${border} ${bg} px-3.5 py-3`;
  if (onPress) {
    return (
      <Pressable accessible accessibilityRole="button" onPress={onPress} className={className}>
        {children}
      </Pressable>
    );
  }
  return <View className={className}>{children}</View>;
}

const X402FetchCard: React.FC<
  ToolComponentProps<X402FetchInput, X402FetchOutput>
> = ({ state, input, output }) => {
  const label = resourceLabel(input?.url);
  const data = output?.data;

  // Resolve the chain the payment settled on so the tx hash links to the
  // right explorer. Prefer the executor's emitted `chain_id` (the actual
  // settle chain), then the agent's input, then Base Sepolia (the Phase 5
  // settle chain). The hook runs unconditionally — before the early
  // returns below — to satisfy the rules of hooks.
  const chainId =
    data?.chain_id ??
    (typeof input?.chain_id === "number" ? input.chain_id : 84532);
  // Most testnet / L2 rows (incl. Base Sepolia) only exist in the backend
  // `/blockchains` feed, not the static `supportedChains` seed — so we read
  // the explorer base from the feed and fall back to the static helper.
  const { data: blockchain } = useBlockchainByChainId(chainId);

  // Pending — settling the micropayment.
  if (!data && (state === "input-streaming" || state === "input-available")) {
    return (
      <Shell border="border-gray-200" bg="bg-gray-50">
        <View className="flex-row items-center gap-2">
          <CircleDollarSign size={16} color={MUTED_GRAY} />
          <Text className="text-xs font-bold uppercase tracking-wide text-gray-500">
            Paying for {label}
          </Text>
        </View>
        <Text className="text-sm text-gray-700 mt-1.5">
          Settling a micropayment from your spending delegation…
        </Text>
      </Shell>
    );
  }

  // Over budget — the user is asked to top up; nothing was spent.
  if (data?.over_budget) {
    return (
      <Shell border="border-amber-300/60" bg="bg-amber-50/70">
        <View className="flex-row items-center gap-2">
          <ShieldAlert size={16} color={AMBER} />
          <Text className="text-xs font-bold uppercase tracking-wide text-amber-700">
            Over your agent budget
          </Text>
        </View>
        <Text className="text-sm text-light-matte-black/80 mt-1.5">
          {data.message ?? `${label} costs more than your remaining delegated budget.`}
        </Text>
        <View className="flex-row items-center justify-between mt-2">
          <Text className="text-[11px] text-gray-500">
            Price {data.requested_usdc ?? "—"}
          </Text>
          <Text className="text-[11px] text-gray-500">
            Remaining {data.remaining_usdc ?? "—"}
          </Text>
        </View>
      </Shell>
    );
  }

  // No allowance granted yet.
  if (data?.needs_allowance) {
    return (
      <Shell border="border-gray-200" bg="bg-gray-50">
        <View className="flex-row items-center gap-2">
          <KeyRound size={16} color={MUTED_GRAY} />
          <Text className="text-xs font-bold uppercase tracking-wide text-gray-500">
            Delegation needed
          </Text>
        </View>
        <Text className="text-sm text-light-matte-black/80 mt-1.5">
          {data.message ??
            "Grant the agent a USDC spending delegation so it can pay for this automatically."}
        </Text>
      </Shell>
    );
  }

  // Couldn't pay / fetch (not over-budget, not allowance) — friendly only.
  if (data && data.paid === false) {
    return (
      <Shell border="border-light-primary-red/30" bg="bg-light-primary-red/5">
        <View className="flex-row items-center gap-2">
          <XCircle size={16} color={BRAND_RED} />
          <Text className="text-xs font-bold uppercase tracking-wide text-light-primary-red">
            Couldn&apos;t fetch {label}
          </Text>
        </View>
        <Text className="text-sm text-light-matte-black/80 mt-1.5">
          {data.message ?? "We couldn't complete that paid request. Please try again."}
        </Text>
      </Shell>
    );
  }

  // Paid — the receipt. Discloses the price of the autonomous spend.
  const txHash = data?.tx_hash ?? output?.tx_hash;
  const explorerUrl = txHash
    ? explorerTxUrlFromBase(blockchain?.blockExplorer, txHash) ??
      buildExplorerUrl(chainId, txHash as `0x${string}`)
    : undefined;
  const rail = railLabel(data?.rail);

  return (
    <Shell
      border="border-green-200"
      bg="bg-green-50/60"
      onPress={
        explorerUrl ? () => Linking.openURL(explorerUrl).catch(() => {}) : undefined
      }
    >
      <View className="flex-row items-center gap-2">
        <CircleDollarSign size={16} color={SUCCESS_GREEN} />
        <Text className="text-xs font-bold uppercase tracking-wide text-green-700">
          Paid {data?.amount_usdc ?? "for premium data"}
        </Text>
      </View>
      <Text className="text-sm text-light-matte-black/80 mt-1.5 capitalize">
        {label}
        {rail ? <Text className="text-light-matte-black/50"> · {rail}</Text> : null}
      </Text>
      {txHash ? (
        <View className="flex-row items-center gap-1.5 mt-2">
          <Text
            className={`text-[11px] flex-1 ${explorerUrl ? "text-green-700 font-medium underline" : "text-gray-500"}`}
            numberOfLines={1}
          >
            {truncateHash(txHash)}
          </Text>
          {explorerUrl ? (
            <>
              <Text className="text-[11px] text-green-700 font-medium">
                View
              </Text>
              <ExternalLink size={12} color={SUCCESS_GREEN} />
            </>
          ) : null}
        </View>
      ) : null}
    </Shell>
  );
};

export default X402FetchCard;
