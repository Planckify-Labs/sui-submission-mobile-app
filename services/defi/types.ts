import type { ChainConfig } from "@/constants/configs/chainConfig";
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
