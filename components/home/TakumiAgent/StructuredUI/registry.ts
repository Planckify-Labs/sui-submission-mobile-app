import PendingTxCard from "./cards/PendingTxCard";
import RedemptionCatalogCard from "./cards/RedemptionCatalogCard";
import SolanaPendingTxCard from "./cards/SolanaPendingTxCard";
import SolanaTokensCard from "./cards/SolanaTokensCard";
import SpendingApprovalCard from "./cards/SpendingApprovalCard";
import SwapQuoteCard from "./cards/SwapQuoteCard";
import WalletTokensCard from "./cards/WalletTokensCard";
import type { ToolComponent } from "./types";

// biome-ignore lint/suspicious/noExplicitAny: registry is intentionally open-typed
export const toolComponents: Record<string, ToolComponent<any, any>> = {
  send_native_token: PendingTxCard,
  transfer_erc20: PendingTxCard,
  write_contract: PendingTxCard,
  approve_spending: SpendingApprovalCard,
  approveSpending: SpendingApprovalCard,
  swap_quote: SwapQuoteCard,
  get_wallet_tokens: WalletTokensCard,
  get_wallet_spl_tokens: SolanaTokensCard,
  get_redemption_catalog: RedemptionCatalogCard,
  search_redemption_catalog: RedemptionCatalogCard,
  send_sol: SolanaPendingTxCard,
  send_spl_token: SolanaPendingTxCard,
};
