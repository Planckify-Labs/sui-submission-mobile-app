import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { strategiesApi } from "@/api/endpoints/strategies";

/**
 * Pre-warms the /strategies screen by prefetching the user strategy,
 * positions, and tier-default opportunities while the user is on a
 * surface that links into strategies (e.g. the Wallets tab).
 *
 * Mirrors `useDepositPrefetch`. Safe offline: prefetchQuery silently
 * fails and the screen falls back to its persisted cache.
 */
export function useStrategiesPrefetch() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const id = requestIdleCallback(() => {
      // User strategy. 404 is "not set up yet" — same null mapping the
      // hook in `hooks/queries/useStrategy.ts` uses, so the screen reads
      // the prefetched value without a re-throw.
      queryClient.prefetchQuery({
        queryKey: ["strategy"],
        queryFn: async () => {
          try {
            return await strategiesApi.getStrategy();
          } catch (err) {
            const status = (err as { response?: { status?: number } } | null)
              ?.response?.status;
            if (status === 404) return null;
            throw err;
          }
        },
      });
      queryClient.prefetchQuery({
        queryKey: ["strategy", "positions"],
        queryFn: strategiesApi.getPositions,
      });
      queryClient.prefetchQuery({
        queryKey: ["strategy", "opportunities", {}],
        queryFn: () => strategiesApi.getOpportunities({}),
      });
    });

    return () => cancelIdleCallback(id);
  }, [queryClient]);
}
