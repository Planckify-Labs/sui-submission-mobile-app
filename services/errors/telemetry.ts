/**
 * `services/errors/telemetry.ts` — fire-and-forget telemetry for the
 * payer error surface. Invoked from `<PaymentError>` on mount so every
 * rendered error emits a funnel event.
 *
 * Spec: `docs/umkm-usdc-payout-spec.md` §9.1 — "every displayed error
 * emits a payment_error_shown event with { code, intentId?, merchantId? }".
 *
 * Rules:
 *   - **Best-effort only.** Never blocks the UI. All failures are
 *     swallowed; callers never await the result in a way that can
 *     surface a user-visible error.
 *   - **Sensitive-field hygiene.** Only the enumerated `PaymentErrorCode`
 *     and the optional `intentId` / `merchantId` (opaque server ids)
 *     are sent. Never include `err.message`, signatures, nonces, or
 *     raw typed-data.
 *   - **Endpoint may 404.** Backend counterpart is a follow-up; when
 *     the route isn't mounted yet a 404 (or any non-2xx / network
 *     failure) is swallowed silently.
 */

import { HTTPError } from "ky";
import { api } from "@/constants/configs/ky";
import type { PaymentErrorCode } from "./paymentErrors";

export interface LogPaymentErrorArgs {
  code: PaymentErrorCode;
  intentId?: string;
  merchantId?: string;
}

/**
 * POSTs `{ code, intentId?, merchantId? }` to
 * `${EXPO_PUBLIC_API_URL}/v1/telemetry/payment-error`. Fire-and-forget:
 * resolves without error regardless of the transport outcome.
 *
 * We intentionally don't log non-2xx responses at info level — the
 * backend route doesn't exist during M2/M3 so every call would spam
 * the console. In `__DEV__` we emit a single `console.debug` for
 * non-404 failures so local-dev issues surface.
 */
export function logPaymentError(args: LogPaymentErrorArgs): void {
  // `void` the promise — callers don't await this and we never want
  // an unhandled-rejection tripping the error boundary.
  void sendPaymentErrorEvent(args);
}

async function sendPaymentErrorEvent(args: LogPaymentErrorArgs): Promise<void> {
  try {
    await api
      .post("v1/telemetry/payment-error", {
        json: {
          code: args.code,
          ...(args.intentId ? { intentId: args.intentId } : {}),
          ...(args.merchantId ? { merchantId: args.merchantId } : {}),
        },
        // Keep the request tiny — no retries, no long timeout. A failed
        // telemetry post must never slow the error card.
        retry: 0,
        timeout: 3000,
      })
      .json<unknown>();
  } catch (err) {
    // 404 is expected while the backend endpoint is unimplemented.
    if (err instanceof HTTPError && err.response.status === 404) return;
    if (__DEV__) {
      // Best-effort debug log — never includes raw error fields that
      // might carry sensitive hex blobs.
      // eslint-disable-next-line no-console
      console.debug("[telemetry] logPaymentError swallowed failure", args.code);
    }
  }
}
