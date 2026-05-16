/**
 * DeFi agent — STUB executors.
 *
 * Spec: docs/multi-agent-architecture-spec.md §7.2, §12.
 *       docs/defi-strategies-spec.md §11 (canonical tool names).
 *
 * v1 ships a stubbed DeFi specialist so the multi-agent topology is
 * exercised end-to-end before the real DeFi backend lands. These
 * executors are PURE — they never issue chain RPCs, never call
 * `walletKitRegistry`, never reach any external API.
 *
 * Hard rules (Task 08):
 *  - No `walletKitRegistry`, no `viem`, no `@solana/kit`, no `fetch`.
 *  - Output shape matches the server schemas in
 *    `agent-api/src/tools/defi/`.
 *  - `status: "stubbed"` strings are SENTINELS — Core paraphrases them
 *    into friendly copy before they reach the user (CLAUDE.md
 *    user-facing-error rule).
 *  - No UI cards registered yet (§12).
 *
 * Flip path: when the real DeFi backend lands per
 * `defi-strategies-spec.md`, replace this file with real executors.
 * Nothing else in the topology needs to change.
 */

import type { MobileToolExecutor, ToolResult } from "../types";

const STUB_MESSAGE = "DeFi agent is not yet wired up.";

const FIXED_OPPORTUNITIES = [
  {
    id: "stub-aave-base-usdc",
    protocol_slug: "aave-v3-base",
    chain_id: 8453,
    asset_symbol: "USDC",
    apy: 0.045,
    risk_tier: "conservative" as const,
  },
  {
    id: "stub-morpho-base-eth",
    protocol_slug: "morpho-base",
    chain_id: 8453,
    asset_symbol: "ETH",
    apy: 0.061,
    risk_tier: "balanced" as const,
  },
  {
    id: "stub-pendle-arb-usdt",
    protocol_slug: "pendle-arb",
    chain_id: 42161,
    asset_symbol: "USDT",
    apy: 0.092,
    risk_tier: "aggressive" as const,
  },
];

const listOpportunities: MobileToolExecutor = async () => ({
  status: "success",
  data: { opportunities: FIXED_OPPORTUNITIES },
});

const listPositions: MobileToolExecutor = async () => ({
  status: "success",
  data: { positions: [] },
});

const buildStubbedWrite = (): ToolResult => ({
  status: "success",
  data: { status: "stubbed", message: STUB_MESSAGE },
});

const deposit: MobileToolExecutor = async () => buildStubbedWrite();
const withdraw: MobileToolExecutor = async () => buildStubbedWrite();
const rebalance: MobileToolExecutor = async () => buildStubbedWrite();

export const DEFI_STUB_EXECUTORS: Record<string, MobileToolExecutor> = {
  defi_list_opportunities: listOpportunities,
  defi_list_positions: listPositions,
  defi_deposit: deposit,
  defi_withdraw: withdraw,
  defi_rebalance: rebalance,
};
