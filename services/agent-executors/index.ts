/**
 * Mobile agent tool executor registry.
 *
 * This is the mobile-side counterpart to the server's `TOOL_REGISTRY`
 * (see `takumi-agent-api/src/tools/registry.ts`). The SSE dispatcher
 * imports `EXECUTORS` and looks up the right function by the `name`
 * field on each `tool_pending` payload.
 *
 * Every entry here MUST correspond to a tool with `executor: "mobile"`
 * in the server registry. Drift is caught at boot by
 * `assertRegistryParity` (below) and in CI by `pnpm check:agents`
 * (Task 18).
 *
 * Wallet executors live under `./wallet/`; DeFi stub executors under
 * `./defi/`. The flat `EXECUTORS` map is preserved via composition
 * (spec §7.2). Each per-agent bucket is wrapped with
 * `composeAgentExecutors` so a tool dropped into the wrong folder
 * fails loudly at module load.
 */

export * from "./chainRouter";
export * from "./types";

import { AGENT_MANIFEST, resolveAgentForTool } from "./agentManifest";
import {
  AGENT_FOR_EXECUTOR,
  composeAgentExecutors,
} from "./composeAgentExecutors";
import { DEFI_EXECUTORS as DEFI_TOOL_EXECUTORS } from "./defi";
import type { MobileToolExecutor } from "./types";
import {
  ADDRESS_BOOK_EXECUTORS,
  POINTS_EXECUTORS,
  READ_EXECUTORS,
  SIMULATE_EXECUTORS,
  SOLANA_EXECUTORS,
  SOLANA_TAKUMI_PAY_EXECUTORS,
  SUI_EXECUTORS,
  WRITE_EXECUTORS,
} from "./wallet";

const WALLET_EXECUTORS = composeAgentExecutors("wallet", {
  ...READ_EXECUTORS,
  ...SIMULATE_EXECUTORS,
  ...WRITE_EXECUTORS,
  ...POINTS_EXECUTORS,
  ...ADDRESS_BOOK_EXECUTORS,
  ...SOLANA_EXECUTORS,
  ...SOLANA_TAKUMI_PAY_EXECUTORS,
  ...SUI_EXECUTORS,
});

const DEFI_EXECUTORS = composeAgentExecutors("defi", {
  ...DEFI_TOOL_EXECUTORS,
});

/**
 * The registry itself. Keys are the canonical tool names the server
 * emits via `tool_pending.name`.
 *
 *     const executor = EXECUTORS[payload.name];
 *     if (!executor) return rejectTool(payload, "unknown_tool");
 *     const result = await executor(payload.input, context);
 *
 * Do NOT introduce fuzzy matching — unknown tools must fail loudly.
 */
export const EXECUTORS: Record<string, MobileToolExecutor> = {
  ...WALLET_EXECUTORS,
  ...DEFI_EXECUTORS,
};

/**
 * Expected mobile tool list — hardcoded because the server lives in a
 * sibling package that we don't import from directly at build time.
 * Kept in sync by visual review against
 *   takumi-agent-api/src/tools/registry.ts
 * and by the cross-repo `pnpm check:agents` lint (Task 18).
 */
export const EXPECTED_MOBILE_TOOLS: ReadonlyArray<string> = [
  // blockchain reads
  "get_balance",
  "get_wallet_balance",
  "read_contract",
  "get_transaction",
  "get_wallet_address",
  "get_supported_chains",
  "get_wallet_tokens",
  // simulate
  "estimate_gas",
  // blockchain writes
  "send_native_token",
  "transfer_erc20",
  "write_contract",
  "approve_erc20",
  // points reads — public (no JWT)
  "get_redemption_catalog",
  "search_redemption_catalog",
  "get_product_details",
  "get_product_input_fields",
  "get_points_price",
  // points reads — auth required
  "get_redemption_categories",
  "get_points_balance",
  "get_points_history",
  "get_redemption_status",
  "get_redemption_history",
  // points writes
  "deposit_points",
  "execute_redemption",
  // points simulate — SIWE login flow
  "request_authentication",
  // address book reads
  "get_address_book",
  "get_address_book_entry",
  "search_address_book",
  // solana native
  "get_wallet_sol_balance",
  "get_sol_balance",
  "send_sol",
  "get_wallet_spl_tokens",
  "send_spl_token",
  // solana takumipay
  "execute_booking_sol",
  "deposit_points_sol",
  // sui native
  "get_wallet_sui_balance",
  "get_sui_balance",
  "send_sui",
  "get_wallet_sui_coins",
  "send_sui_coin",
  // defi (spec §11 — full canonical set)
  "defi_list_opportunities",
  "defi_list_positions",
  "defi_get_config",
  "defi_simulate_deposit",
  "defi_deposit",
  "defi_withdraw",
  "defi_claim",
  "defi_rebalance",
  "defi_cross_chain_deposit",
  "defi_compound",
];

/**
 * Runtime assertion helper called once at app bootstrap.
 *
 * Two layers of parity:
 *   1. Every name in `EXPECTED_MOBILE_TOOLS` has an entry in
 *      `EXECUTORS` (catches missing executor implementations).
 *   2. The bucket each executor was registered under (`composeAgentExecutors`
 *      writes to `AGENT_FOR_EXECUTOR`) matches the agent the manifest
 *      claims owns its prefix (catches a tool dropped into the wrong
 *      subfolder).
 *
 * Failures throw — registry drift must crash loudly. The orchestrator
 * surfaces friendly copy to users on a boot fault (CLAUDE.md
 * user-facing-error rule).
 */
export function assertRegistryParity(): void {
  for (const name of EXPECTED_MOBILE_TOOLS) {
    if (!(name in EXECUTORS)) {
      throw new Error(
        `[agent-executors] missing executor for tool "${name}" — ` +
          "check services/agent-executors/index.ts",
      );
    }
  }
  for (const [toolName, agentId] of AGENT_FOR_EXECUTOR.entries()) {
    const expected = resolveAgentForTool(toolName, AGENT_MANIFEST);
    if (!expected) {
      throw new Error(
        `[agent-executors] prefix mismatch: tool "${toolName}" registered under "${agentId}" but no agent in the manifest claims its prefix`,
      );
    }
    if (expected !== agentId) {
      throw new Error(
        `[agent-executors] prefix mismatch: tool "${toolName}" registered under "${agentId}" but manifest assigns it to "${expected}"`,
      );
    }
  }
}
