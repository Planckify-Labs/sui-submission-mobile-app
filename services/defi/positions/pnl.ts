/**
 * Deposit-value vs current-value math.
 *
 * Spec: docs/defi-strategies-spec.md §6 — `services/defi/positions/pnl.ts`.
 *
 * Caller supplies the raw token amounts (deposit + current) and a USD
 * spot price. We return `{ pnlUsd, pnlPct }` clamped to safe ranges.
 */

import { formatUnits } from "viem";

export interface PnlInput {
  amountAtDepositRaw: bigint;
  amountAtDepositUsd: number;
  currentAmountRaw: bigint;
  /**
   * USD price per 1 unit (decimal-adjusted) of the underlying asset.
   * For a stablecoin pegged to USD this is ~1.0; for ETH it's the spot
   * USD price.
   */
  spotUsdPerUnit: number;
  decimals: number;
}

export interface PnlOutput {
  currentAmountUsd: number;
  pnlUsd: number;
  /** Percent change vs deposit USD value. `0` when deposit USD == 0. */
  pnlPct: number;
}

export function computePnl(input: PnlInput): PnlOutput {
  const humanCurrent = Number(
    formatUnits(input.currentAmountRaw, input.decimals),
  );
  const currentUsd = humanCurrent * input.spotUsdPerUnit;
  const pnlUsd = currentUsd - input.amountAtDepositUsd;
  const pnlPct =
    input.amountAtDepositUsd > 0
      ? (pnlUsd / input.amountAtDepositUsd) * 100
      : 0;
  return {
    currentAmountUsd: round2(currentUsd),
    pnlUsd: round2(pnlUsd),
    pnlPct: round2(pnlPct),
  };
}

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}
