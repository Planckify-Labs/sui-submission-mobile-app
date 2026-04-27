/**
 * Mobile agent tool executor registry.
 *
 * This is the mobile-side counterpart to the server's `TOOL_REGISTRY`
 * (see `takumi-agent-api/src/tools/registry.ts`). The SSE dispatcher
 * from task 09 imports `EXECUTORS` and looks up the right function by
 * the `name` field on each `tool_pending` payload.
 *
 * Every entry here MUST correspond to a tool with `executor: "mobile"`
 * in the server registry. If the server adds a new mobile tool, add a
 * matching entry here — the unit test below (see
 * `__tests__/registryParity.ts` once a test runner exists) will be
 * the gate that catches drift.
 *
 * Tool names enumerated from
 *   takumi-agent-api/src/tools/registry.ts @ 2026-04-12
 * (29 tools total — if you add more on the server, grep for
 * `executor: 'mobile'` there and update both sides together).
 */

export * from "./chainRouter";
export * from "./types";

import { ADDRESS_BOOK_EXECUTORS } from "./addressBook";
import { POINTS_EXECUTORS } from "./points";
import { READ_EXECUTORS } from "./reads";
import { SIMULATE_EXECUTORS } from "./simulate";
import { SOLANA_EXECUTORS } from "./solana";
import { SOLANA_TAKUMI_PAY_EXECUTORS } from "./solanaTakumiPay";
import type { MobileToolExecutor } from "./types";
import { WRITE_EXECUTORS } from "./writes";

/**
 * The registry itself. Keys are the canonical tool names the server
 * emits via `tool_pending.name`. Task 09's SSE dispatcher does:
 *
 *     const executor = EXECUTORS[payload.name];
 *     if (!executor) return rejectTool(payload, "unknown_tool");
 *     const result = await executor(payload.input, context);
 *
 * Do NOT introduce fuzzy matching — unknown tools should fail loudly
 * so we notice new server additions immediately.
 */
export const EXECUTORS: Record<string, MobileToolExecutor> = {
  ...READ_EXECUTORS,
  ...SIMULATE_EXECUTORS,
  ...WRITE_EXECUTORS,
  ...POINTS_EXECUTORS,
  ...ADDRESS_BOOK_EXECUTORS,
  ...SOLANA_EXECUTORS,
  ...SOLANA_TAKUMI_PAY_EXECUTORS,
};

/**
 * Expected mobile tool list — hardcoded because the server lives in a
 * sibling package that we don't import from directly at build time.
 * Kept in sync by visual review against
 *   takumi-agent-api/src/tools/registry.ts
 *
 * If you edit this list, also update the server registry and the
 * block comment at the top of this file.
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
  // points simulate — SIWE login flow (task 17)
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
];

/**
 * Runtime assertion helper used by the app bootstrap in task 09 — call
 * once at startup so registry drift crashes loudly rather than
 * silently dropping tool calls.
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
}
