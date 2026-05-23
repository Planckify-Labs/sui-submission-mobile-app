import BalancesCard from "./cards/BalancesCard";
import OpportunityListCard from "./cards/OpportunityListCard";
import PendingTxCard from "./cards/PendingTxCard";
import PositionListCard from "./cards/PositionListCard";
import RebalancePreviewCard from "./cards/RebalancePreviewCard";
import RedemptionCatalogCard from "./cards/RedemptionCatalogCard";
import SolanaPendingTxCard from "./cards/SolanaPendingTxCard";
import SpendingApprovalCard from "./cards/SpendingApprovalCard";
import SuiPendingTxCard from "./cards/SuiPendingTxCard";
import SwapQuoteCard from "./cards/SwapQuoteCard";
import type { ToolComponent } from "./types";

/**
 * Tool names whose results render through `BalancesCard`. Exported so
 * `MessageContent` can dedupe back-to-back balance reads in the same
 * assistant turn — the LLM will sometimes call both a list-balances
 * tool and a single-native-balance tool to "double-check" itself, and
 * since both now feed the same card, the user sees two identical
 * cards. Dedupe is content-addressed (see `MessageContent.tsx`), not
 * tool-name based, so legitimately distinct calls (different chain,
 * different address) still render separately.
 */
export const BALANCE_TOOL_NAMES = new Set([
  "get_wallet_tokens",
  "get_wallet_spl_tokens",
  "get_wallet_sui_coins",
  "get_balance",
  "get_wallet_balance",
  "get_sol_balance",
  "get_wallet_sol_balance",
  "get_sui_balance",
  "get_wallet_sui_balance",
]);

// biome-ignore lint/suspicious/noExplicitAny: registry is intentionally open-typed
export const toolComponents: Record<string, ToolComponent<any, any>> = {
  send_native_token: PendingTxCard,
  transfer_erc20: PendingTxCard,
  write_contract: PendingTxCard,
  approve_spending: SpendingApprovalCard,
  approveSpending: SpendingApprovalCard,
  swap_quote: SwapQuoteCard,
  // Single card for every namespace's balance read — list-tokens AND
  // single-native-balance lookups. New per-namespace executors plug in
  // by emitting `WalletBalancesPayload` and being added to this map —
  // no UI work needed.
  get_wallet_tokens: BalancesCard,
  get_wallet_spl_tokens: BalancesCard,
  get_wallet_sui_coins: BalancesCard,
  get_balance: BalancesCard,
  get_wallet_balance: BalancesCard,
  get_sol_balance: BalancesCard,
  get_wallet_sol_balance: BalancesCard,
  get_sui_balance: BalancesCard,
  get_wallet_sui_balance: BalancesCard,
  get_redemption_catalog: RedemptionCatalogCard,
  search_redemption_catalog: RedemptionCatalogCard,
  send_sol: SolanaPendingTxCard,
  send_spl_token: SolanaPendingTxCard,
  send_sui: SuiPendingTxCard,
  send_sui_coin: SuiPendingTxCard,
  defi_list_opportunities: OpportunityListCard,
  defi_list_positions: PositionListCard,
  defi_deposit: PendingTxCard,
  defi_withdraw: PendingTxCard,
  defi_claim: PendingTxCard,
  defi_rebalance: RebalancePreviewCard,
};
