/**
 * `useMintPaymentIntentTool` — React hook that binds the AI tool spec
 * from `mintPaymentIntentTool.ts` to:
 *
 *   - `services/nanopay/useMintPaymentIntentWithIdempotency` — owns the
 *     Idempotency-Key cache so a retry of the same ask collapses to
 *     the same `pi_…` id on the server (§8.5 #3).
 *   - `expo-router` — deep-links the user to
 *     `/pay-merchant?intentId=<id>` so the wallet (not the agent) owns
 *     the sign + submit leg (three-role separation).
 *   - `useRQGlobalState("agent:intent-paid")` — the cross-screen
 *     event bus `/pay-merchant/receipt` writes to on the first `paid`
 *     transition; the chat screen subscribes so the agent can
 *     acknowledge in its next reply without the agent signing anything
 *     itself.
 */

import { router } from "expo-router";
import { useCallback } from "react";
import useRQGlobalState from "@/hooks/useRQGlobalState";
import {
  type MintArgs,
  useMintPaymentIntentWithIdempotency,
} from "@/services/nanopay/useMintPaymentIntentWithIdempotency";
import {
  MINT_PAYMENT_INTENT_TOOL_NAME,
  type MintPaymentIntentOutput,
  mintPaymentIntentToolSpec,
} from "./mintPaymentIntentTool";

/**
 * Query key for the cross-screen "intent-paid" signal. Written by
 * `app/pay-merchant/receipt.tsx` on the first `paid | paid_out`
 * transition, read by the chat screen to acknowledge the payment.
 *
 * Session-scoped — `resetIntentPaidEvent` is wired to the agent's
 * "new conversation" path so stale acks don't bleed across chats.
 */
export const INTENT_PAID_EVENT_KEY = ["agent", "intent-paid"] as const;

export interface IntentPaidEvent {
  intentId: string | null;
  /** Wall-clock ms when the first `paid` status was observed. */
  paidAt: number | null;
}

const EMPTY_INTENT_PAID_EVENT: IntentPaidEvent = {
  intentId: null,
  paidAt: null,
};

/**
 * The runtime tool object: spec + `execute`. Shape matches the `ai`
 * SDK's `tool()` so a future wiring into `useChat({ tools })` lands as
 * a single diff at the call site.
 */
export interface MintPaymentIntentToolRuntime {
  name: typeof MINT_PAYMENT_INTENT_TOOL_NAME;
  description: string;
  execute: (input: MintArgs) => Promise<MintPaymentIntentOutput>;
  /** Clears the idempotency cache AND the intent-paid event. */
  reset: () => void;
  /** Last observed intent-paid event — consumed by the chat screen. */
  intentPaidEvent: IntentPaidEvent;
  /** Called after the chat screen speaks the acknowledgement. */
  acknowledgeIntentPaid: () => void;
}

export function useMintPaymentIntentTool(): MintPaymentIntentToolRuntime {
  const { mint, reset: resetIdempotency } =
    useMintPaymentIntentWithIdempotency();
  const { data: intentPaidEventMaybe, setNewData: setIntentPaidEvent } =
    useRQGlobalState<IntentPaidEvent>({
      queryKey: INTENT_PAID_EVENT_KEY,
      initialData: EMPTY_INTENT_PAID_EVENT,
    });
  // `useRQGlobalState` widens `data` to `T | undefined`; narrow here
  // with the same sentinel we seeded so downstream callers don't have
  // to double-null-check.
  const intentPaidEvent: IntentPaidEvent =
    intentPaidEventMaybe ?? EMPTY_INTENT_PAID_EVENT;

  const execute = useCallback(
    async ({
      merchantQrOrPan,
      amountIdr,
    }: MintArgs): Promise<MintPaymentIntentOutput> => {
      const { intentId, reused } = await mint({ merchantQrOrPan, amountIdr });

      // Hand off to the wallet. `router.push` (not `replace`) so the
      // back-stack keeps the agent screen reachable for the follow-up
      // ack turn. The path + param names match §8.5 #1 verbatim.
      router.push({
        // `/pay-merchant` is not in the generated typed-routes union
        // yet — narrow cast matches the pattern in `app/pay-merchant.tsx`.
        pathname: "/pay-merchant" as "/send",
        params: { intentId },
      });

      return {
        intentId,
        reused,
        handoff: { route: "/pay-merchant", param: "intentId" },
      };
    },
    [mint],
  );

  const reset = useCallback(() => {
    resetIdempotency();
    setIntentPaidEvent(EMPTY_INTENT_PAID_EVENT);
  }, [resetIdempotency, setIntentPaidEvent]);

  const acknowledgeIntentPaid = useCallback(() => {
    // Flip paidAt to null but keep intentId for reference — the next
    // mint() resets both via the idempotency cache.
    setIntentPaidEvent({
      intentId: intentPaidEvent.intentId,
      paidAt: null,
    });
  }, [intentPaidEvent.intentId, setIntentPaidEvent]);

  return {
    name: MINT_PAYMENT_INTENT_TOOL_NAME,
    description: mintPaymentIntentToolSpec.description,
    execute,
    reset,
    intentPaidEvent,
    acknowledgeIntentPaid,
  };
}

/**
 * Publisher used by `/pay-merchant/receipt` (or any other screen that
 * observes a terminal `paid` transition) to notify the agent that the
 * user completed the hand-off leg. Kept as a bare function — not a
 * hook — so non-React callers (receipt poller, push-notification
 * handler) can publish without needing a component.
 */
export function publishIntentPaidEvent(
  queryClient: {
    setQueryData: (
      key: readonly unknown[],
      updater: (prev: IntentPaidEvent | undefined) => IntentPaidEvent,
    ) => void;
  },
  intentId: string,
): void {
  queryClient.setQueryData(INTENT_PAID_EVENT_KEY, () => ({
    intentId,
    paidAt: Date.now(),
  }));
}
