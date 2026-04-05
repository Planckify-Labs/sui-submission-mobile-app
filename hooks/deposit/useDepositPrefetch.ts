import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { smartContractApi } from "@/api/endpoints/smart-contracts";
import { useWallet } from "@/hooks/useWallet";

/**
 * Pre-warms the deposit screen's JS modules and prefetches its critical queries
 * while the user is on the home screen, so first-time navigation is instant.
 *
 * activeChain now reads from MMKV (synchronous), so chainId is correct on the
 * very first render — no async timing window or guard needed.
 * Safe offline: module require() has no network cost; prefetchQuery silently
 * fails when offline and deposit screen falls back to persisted cache as usual.
 */
export function useDepositPrefetch() {
  const queryClient = useQueryClient();
  const { activeChain } = useWallet();
  const chainId = activeChain.chain.id;

  useEffect(() => {
    const id = requestIdleCallback(() => {
      // 1. Pre-warm JS modules: forces Hermes to parse viem + contract hooks
      //    before the user taps deposit, so the navigation animation isn't blocked.
      require("@/hooks/deposit/useDepositState");
      require("@/contracts/hooks/useTakumiWalletContract");

      // 2. Prefetch the smart contract for the active chain. This query has no
      //    MMKV fallback so it's the most likely to be cold on first visit.
      queryClient.prefetchQuery({
        queryKey: ["smart-contracts", "chain", chainId],
        queryFn: () => smartContractApi.getSmartContractsByChain(chainId),
      });
    });

    return () => cancelIdleCallback(id);
  }, [chainId, queryClient]);
}
