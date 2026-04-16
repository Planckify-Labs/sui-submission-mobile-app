/**
 * WalletTokensCard — registry card for the `get_wallet_tokens` read tool.
 *
 * Pure read: historical render is byte-identical to live render because
 * the output is already a snapshot from the executor. No store reads,
 * no timers, no interactive affordances.
 */

import { AlertTriangle, Coins } from "lucide-react-native";
import type React from "react";
import { Text, View } from "react-native";
import OptimizedImage from "@/components/common/OptimizedImage";
import SingleLoadingSekeleton from "@/components/common/SingleLoadingSekeleton";
import type { ToolComponentProps } from "../types";

type TokenRow = {
  symbol?: string;
  name?: string;
  address?: string;
  decimals?: number;
  is_native?: boolean;
  is_stable_coin?: boolean;
  logo_url?: string | null;
  balance_wei?: string;
  balance_display?: string;
};

type ChainGroup = {
  chain_id?: number;
  chain_name?: string;
  chain_symbol?: string;
  tokens: TokenRow[];
};

type WalletTokensInput = {
  chain_id?: number;
  chain_ids?: number[];
  include_balance?: boolean;
};

type WalletTokensPayload = {
  // Single-chain shape
  chain_id?: number;
  tokens?: TokenRow[];
  // Multi-chain shape
  chains?: ChainGroup[];
  chain_errors?: Array<{ chain_id: number; error: string }>;
};

type WalletTokensOutput = {
  status?: "success" | "failed" | string;
  error?: string;
  // UI reads `display` (rich) first, falling back to `data` (compact
  // agent-facing slice) — see `protocol.ts::ToolResult`.
  display?: WalletTokensPayload;
  data?: WalletTokensPayload;
};

const MUTED_GRAY = "#6b7280";
const BRAND_RED = "#c71c4b";

function formatBalance(display: string | undefined): string {
  if (!display) return "—";
  const num = Number(display);
  if (!Number.isFinite(num)) return display;
  if (num === 0) return "0";
  if (num >= 1)
    return num.toLocaleString(undefined, { maximumFractionDigits: 4 });
  // Small balances: keep up to 6 significant digits.
  return num.toLocaleString(undefined, { maximumSignificantDigits: 6 });
}

function hasAnyBalance(tokens: TokenRow[]): boolean {
  return tokens.some((t) => {
    const n = Number(t.balance_display ?? "0");
    return Number.isFinite(n) && n > 0;
  });
}

function SkeletonRow() {
  return (
    <View className="flex-row items-center gap-3 py-2">
      <SingleLoadingSekeleton width={36} height={36} borderRadius={18} />
      <View className="flex-1 min-w-0">
        <SingleLoadingSekeleton width={60} height={12} borderRadius={4} />
        <SingleLoadingSekeleton
          width={100}
          height={10}
          borderRadius={4}
          style={{ marginTop: 4 }}
        />
      </View>
      <View className="items-end">
        <SingleLoadingSekeleton width={56} height={12} borderRadius={4} />
        <SingleLoadingSekeleton
          width={30}
          height={10}
          borderRadius={4}
          style={{ marginTop: 4 }}
        />
      </View>
    </View>
  );
}

function TokenRowItem({ token }: { token: TokenRow }) {
  const balance = formatBalance(token.balance_display);
  const hasBalance = token.balance_display !== undefined;
  return (
    <View className="flex-row items-center gap-3 py-2">
      <View className="rounded-full overflow-hidden w-9 h-9 border border-light-matte-black/10 bg-light-primary-red/10 items-center justify-center">
        {token.logo_url ? (
          <OptimizedImage
            source={{ uri: token.logo_url }}
            containerStyle={{ width: 36, height: 36 }}
            contentFit="cover"
            alt={`${token.symbol ?? "token"} logo`}
          />
        ) : (
          <Coins size={16} color={BRAND_RED} />
        )}
      </View>
      <View className="flex-1 min-w-0">
        <Text
          className="text-sm font-semibold text-light-matte-black"
          numberOfLines={1}
        >
          {token.symbol ?? "—"}
          {token.is_native ? (
            <Text className="text-[10px] text-gray-500 font-normal">
              {" "}
              · native
            </Text>
          ) : null}
        </Text>
        {token.name ? (
          <Text className="text-[11px] text-gray-500" numberOfLines={1}>
            {token.name}
          </Text>
        ) : null}
      </View>
      <View className="items-end">
        <Text
          className={`text-sm font-semibold ${
            hasBalance ? "text-light-matte-black" : "text-gray-400"
          }`}
          numberOfLines={1}
        >
          {balance}
        </Text>
        <Text className="text-[10px] text-gray-500" numberOfLines={1}>
          {token.symbol ?? ""}
        </Text>
      </View>
    </View>
  );
}

function ChainBlock({ group }: { group: ChainGroup }) {
  const tokens = group.tokens ?? [];
  const withBalance = tokens.filter((t) => {
    const n = Number(t.balance_display ?? "0");
    return Number.isFinite(n) && n > 0;
  });
  const display = withBalance.length > 0 ? withBalance : tokens.slice(0, 6);

  return (
    <View className="mt-2 first:mt-0">
      {group.chain_name ? (
        <Text className="text-[10px] uppercase tracking-wide text-gray-500 font-bold mb-1">
          {group.chain_name}
        </Text>
      ) : null}
      <View className="divide-y divide-gray-100">
        {display.map((token, idx) => (
          <TokenRowItem
            key={`${token.address ?? token.symbol ?? "row"}-${idx}`}
            token={token}
          />
        ))}
      </View>
      {withBalance.length === 0 && tokens.length > 0 ? (
        <Text className="text-[11px] text-gray-400 mt-1">
          No balances yet — showing supported tokens.
        </Text>
      ) : null}
    </View>
  );
}

const WalletTokensCard: React.FC<
  ToolComponentProps<WalletTokensInput, WalletTokensOutput>
> = ({ state, output }) => {
  if (state === "input-streaming" || state === "input-available" || !output) {
    return (
      <View className="my-1.5 rounded-2xl border border-light-matte-black/10 bg-white px-3.5 py-3">
        <View className="flex-row items-center gap-2 mb-1">
          <Coins size={14} color={BRAND_RED} />
          <Text className="text-xs font-bold uppercase tracking-wide text-light-matte-black">
            Wallet balances
          </Text>
          <View className="ml-auto">
            <SingleLoadingSekeleton width={50} height={10} borderRadius={4} />
          </View>
        </View>
        <View className="divide-y divide-gray-100">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </View>
      </View>
    );
  }

  if (state === "output-error" || output.status === "failed") {
    return (
      <View className="my-1.5 rounded-2xl border border-light-primary-red/30 bg-light-primary-red/5 px-3.5 py-3">
        <View className="flex-row items-center gap-2">
          <AlertTriangle size={14} color={BRAND_RED} />
          <Text className="text-xs font-bold uppercase tracking-wide text-light-primary-red">
            Couldn't read balances
          </Text>
        </View>
        {output.error ? (
          <Text className="text-sm text-light-matte-black/80 mt-1.5">
            {output.error}
          </Text>
        ) : null}
      </View>
    );
  }

  const payload = output.display ?? output.data ?? {};
  const groups: ChainGroup[] = Array.isArray(payload.chains)
    ? payload.chains
    : Array.isArray(payload.tokens)
      ? [{ chain_id: payload.chain_id, tokens: payload.tokens }]
      : [];

  const totalTokens = groups.reduce(
    (sum, g) => sum + (g.tokens?.length ?? 0),
    0,
  );
  const anyBalance = groups.some((g) => hasAnyBalance(g.tokens ?? []));

  return (
    <View className="my-1.5 rounded-2xl border border-light-matte-black/10 bg-white px-3.5 py-3">
      <View className="flex-row items-center gap-2 mb-1">
        <Coins size={14} color={BRAND_RED} />
        <Text className="text-xs font-bold uppercase tracking-wide text-light-matte-black">
          Wallet balances
        </Text>
        <Text className="text-[11px] text-gray-500 ml-auto">
          {totalTokens} {totalTokens === 1 ? "token" : "tokens"}
        </Text>
      </View>
      {groups.length === 0 ? (
        <Text className="text-sm text-gray-500">No tokens to show.</Text>
      ) : (
        groups.map((g, i) => <ChainBlock key={g.chain_id ?? i} group={g} />)
      )}
      {!anyBalance && totalTokens > 0 ? (
        <Text className="text-[11px] text-gray-400 mt-2">
          Balances will appear once the wallet has funds on this chain.
        </Text>
      ) : null}
      {Array.isArray(payload.chain_errors) &&
      payload.chain_errors.length > 0 ? (
        <View className="mt-2 rounded-xl bg-light-primary-red/5 border border-light-primary-red/20 px-2.5 py-1.5">
          <Text className="text-[10px] uppercase tracking-wide text-light-primary-red font-bold">
            Couldn't reach {payload.chain_errors.length} chain(s)
          </Text>
        </View>
      ) : null}
    </View>
  );
};

export default WalletTokensCard;
