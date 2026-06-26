import type {
  ChainConfig,
  SuiChainConfig,
} from "@/constants/configs/chainConfig";
import type { TWallet } from "@/constants/types/walletTypes";
import type { Namespace } from "@/services/chains/types";

export type RiskTier = "conservative" | "balanced" | "aggressive";
export type StrategyKind =
  | "stablecoin_lending"
  | "liquid_staking"
  | "rwa_yield"
  | "yield_vault"
  | "lp_stable"
  | "lp_volatile"
  | "restaking"
  | "delta_neutral";

export interface DefiOpportunity {
  protocolSlug: string;
  namespace: Namespace;
  chainId: number | string; // EVM number or Solana cluster string
  assetSymbol: string;
  assetContract?: string; // null for native
  apy: number;
  apy7dAvg: number;
  tvlUsd: number;
  score: number; // 0–100
  tier: RiskTier;
  kind: StrategyKind;
  liquidityProfile: "instant" | "queued_short" | "queued_long";
  source: "defillama" | "manual";
}

export interface DefiPosition {
  protocolSlug: string;
  namespace: Namespace;
  chainId: number | string;
  assetSymbol: string;
  amountAtDeposit: bigint;
  amountAtDepositUsd: number;
  currentAmount: bigint;
  currentAmountUsd: number;
  pnlUsd: number;
  openTxHash?: string;
}

export interface BuildDepositArgs {
  wallet: TWallet;
  chain: ChainConfig;
  asset: { symbol: string; contract?: string; decimals: number };
  amount: bigint; // raw units
}

export interface BuildWithdrawArgs extends Omit<BuildDepositArgs, "amount"> {
  /** raw units; pass `"MAX"` to exit fully. */
  amount: bigint | "MAX";
}

/**
 * The DEX leg appended into a zap's shared `Transaction` (the swap side of
 * an atomic swap→supply). Injected by the compiler so the DEX SDK stays in
 * the swap layer and the lending adapter owns only its deposit leg.
 */
export interface ZapSwapLeg {
  outputCoin: import("@mysten/sui/transactions").TransactionObjectArgument;
  leftoverCoins: import("@mysten/sui/transactions").TransactionObjectArgument[];
  expectedOut: bigint;
  priceImpact: number;
  toCoinType: string;
  poolObjectId?: string;
}

export interface ZapSupplyArgs {
  wallet: TWallet;
  chain: SuiChainConfig;
  /** Symbol of the asset to swap INTO and then supply (e.g. "USDC"). */
  supplyAssetSymbol: string;
  /**
   * Appends the swap leg to the shared `Transaction` and returns its output
   * coin + leftovers. Injected so the DEX SDK stays in the swap layer — the
   * adapter owns only the supply (lending) leg (space-docking).
   */
  appendSwap: (
    tx: import("@mysten/sui/transactions").Transaction,
  ) => Promise<ZapSwapLeg | null>;
}

export interface ZapSupplyResult {
  ptbBase64: string;
  expectedOut: bigint;
  priceImpact: number;
  toCoinType: string;
  poolObjectId?: string;
}

/**
 * One adapter per (protocol, chain) deployment. AaveV3 on Ethereum is
 * one, AaveV3 on Base is another. Solana / Sui protocols implement
 * the same interface; chain-specific submission lives in the
 * `UnsignedCall` discriminant and the WalletKitAdapter method the
 * caller picks. Shared code never branches on protocolSlug.
 */
export interface DefiProtocolAdapter {
  readonly slug: string; // e.g. "aave-v3-base"
  readonly namespace: Namespace; // discriminator for UnsignedCall
  readonly kind: StrategyKind;
  readonly chainId: number | string;
  readonly displayName: string;

  /** Pure builds — no signer required. Caller submits via WalletKit. */
  buildDeposit(args: BuildDepositArgs): Promise<UnsignedCall>;
  buildWithdraw(args: BuildWithdrawArgs): Promise<UnsignedCall>;

  /** Pure read — no signer required. */
  readPosition(walletAddress: string): Promise<DefiPosition | null>;

  // ── Optional capabilities (presence-checked, never namespace-checked) ──
  /** Rewards claim where the protocol has a separate accrual primitive. */
  buildClaim?(args: BuildDepositArgs): Promise<UnsignedCall>;
  /** wstETH wrap / unwrap, jitoSOL stake-account merge, etc. */
  buildWrap?(args: BuildDepositArgs): Promise<UnsignedCall>;
  /** Adapter-level safety override; falls back to server-computed score. */
  staticSafetyScore?: number; // 0–100
  /** Per-deployment minimum deposit in raw asset units. */
  minDepositRaw?: bigint;

  /**
   * External catalog slugs this adapter fulfills — e.g. the DeFiLlama
   * `pool.project` ("scallop-lend") that `defi_list_opportunities`
   * surfaces. Lets a discovered opportunity slug (or a venue named by the
   * agent) resolve to this adapter without a central per-protocol map —
   * the next protocol docks by declaring its own aliases here, never by a
   * branch in shared code. Matched case-insensitively alongside `slug`.
   */
  readonly externalSlugs?: readonly string[];
  /**
   * Atomic swap→supply zap composer (Sui Intent Engine §4.7): one PTB that
   * swaps into the supply asset and supplies it, all-or-nothing. Optional —
   * only venues that support single-PTB zap-in expose it; the compiler
   * presence-checks it rather than branching on the venue name.
   */
  buildZapSupply?(args: ZapSupplyArgs): Promise<ZapSupplyResult>;
  /**
   * Best-effort supply-preview enrichment (APY / resolved input coinType)
   * for the intent preview card. Optional and must never throw.
   */
  readSupplyMeta?(
    assetSymbol: string,
    ownerAddress: string,
  ): Promise<{ apy?: string; inputCoinType?: string }>;
}

/**
 * `UnsignedCall` carries everything submission needs *except* a
 * signer. The discriminant maps 1:1 to the `WalletKitAdapter` write
 * method the caller will pick:
 *
 *   "evm-call"   → walletKit.sendContractTransaction()
 *                  (or sendUserOpWithUsdcPaymaster() on Base/Arb)
 *   "solana-ix"  → walletKit.sendAnchorInstruction()
 *   "sui-ptb"    → walletKit.<sui send method>      (when a Sui DeFi adapter ships)
 *
 * The `needsApproval` field on the EVM variant tells the caller it
 * must inject an ERC-20 approve preamble before the target call.
 * Same shape the gasless paymaster path already consumes
 * (`services/walletKit/types.ts:189-218`), so we can route either
 * branch through it.
 */
export type UnsignedCall =
  | {
      kind: "evm-call";
      to: `0x${string}`;
      data: `0x${string}`;
      value?: bigint;
      needsApproval?: {
        token: `0x${string}`;
        spender: `0x${string}`;
        amount: bigint;
      };
    }
  | {
      kind: "solana-ix";
      instructions: import("@solana/web3.js").TransactionInstruction[];
      additionalSigners?: import("@solana/web3.js").Signer[];
    }
  | {
      kind: "sui-ptb";
      transactionBlockBase64: string;
    };
