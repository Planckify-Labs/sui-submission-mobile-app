/**
 * `services/nanopay/useGatewayDeposit.ts` — TanStack Query bindings for
 * the M4 Gateway-deposit orchestrator (spec §5.4, §6.2 deposit-receipt,
 * §6.3 status polling).
 *
 * Two hooks:
 *   - `useDepositForPaymaster()` — mutation wrapping
 *     `depositAndRecordReceipt`. Invalidates the intent query on
 *     success so the next `useIntentStatus` / `useDepositStatus` poll
 *     picks up the flipped `gasless.requiresDeposit: false` flag.
 *   - `useDepositStatus(intentId)` — polls the intent until
 *     `gasless.requiresDeposit === false`. Driven off the canonical
 *     intent-status shape (memory `feedback_filter_at_source.md`: read
 *     the canonical field, don't invent a derived one). Returns the
 *     full intent so the onboarding screen can display the ledger
 *     balance once `CONFIRMED`.
 *
 * Shares the `intentQueryKey` tuple from `./useIntentStatus.ts` so all
 * intent-bound mutations converge on one cache slot — one poll, one
 * invalidation surface.
 */

import {
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "@/constants/configs/ky";
import {
  type DepositAndRecordReceiptArgs,
  type DepositAndRecordReceiptResult,
  type DepositReceiptResponse,
  depositAndRecordReceipt,
  depositReceiptEndpoint,
  type PostDepositReceipt,
} from "./gatewayDeposit";
import { intentQueryKey } from "./useIntentStatus";

/**
 * Production HTTP poster for `/v1/pay/intents/:id/deposit-receipt`.
 * Threaded into `depositAndRecordReceipt` via
 * `useDepositForPaymaster` so the pure module (`gatewayDeposit.ts`)
 * never imports `@/constants/configs/ky` — that keeps the Node test
 * harness from having to load expo-router / expo-secure-store.
 */
export const postDepositReceipt: PostDepositReceipt = async ({
  intentId,
  body,
}) =>
  api
    .post(depositReceiptEndpoint(intentId), { json: body })
    .json<DepositReceiptResponse>();

/**
 * Subset of the intent shape this hook needs. Spec §6.2 calls the
 * block `gasless` with `requiresDeposit: boolean` — we read only that
 * field so the hook stays tolerant to backend additions.
 */
interface IntentWithGaslessBlock {
  id: string;
  gasless?: {
    requiresDeposit: boolean;
  };
}

async function fetchIntentWithGasless(
  intentId: string,
): Promise<IntentWithGaslessBlock> {
  return api
    .get(`v1/pay/intents/${encodeURIComponent(intentId)}`)
    .json<IntentWithGaslessBlock>();
}

/**
 * Mutation wrapper. Caller passes the full arg bag
 * `DepositAndRecordReceiptArgs` (wallet + chain + payer + usdc amount +
 * intentId + adapter). On success invalidates the per-intent query so
 * any active `useDepositStatus(intentId)` re-fetches immediately.
 */
export function useDepositForPaymaster(): UseMutationResult<
  DepositAndRecordReceiptResult,
  Error,
  DepositAndRecordReceiptArgs
> {
  const queryClient = useQueryClient();
  return useMutation<
    DepositAndRecordReceiptResult,
    Error,
    DepositAndRecordReceiptArgs
  >({
    mutationFn: (args) =>
      depositAndRecordReceipt({
        ...args,
        // Default the HTTP poster so the screen-side call site doesn't
        // have to pass it on every invocation. Callers (tests, custom
        // transports) can still override by supplying `postReceipt`
        // on the mutation args.
        postReceipt: args.postReceipt ?? postDepositReceipt,
      }),
    onSuccess: (_result, args) => {
      queryClient.invalidateQueries({
        queryKey: intentQueryKey(args.intentId),
      });
    },
  });
}

/**
 * Polls `GET /v1/pay/intents/:id` until `gasless.requiresDeposit ===
 * false`. While the deposit is still pending Circle attestation (task
 * 38 status machine), re-fetches every 3 s — matches the cadence
 * `useIntentStatus` uses for Nanopay attestation polling (§6.3).
 *
 * Returns the full intent slice so the onboarding screen can display
 * "Finalizing your setup…" (§9.1 `DEPOSIT_PENDING_ATTESTATION`) while
 * the row is `PENDING_ATTESTATION` and advance to the scanner once the
 * flag flips.
 */
export function useDepositStatus(
  intentId: string | undefined,
): UseQueryResult<IntentWithGaslessBlock> {
  return useQuery<IntentWithGaslessBlock>({
    queryKey: intentQueryKey(intentId),
    queryFn: () => {
      if (!intentId) {
        throw new Error("useDepositStatus: intentId is required");
      }
      return fetchIntentWithGasless(intentId);
    },
    enabled: !!intentId,
    staleTime: 5_000,
    refetchInterval: (query) => {
      const data = query.state.data as IntentWithGaslessBlock | undefined;
      if (data?.gasless && data.gasless.requiresDeposit === false) {
        return false;
      }
      return 3_000;
    },
    refetchIntervalInBackground: false,
  });
}
