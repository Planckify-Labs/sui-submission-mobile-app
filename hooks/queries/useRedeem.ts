import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { redeemApi } from "@/api/endpoints/redeem";
import type {
  TRedeemExecuteRequest,
  TRedemptionHistoryParams,
} from "@/api/types/redeem";
import { pointsQueryKeys } from "@/constants/queryKeys/pointsQueryKeys";
import { redeemQueryKeys } from "@/constants/queryKeys/redeemQueryKeys";

// --- Redemption Detail (full, includes voucherCode) ---
export const useRedemptionById = (id: string | null) => {
  return useQuery({
    queryKey: redeemQueryKeys.detail(id ?? ""),
    queryFn: () => redeemApi.getById(id!),
    enabled: !!id,
    staleTime: 30 * 1000,
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
  return useInfiniteQuery({
    queryKey: redeemQueryKeys.history(params),
    queryFn: ({ pageParam }) =>
      redeemApi.getHistory({ ...params, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextCursor ?? undefined : undefined,
    enabled: options?.enabled !== false,
  });
};
