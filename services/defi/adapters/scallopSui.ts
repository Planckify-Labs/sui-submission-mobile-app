/**
 * Scallop adapter — a `DefiProtocolAdapter` for the Sui Intent Engine
 * (spec §4.4). Mirrors `solanaJito.ts` (the "supply to earn yield"
 * exemplar): `namespace:"sui"`, `chainId:"mainnet"`, `kind:"stablecoin_lending"`,
 * returning a `{ kind:"sui-ptb", transactionBlockBase64 }` UnsignedCall.
 *
 * MAINNET-ONLY: the Scallop SDK ships no testnet addresses (§4.4), so this
 * adapter's `chainId:"mainnet"` means `listDefiAdaptersForChain("sui",
 * "testnet")` resolves it nowhere — the network gate is free, no `networks`
 * field. On testnet the agent simply doesn't offer supply/withdraw.
 *
 * The Scallop SDK (`@scallop-io/sui-scallop-sdk`) is dynamically imported
 * so its (Pyth, axios, sui-kit) module graph never loads at app boot — only
 * when a supply/withdraw actually runs (the `recordTransferHistory`
 * precedent). Every SDK failure maps to a curated `DefiError` — never a raw
 * SDK/RPC string (CLAUDE.md user-facing-errors).
 *
 * Mainnet build behaviour is validated against mainnet with a small real
 * amount (spec §14.5) before the yield hero is demoed; until then the
 * adapter is reachable only when the user is on Sui mainnet, and any SDK
 * shape drift surfaces as a typed friendly error, never a bad signature.
 */

import { toBase64 } from "@mysten/bcs";
import type {
  Transaction,
  TransactionObjectArgument,
} from "@mysten/sui/transactions";
import type { SuiChainConfig } from "@/constants/configs/chainConfig";
import type { TWallet } from "@/constants/types/walletTypes";
import { SuiSwapError } from "@/services/swap/sui/types";
import { DefiError } from "../errors/defiErrors";
import type {
  BuildDepositArgs,
  BuildWithdrawArgs,
  DefiPosition,
  DefiProtocolAdapter,
  UnsignedCall,
} from "../types";
import { resolveScallopCoin } from "./scallop.config";

const SLUG = "scallop-sui";
const NETWORK = "mainnet" as const;

function devWarn(scope: string, err: unknown): void {
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    console.warn(`[scallopSui] ${scope}:`, err);
  }
}

/** Lazily load the Scallop builder for the active (mainnet) network. */
async function createBuilder() {
  const mod = await import("@scallop-io/sui-scallop-sdk");
  const scallop = new mod.Scallop({ networkType: NETWORK });
  return scallop.createScallopBuilder();
}

async function createQuery() {
  const mod = await import("@scallop-io/sui-scallop-sdk");
  const scallop = new mod.Scallop({ networkType: NETWORK });
  return scallop.createScallopQuery();
}

/**
 * Best-effort supply enrichment for the preview — APY + the resolved input
 * coinType — read from Scallop's market data. Never throws; returns an
 * empty object on any failure so the preview still renders.
 */
export async function readScallopSupplyMeta(
  assetSymbol: string,
  ownerAddress: string,
): Promise<{ apy?: string; inputCoinType?: string }> {
  const coin = resolveScallopCoin(assetSymbol);
  if (!coin) return {};
  try {
    const query = await createQuery();
    const lending = await query.getLending(coin.coinName, ownerAddress);
    return {
      apy:
        typeof lending?.supplyApy === "number"
          ? (lending.supplyApy * 100).toFixed(2)
          : undefined,
      inputCoinType: lending?.coinType,
    };
  } catch (err) {
    devWarn("readScallopSupplyMeta", err);
    return {};
  }
}

/** The swap leg appended into the shared tx (the DEX side of a zap). */
export interface ZapSwapLeg {
  outputCoin: TransactionObjectArgument;
  leftoverCoins: TransactionObjectArgument[];
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
   * coin + leftovers. Injected so the DEX SDK stays in the swap layer — this
   * module owns only the Scallop deposit leg (space-docking).
   */
  appendSwap: (tx: Transaction) => Promise<ZapSwapLeg | null>;
}

export interface ZapSupplyResult {
  ptbBase64: string;
  expectedOut: bigint;
  priceImpact: number;
  toCoinType: string;
  poolObjectId?: string;
}

/**
 * Atomic swap→supply (spec §4.7, the "why Sui" hero) — MAINNET-ONLY.
 *
 * Builds ONE Programmable Transaction Block that swaps `fromAsset`→`toAsset`
 * on a DEX and supplies the resulting coin to Scallop, all-or-nothing. The
 * Scallop SDK is the master tx (its `ScallopTxBlock.txBlock` IS a `@mysten/sui`
 * `Transaction`, and the docs support driving both together); the DEX swap
 * appends to that same tx and we feed its output coin straight into
 * `scallopTxBlock.deposit(coin, coinName)` (official builder API, returns the
 * market coin). The market coin + any swap leftovers transfer back to the user.
 *
 * On EVM/Solana there is no atomic multi-step preview like this — that is the
 * Sui-specific advantage the Intent Engine showcases. Every SDK failure maps
 * to a curated `DefiError`/`SuiSwapError`, never a raw string.
 */
export async function buildScallopZapSupply(
  args: ZapSupplyArgs,
): Promise<ZapSupplyResult> {
  if (args.chain.namespace !== "sui") {
    throw new DefiError("unsupported_chain", "scallop: requires sui namespace");
  }
  const coin = resolveScallopCoin(args.supplyAssetSymbol);
  if (!coin) {
    throw new DefiError(
      "unsupported_asset",
      `scallop: ${args.supplyAssetSymbol}`,
    );
  }
  try {
    const builder = await createBuilder();
    const stx = builder.createTxBlock();
    // Version-skew boundary (the ONLY reason for the casts here): Scallop's
    // `sui-kit@1.4.x` bundles `@mysten/sui@^1.x`, but this app runs
    // `@mysten/sui@^2.x`. The SDK DOES type these — `ScallopTxBlock.txBlock`
    // is `Transaction` and `deposit(coin: SuiObjectArg, poolCoinName)` returns
    // `TransactionResult` — but those are the SAME shapes from a DIFFERENT
    // major version, so TS sees them as nominally distinct. We bridge
    // structurally at this one seam, exactly like the DeepBook path
    // (`as unknown as DeepBookCompatibleClient`, "2.16 vs the SDK's 2.18 peer
    // differ only structurally"). Runtime validation is the mainnet smoke
    // test (spec §14.5).
    const tx = stx.txBlock as unknown as Transaction;
    tx.setSender(args.wallet.address);

    const swap = await args.appendSwap(tx);
    if (!swap) {
      throw new DefiError("deposit_failed", "zap: swap leg unavailable");
    }

    // Supply the swapped coin to Scallop; `deposit(coin, poolCoinName)` returns
    // the market coin (official builder API). The cast targets the SDK's REAL
    // first-parameter type (`SuiObjectArg` from sui-kit), not `never`, so a
    // genuine signature change still fails to compile — it only bridges the
    // 1.x↔2.x `TransactionObjectArgument` skew described above.
    const marketCoin = stx.deposit(
      swap.outputCoin as unknown as Parameters<typeof stx.deposit>[0],
      coin.coinName,
    ) as unknown as TransactionObjectArgument;

    // Return the market coin + any swap leftovers (unused input + DEEP).
    tx.transferObjects(
      [marketCoin, ...swap.leftoverCoins],
      tx.pure.address(args.wallet.address),
    );

    const bytes = await tx.build({ client: builder.suiKit.client });
    return {
      ptbBase64: toBase64(bytes),
      expectedOut: swap.expectedOut,
      priceImpact: swap.priceImpact,
      toCoinType: swap.toCoinType,
      poolObjectId: swap.poolObjectId,
    };
  } catch (err) {
    if (err instanceof DefiError) throw err;
    if (err instanceof SuiSwapError) throw err; // preserve actionable swap reason
    devWarn("buildScallopZapSupply", err);
    throw new DefiError("deposit_failed", "zap: build failed");
  }
}

export const ScallopSuiAdapter: DefiProtocolAdapter = {
  slug: SLUG,
  namespace: "sui",
  kind: "stablecoin_lending",
  chainId: NETWORK, // string id → free network gate via listDefiAdaptersForChain
  displayName: "Scallop (Sui)",
  staticSafetyScore: 80,

  async buildDeposit({
    chain,
    asset,
    amount,
  }: BuildDepositArgs): Promise<UnsignedCall> {
    if (chain.namespace !== "sui") {
      throw new DefiError(
        "unsupported_chain",
        "scallop: requires sui namespace",
      );
    }
    const coin = resolveScallopCoin(asset.symbol);
    if (!coin) {
      throw new DefiError("unsupported_asset", `scallop: ${asset.symbol}`);
    }
    try {
      const builder = await createBuilder();
      const tx = builder.createTxBlock();
      // depositQuick selects + merges the input coin and (per Scallop's
      // builder docs) handles the resulting market coin; the dry-run gate
      // catches any leftover-value revert before signing.
      await tx.depositQuick(Number(amount), coin.coinName);
      const bytes = await tx.build({ client: builder.suiKit.client });
      return { kind: "sui-ptb", transactionBlockBase64: toBase64(bytes) };
    } catch (err) {
      if (err instanceof DefiError) throw err;
      devWarn("buildDeposit", err);
      throw new DefiError("deposit_failed", "scallop: build failed");
    }
  },

  async buildWithdraw({
    wallet,
    chain,
    asset,
    amount,
  }: BuildWithdrawArgs): Promise<UnsignedCall> {
    if (chain.namespace !== "sui") {
      throw new DefiError(
        "unsupported_chain",
        "scallop: requires sui namespace",
      );
    }
    const coin = resolveScallopCoin(asset.symbol);
    if (!coin) {
      throw new DefiError("unsupported_asset", `scallop: ${asset.symbol}`);
    }
    try {
      let raw: number;
      if (amount === "MAX") {
        const query = await createQuery();
        const lending = await query.getLending(coin.coinName, wallet.address);
        const withdrawable = lending?.availableWithdrawAmount ?? 0;
        if (!withdrawable || withdrawable <= 0) {
          throw new DefiError(
            "no_onchain_balance",
            "scallop: nothing to withdraw",
          );
        }
        raw = withdrawable;
      } else {
        raw = Number(amount);
      }
      const builder = await createBuilder();
      const tx = builder.createTxBlock();
      await tx.withdrawQuick(raw, coin.coinName);
      const bytes = await tx.build({ client: builder.suiKit.client });
      return { kind: "sui-ptb", transactionBlockBase64: toBase64(bytes) };
    } catch (err) {
      if (err instanceof DefiError) throw err;
      devWarn("buildWithdraw", err);
      throw new DefiError("withdraw_failed", "scallop: build failed");
    }
  },

  async readPosition(walletAddress: string): Promise<DefiPosition | null> {
    // Best-effort: report the USDC lending position as the representative
    // Scallop position. Returns null on any failure (defi_list_positions
    // just omits Scallop until the read is exercised on mainnet, §14.5).
    try {
      const query = await createQuery();
      const lending = await query.getLending("usdc", walletAddress);
      const supplied = lending?.suppliedAmount ?? 0;
      if (!supplied || supplied <= 0) return null;
      return {
        protocolSlug: SLUG,
        namespace: "sui",
        chainId: NETWORK,
        assetSymbol: "USDC",
        amountAtDeposit: 0n,
        amountAtDepositUsd: 0,
        currentAmount: BigInt(Math.round(supplied)),
        currentAmountUsd: lending?.suppliedValue ?? 0,
        pnlUsd: 0,
      };
    } catch (err) {
      devWarn("readPosition", err);
      return null;
    }
  },
};
