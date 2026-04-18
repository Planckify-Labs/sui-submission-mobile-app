import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { redeemApi } from "@/api/endpoints/redeem";
import type {
  TRedeemExecuteRequest,
  TRedemptionHistoryParams,
} from "@/api/types/redeem";
import { pointsQueryKeys } from "@/constants/queryKeys/pointsQueryKeys";
import { redeemQueryKeys } from "@/constants/queryKeys/redeemQueryKeys";
import { useIsAuthenticated } from "@/hooks/queries/useAuth";

// --- Redemption Detail (full, includes voucherCode) ---
// Per spec: when status=COMPLETED and isVoucher=true but voucherCode is still null,
// the vendor hasn't confirmed yet — retry every 3s, up to 4 times.
export const useRedemptionById = (id: string | null) => {
  return useQuery({
    queryKey: redeemQueryKeys.detail(id ?? ""),
    queryFn: () => redeemApi.getById(id!),
    enabled: !!id,
    staleTime: 30 * 1000,
    retry: 1,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (
        data?.status === "COMPLETED" &&
        data.product.isVoucher &&
        data.voucherCode === null
      ) {
        // Stop after 4 automatic retries to avoid infinite polling
        const fetchCount = query.state.dataUpdateCount ?? 0;
        return fetchCount < 4 ? 3000 : false;
      }
      return false;
    },
  });
};

// --- Execute Redemption ---
export const useExecuteRedemption = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: TRedeemExecuteRequest) => redeemApi.execute(data),
    onSuccess: () => {
      // Invalidate balance since points were deducted
      queryClient.invalidateQueries({ queryKey: pointsQueryKeys.balance() });
      queryClient.invalidateQueries({ queryKey: redeemQueryKeys.history() });
    },
  });
};

// --- Poll Redemption Status ---
export const useRedemptionStatus = (redemptionId: string | null) => {
  return useQuery({
    queryKey: redeemQueryKeys.status(redemptionId ?? ""),
    queryFn: () => redeemApi.getStatus(redemptionId!),
    enabled: !!redemptionId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "COMPLETED" || status === "REFUNDED") return false;
      return 3000; // Poll every 3s while PENDING/PROCESSING/FAILED (retrying)
    },
  });
};

// --- Redemption History (cursor pagination) ---
export const useRedemptionHistory = (
  params?: TRedemptionHistoryParams,
  options?: { enabled?: boolean },
) => {
  const { isAuthenticated, isLoading: isAuthLoading } = useIsAuthenticated();
  return useInfiniteQuery({
    queryKey: redeemQueryKeys.history(params),
    queryFn: ({ pageParam }) =>
      redeemApi.getHistory({ ...params, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? (lastPage.nextCursor ?? undefined) : undefined,
    // Gate on confirmed auth — this endpoint is authenticated and the
    // previous logic (only checking `options?.enabled`) meant the query
    // fired before tokens were available after a wallet switch, the
    // `beforeRequest` ky hook threw "Not authenticated for current
    // wallet", and React Query retried. That retry storm (visible as
    // many "No suitable access token" warnings in Metro on wallet
    // switch) contributed to the post-switch freeze. Same fix as
    // `usePointBalance`.
    enabled:
      options?.enabled !== false &&
      isAuthenticated === true &&
      !isAuthLoading,
    staleTime: 5 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: false,
  });
};
