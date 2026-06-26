import { api } from "@/constants/configs/ky";
import type {
  LiquidityProfile,
  RiskTier,
  TCrossChainQuote,
  TCrossChainQuoteRequest,
  TCrossChainStatusResponse,
  TOpportunity,
  TStrategyPosition,
  TUserStrategy,
} from "../types/strategy";
import { buildSearchParams } from "../utils/api-helpers";

export interface TOpportunitySearchParams {
  tier?: string;
  asset_symbol?: string;
  chain_id?: number;
  /** Chain namespace filter ("eip155" | "solana" | "sui") — lets the agent
   *  ask for non-EVM yield (Sui rows are chainId 0, keyed by namespace). */
  namespace?: string;
  liquidity_profile?: string;
  amount_usd?: number;
}

export interface TProtocolOption {
  protocolSlug: string;
  namespace: string;
  chainId: number;
  /** Backend-resolved display name (joins Blockchain registry → curated set). */
  chainName: string;
  tier: RiskTier;
  assetSymbol: string;
}

export interface TCreateStrategyPayload {
  namespace: "eip155" | "solana" | "sui";
  tier: RiskTier;
  assetPreferences: Array<"stable" | "eth_lst" | "multi">;
  liquidityPref: LiquidityProfile | "7d" | "30d" | "instant";
  chainPref: Array<number | "any">;
  allocationPct: number;
  rebalanceTrigger:
    | { kind: "interval"; value: "weekly" | "monthly" }
    | {
        kind: "yield_drop";
        thresholdPct: number;
      };
  protocolWhitelist?: string[];
  allowAllInTier?: boolean;
  autoCompound?: boolean;
  notificationLevel: "every" | "daily" | "alerts";
}

export const strategiesApi = {
  getStrategy: async () => {
    return api.get("strategies").json<TUserStrategy>();
  },

  createStrategy: async (payload: TCreateStrategyPayload) => {
    return api.post("strategies", { json: payload }).json<TUserStrategy>();
  },

  updateStrategy: async (payload: Partial<TCreateStrategyPayload>) => {
    return api.patch("strategies", { json: payload }).json<TUserStrategy>();
  },

  getOpportunities: async (params: TOpportunitySearchParams = {}) => {
    const searchParams = buildSearchParams(params);
    const qs = searchParams.toString();
    const url = qs
      ? `strategies/opportunities?${qs}`
      : "strategies/opportunities";
    return api.get(url).json<TOpportunity[]>();
  },

  getOpportunity: async (slug: string) => {
    return api
      .get(`strategies/opportunities/${encodeURIComponent(slug)}`)
      .json<TOpportunity>();
  },

  getProtocols: async (tier?: RiskTier) => {
    const qs = tier ? `?tier=${encodeURIComponent(tier)}` : "";
    return api.get(`strategies/protocols${qs}`).json<TProtocolOption[]>();
  },

  getPositions: async () => {
    return api.get("strategies/positions").json<TStrategyPosition[]>();
  },

  createPosition: async (payload: {
    protocolSlug: string;
    chainId: number;
    namespace: string;
    assetSymbol: string;
    assetContract?: string;
    amountAtDeposit: string;
    amountAtDepositUsd: number;
    openTxHash?: string;
    goal?: string;
    targetDate?: string;
  }) => {
    return api
      .post("strategies/positions", { json: payload })
      .json<TStrategyPosition>();
  },

  getPosition: async (id: string) => {
    return api
      .get(`strategies/positions/${encodeURIComponent(id)}`)
      .json<TStrategyPosition>();
  },

  refreshPosition: async (id: string) => {
    return api
      .post(`strategies/positions/${encodeURIComponent(id)}/refresh`)
      .json<TStrategyPosition>();
  },

  getCrossChainQuote: async (payload: TCrossChainQuoteRequest) => {
    return api
      .post("strategies/cross-chain/quote", { json: payload })
      .json<TCrossChainQuote>();
  },

  getCrossChainStatus: async (params: {
    fromChainId: number;
    toChainId: number;
    txHash: string;
  }) => {
    const qs = new URLSearchParams({
      from_chain_id: String(params.fromChainId),
      to_chain_id: String(params.toChainId),
      tx_hash: params.txHash,
    }).toString();
    return api
      .get(`strategies/cross-chain/status?${qs}`)
      .json<TCrossChainStatusResponse>();
  },
};
