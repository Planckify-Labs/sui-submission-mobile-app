/**
 * DeFi read executors — wire `defi_list_opportunities` and
 * `defi_list_positions` to the backend `/strategies/*` endpoints.
 *
 * Spec: docs/defi-strategies-spec.md §11.
 *
 * `defi_list_opportunities` and `defi_get_config` are pure backend
 * calls. `defi_list_positions` is hybrid: the backend owns position
 * metadata (slug, asset, opened_at, goal, target_date, amount_at_deposit),
 * and we enrich each row with the live on-chain balance via the
 * protocol adapter so the user sees the current position value (with
 * accrued interest) instead of a stale DB snapshot.
 */

import { strategiesApi } from "@/api/endpoints/strategies";
import type { TOpportunity, TStrategyPosition } from "@/api/types/strategy";
import { readPosition } from "@/services/defi/positions/reader";
import {
  type MobileToolExecutor,
  optionalString,
  safeExecute,
  type ToolInput,
} from "../types";
import { classifyPointsError, sanitizeApiResponse } from "../utils";

function optionalInt(input: ToolInput, key: string): number | undefined {
  const value = input[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return undefined;
  }
  return value;
}

function optionalNumber(input: ToolInput, key: string): number | undefined {
  const value = input[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
}

function shapeOpportunity(o: TOpportunity) {
  return {
    id: o.id,
    protocol_slug: o.protocolSlug,
    chain_id: o.chainId,
    chain_name: o.chainName,
    namespace: o.namespace,
    asset_symbol: o.assetSymbol,
    asset_contract: o.assetContract,
    pool_id: o.poolId,
    apy: o.apy,
    apy_7d_avg: o.apy7dAvg,
    tvl_usd: o.tvlUsd,
    score: o.score,
    tier: o.tier,
    il_exposure: o.ilExposure,
    scored_at: o.scoredAt,
  };
}

function shapePosition(p: TStrategyPosition) {
  return {
    id: p.id,
    protocol_slug: p.protocolSlug,
    chain_id: p.chainId,
    chain_name: p.chainName,
    namespace: p.namespace,
    asset_symbol: p.assetSymbol,
    asset_contract: p.assetContract,
    amount_at_deposit: p.amountAtDeposit,
    amount_at_deposit_usd: p.amountAtDepositUsd,
    current_amount_raw: p.currentAmountRaw,
    current_amount_usd: p.currentAmountUsd,
    status: p.status,
    open_tx_hash: p.openTxHash,
    close_tx_hash: p.closeTxHash,
    opened_at: p.openedAt,
    closed_at: p.closedAt,
    goal: p.goal,
    target_date: p.targetDate,
  };
}

/**
 * `defi_list_opportunities` — scored, tier-filtered yield catalog.
 *
 * Backend returns the curated list filtered by tier when the user has a
 * `UserStrategy` row, or unfiltered when they don't. Transient params
 * (tier/asset_symbol/chain_id/liquidity_profile/amount_usd) let
 * first-touch users browse without onboarding (§14.6).
 */
export const listOpportunities: MobileToolExecutor = (input, _context) =>
  safeExecute(async () => {
    const tier = optionalString(input, "tier");
    const assetSymbol = optionalString(input, "asset_symbol");
    const chainId = optionalInt(input, "chain_id");
    const namespace = optionalString(input, "namespace");
    const liquidityProfile = optionalString(input, "liquidity_profile");
    const amountUsd = optionalNumber(input, "amount_usd");

    if (__DEV__) {
      console.warn("[defi/listOpportunities] ENTER", {
        tier,
        assetSymbol,
        chainId,
        namespace,
        liquidityProfile,
        amountUsd,
      });
    }

    try {
      const raw = await strategiesApi.getOpportunities({
        ...(tier ? { tier } : {}),
        ...(assetSymbol ? { asset_symbol: assetSymbol } : {}),
        ...(chainId !== undefined ? { chain_id: chainId } : {}),
        ...(namespace ? { namespace } : {}),
        ...(liquidityProfile ? { liquidity_profile: liquidityProfile } : {}),
        ...(amountUsd !== undefined ? { amount_usd: amountUsd } : {}),
      });
      const opportunities = (raw ?? []).map(shapeOpportunity);
      if (__DEV__) {
        console.warn("[defi/listOpportunities] OK", {
          count: opportunities.length,
          slugs: opportunities.map((o) => o.protocol_slug),
        });
      }
      return {
        status: "success",
        data: sanitizeApiResponse({
          opportunities,
          count: opportunities.length,
        }),
      };
    } catch (err) {
      if (__DEV__) {
        console.error("[defi/listOpportunities] failed", {
          tier,
          assetSymbol,
          chainId,
          liquidityProfile,
          amountUsd,
          error: err,
        });
      }
      return { status: "failed", error: classifyPointsError(err) };
    }
  });

/**
 * `defi_get_config` — return the user's UserStrategy row (or null when
 * the wallet has none yet). The LLM uses this to ground tier /
 * whitelist reasoning before proposing a deposit.
 */
export const getConfig: MobileToolExecutor = (_input, _context) =>
  safeExecute(async () => {
    if (__DEV__) {
      console.warn("[defi/getConfig] ENTER");
    }
    try {
      const strategy = await strategiesApi.getStrategy().catch((err) => {
        if (__DEV__) {
          console.warn(
            "[defi/getConfig] getStrategy rejected (treating as no strategy)",
            { error: err },
          );
        }
        return null;
      });
      if (__DEV__) {
        console.warn("[defi/getConfig] OK", {
          hasStrategy: !!strategy,
          tier: strategy?.tier,
          paused: !!strategy?.pausedAt,
          whitelistLen: strategy?.protocolWhitelist?.length ?? 0,
        });
      }
      return {
        status: "success",
        data: sanitizeApiResponse({
          strategy: strategy
            ? {
                tier: strategy.tier,
                liquidity_pref: strategy.liquidityPref,
                allocation_pct: strategy.allocationPct,
                protocol_whitelist: strategy.protocolWhitelist ?? [],
                allow_all_in_tier: !!strategy.allowAllInTier,
                rebalance_trigger: strategy.rebalanceTrigger,
                notification_level: strategy.notificationLevel,
                activated_at: strategy.activatedAt,
                paused_at: strategy.pausedAt,
              }
            : null,
        }),
      };
    } catch (err) {
      if (__DEV__) {
        console.error("[defi/getConfig] failed", { error: err });
      }
      return { status: "failed", error: classifyPointsError(err) };
    }
  });

/**
 * `defi_list_positions` — open positions for the connected wallet.
 *
 * Returns `[]` when the wallet has no positions yet (the backend treats
 * "no UserStrategy row" as "no positions" — never a 404).
 *
 * The backend row is authoritative for *metadata* (slug, asset, opened_at,
 * goal, target_date, amount_at_deposit). For *live state* we read the
 * position on-chain via the protocol adapter (`services/defi/positions/reader.ts`)
 * — aTokens / vault shares / etc. are the source of truth for what the
 * position is worth right now, including accrued interest. The backend
 * `currentAmount*` fields are ignored when the on-chain read succeeds;
 * we fall back to the DB value (or `amountAtDeposit`) only when the
 * adapter can't resolve (unsupported chain, missing asset hint, RPC error).
 */
export const listPositions: MobileToolExecutor = (_input, context) =>
  safeExecute(async () => {
    if (__DEV__) {
      console.warn("[defi/listPositions] ENTER");
    }
    try {
      const raw = await strategiesApi.getPositions();
      const baseRows = (raw ?? []).map(shapePosition);

      const walletAddress = context.wallet.address;
      const enriched = await Promise.all(
        baseRows.map(async (row) => {
          // Closed positions never need a live read — the close tx is
          // the terminal state, and reading would just return 0 (or
          // dust) which is more misleading than the historical exit
          // value already on the row.
          if (row.status === "closed") return row;
          try {
            const live = await readPosition({
              protocolSlug: row.protocol_slug ?? "",
              chainId: row.chain_id,
              walletAddress,
              assetSymbol: row.asset_symbol,
              assetContract: row.asset_contract ?? undefined,
            });
            if (live) {
              return {
                ...row,
                current_amount_raw: live.currentAmount.toString(),
              };
            }
          } catch (readErr) {
            if (__DEV__) {
              console.warn(
                "[defi/listPositions] on-chain read failed (falling back to DB)",
                {
                  id: row.id,
                  protocolSlug: row.protocol_slug,
                  error: readErr,
                },
              );
            }
          }
          return row;
        }),
      );

      if (__DEV__) {
        console.warn("[defi/listPositions] OK", {
          count: enriched.length,
          ids: enriched.map((p) => p.id),
          slugs: enriched.map((p) => p.protocol_slug),
          onchain_amounts: enriched.map((p) => p.current_amount_raw),
        });
      }
      return {
        status: "success",
        data: sanitizeApiResponse({
          positions: enriched,
          count: enriched.length,
        }),
      };
    } catch (err) {
      if (__DEV__) {
        console.error("[defi/listPositions] failed", { error: err });
      }
      return { status: "failed", error: classifyPointsError(err) };
    }
  });
