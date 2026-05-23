/**
 * DeFi strategies API types — mirror the backend Prisma models in
 * `api/src/strategies/*` (UserStrategy, OpportunityCache,
 * StrategyPosition). See `docs/defi-strategies-spec.md` §13.
 *
 * The backend serializes Prisma `Decimal` and `BigInt` columns as
 * strings; we keep them as strings here and parse on the consumer
 * side when arithmetic is required.
 */

export type RiskTier = "conservative" | "balanced" | "aggressive";

export type LiquidityProfile = "instant" | "queued_short" | "queued_long";

export type StrategyStatus = "active" | "withdrawn" | "failed";

export interface TOpportunity {
  id: string;
  protocolSlug: string;
  chainId: number;
  namespace: string;
  /** Human-readable chain label, sourced from DeFiLlama's `chain` field
   * (e.g. "Ethereum", "Arbitrum", "Base", "Solana"). */
  chainName: string;
  assetSymbol: string;
  assetContract: string | null;
  poolId: string;
  apy: string;
  apy7dAvg: string;
  apyStddev30d: string;
  tvlUsd: string;
  tvl7dDelta: string;
  emissionsToFeesRatio: string | null;
  ilExposure: boolean;
  score: number;
  tier: RiskTier;
  scoredAt: string;
}

export interface TStrategyPosition {
  id: string;
  userStrategyId: string;
  walletAddress: string;
  chainId: number;
  namespace: string;
  /** Human-readable chain label, mirrors `TOpportunity.chainName`. */
  chainName: string;
  protocolSlug: string;
  assetSymbol: string;
  assetContract: string | null;
  amountAtDeposit: string;
  amountAtDepositUsd: string;
  currentAmountRaw: string | null;
  currentAmountUsd: string | null;
  status: StrategyStatus | string;
  openTxHash: string | null;
  closeTxHash: string | null;
  openedAt: string;
  closedAt: string | null;
  goal: string | null;
  targetDate: string | null;
}

export type AssetPreference = "stable" | "eth_lst" | "multi";

export interface TUserStrategy {
  id: string;
  userId: string;
  walletAddress: string;
  namespace: string;
  tier: RiskTier;
  assetPreferences: AssetPreference[];
  liquidityPref: string;
  chainPref: unknown;
  allocationPct: number;
  rebalanceTrigger: unknown;
  protocolWhitelist: string[];
  allowAllInTier: boolean;
  autoCompound: boolean;
  notificationLevel: string;
  activatedAt: string | null;
  pausedAt: string | null;
  createdAt: string;
  updatedAt: string;
  positions?: TStrategyPosition[];
}

/**
 * Cross-chain (LI.FI) types — mirror `LifiQuote` in
 * `api/src/strategies/external/lifi.client.ts`. The backend wraps the
 * official `@lifi/sdk` and returns a stable, JSON-safe quote shape.
 *
 * `value`, `gasPrice`, `gasLimit` are decimal strings (the backend
 * coerces `BigIntish` to string); mobile parses them with `BigInt(...)`
 * before submitting the transaction.
 */
export interface TCrossChainQuoteRequest {
  fromChainId: number;
  toChainId: number;
  fromTokenContract: `0x${string}` | string;
  toTokenContract: `0x${string}` | string;
  amountRaw: string;
  toAddress?: `0x${string}` | string;
}

export interface TCrossChainTransactionRequest {
  to: `0x${string}` | string;
  data: `0x${string}` | string;
  value: string;
  from?: string;
  chainId?: number;
  gasPrice?: string;
  gasLimit?: string;
}

export interface TCrossChainQuote {
  transactionRequest: TCrossChainTransactionRequest;
  estimate: {
    toAmount: string;
    executionDuration: number;
    fromAmount?: string;
    fromAmountUSD?: string;
    toAmountUSD?: string;
    approvalAddress?: string;
  };
  tool: string;
  toolName?: string;
}

export interface TCrossChainStatusResponse {
  status: string;
  substatus?: string;
}
