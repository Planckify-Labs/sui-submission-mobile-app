/**
 * `recordTransferHistory` — best-effort backend recording of a
 * completed transfer/payment so the activity tab picks it up.
 *
 * Mirrors `app/send.tsx`'s history hook + the EVM recording paths in
 * `wallet/writes.ts`. Failure NEVER fails the executor — the tx is
 * already on chain, the user-facing card still works, we just log a
 * warn in dev. Raw errors never bubble to the user (CLAUDE.md).
 */

// NOTE: `tokenApi` / `transactionApi` are imported dynamically so the
// helper's static import graph stays free of RN-only modules — the
// Vitest harness for `wallet/sui` can otherwise choke on the
// `react-native` Flow source pulled in transitively via `ky`. The
// dynamic import lands lazily at the first call, which always happens
// inside a real RN runtime where the modules resolve cleanly.
import type { TBlockchain } from "@/api/types/blockchain";
import type {
  TCreateTransactionRequest,
  TTransactionType,
} from "@/api/types/transaction";

export type RecordTransferArgs = {
  blockchains: TBlockchain[];
  /** "solana" | "sui" | EVM chain_id picker. */
  namespace: "solana" | "sui" | "eip155";
  /**
   * For EVM: the numeric chain id.
   * For Solana / Sui: the chain slug (e.g. `solana-devnet`) — when
   * omitted the helper falls back to the first blockchain in the list
   * for that namespace.
   */
  chainId?: number;
  chainSlug?: string | null;
  /**
   * Token identifier. For native transfers leave `contractAddress`
   * undefined — the helper picks the chain's native token.
   */
  contractAddress?: string;
  type: TTransactionType;
  amount: string;
  txHash: string;
  fromAddress: string;
  toAddress: string;
};

function findBlockchain(args: RecordTransferArgs): TBlockchain | undefined {
  const { blockchains, namespace, chainId, chainSlug } = args;
  if (namespace === "eip155") {
    return blockchains.find((b) => b.isEVM && b.chainId === chainId);
  }
  // Solana / Sui — prefer chainSlug match, fall back to first matching
  // non-EVM row by namespace prefix.
  if (chainSlug) {
    const exact = blockchains.find((b) => b.chainSlug === chainSlug);
    if (exact) return exact;
  }
  const prefix = `${namespace}-`;
  return blockchains.find(
    (b) => !b.isEVM && (b.chainSlug ?? "").startsWith(prefix),
  );
}

export async function recordTransferHistory(
  args: RecordTransferArgs,
): Promise<string | undefined> {
  try {
    const blockchain = findBlockchain(args);
    if (!blockchain) return undefined;

    let tokenId: string | undefined;
    if (args.contractAddress) {
      const { tokenApi } = await import("@/api/endpoints/tokens");
      const tokens = await tokenApi.searchTokens({
        contractAddress: args.contractAddress,
        blockchainId: blockchain.id,
      });
      tokenId = tokens?.[0]?.id;
    } else {
      tokenId = blockchain.tokens?.find((t) => t.isNativeCurrency)?.id;
    }
    if (!tokenId) return undefined;

    const payload: TCreateTransactionRequest = {
      tokenId,
      type: args.type,
      amount: args.amount,
      txHash: args.txHash,
      fromAddress: args.fromAddress,
      toAddress: args.toAddress,
    };
    const { transactionApi } = await import("@/api/endpoints/transactions");
    const record = await transactionApi.createTransaction(payload);

    // Invalidate the React Query cache so the Activity tab refetches —
    // mirrors `useCreateTransaction.onSuccess` in `hooks/queries/useTransactions.ts`.
    // Dynamic-imported to keep this helper free of the RN module graph
    // at static-import time (same reason `transactionApi` is lazy).
    try {
      const [{ queryClient }, { transactionsQueryKeys }] = await Promise.all([
        import("@/app/_layout"),
        import("@/constants/queryKeys/transactionsQueryKeys"),
      ]);
      queryClient.invalidateQueries({
        queryKey: transactionsQueryKeys.all,
        exact: false,
      });
    } catch (invalidateErr) {
      if (__DEV__) {
        console.warn(
          "[recordTransferHistory] cache invalidation failed:",
          invalidateErr,
        );
      }
    }

    return record?.id;
  } catch (err) {
    if (__DEV__) {
      console.warn("[recordTransferHistory] best-effort recording failed:", err);
    }
    return undefined;
  }
}
