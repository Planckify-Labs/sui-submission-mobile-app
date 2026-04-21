/**
 * `services/nanopay/submit.ts` — thin proxy-call that POSTs the signed
 * EIP-3009 authorization to `takumipay-api` (spec §5.5, §6.2, M2).
 *
 * Rules:
 *   - Always targets OUR proxy (`${EXPO_PUBLIC_API_URL}/v1/pay/intents/:id/nanopay`).
 *     Never posts to Circle Gateway directly — auditability + keystore
 *     hygiene + uniform Xendit payout handler fire off one server-side
 *     event stream (spec §5.5).
 *   - Wallet never blind-broadcasts; this module is the only code path
 *     that takes a finished signature to the wire (memory
 *     `feedback_role_separation.md`).
 *   - Backend endpoint may 404 during M2 rollout (task 24 backend PR
 *     lands alongside). Report a typed `NanopaySubmitError` so the UI
 *     can render "not yet available" instead of a generic error.
 *   - Never log `signature`, `r`, `s`, `v`, or `nonce` — crypto-
 *     sensitive. `redactForLog` produces a lossy debug shape.
 */

import { HTTPError } from "ky";
import { api } from "@/constants/configs/ky";
import type { SubmitNanopayRequest, SubmitNanopayResponse } from "./types";

/**
 * Typed error for any non-2xx from the submit proxy. The catch block on
 * the payment screen matches by `name` (not message) so locale-aware
 * copy stays in one place.
 */
export class NanopaySubmitError extends Error {
  readonly name = "NanopaySubmitError";
  readonly status: number | null;
  readonly intentId: string;
  constructor(args: {
    intentId: string;
    status: number | null;
    message: string;
  }) {
    super(args.message);
    this.intentId = args.intentId;
    this.status = args.status;
  }
}

export interface SubmitNanopayAuthorizationArgs {
  intentId: string;
  signature: `0x${string}`;
  v?: number;
  r?: `0x${string}`;
  s?: `0x${string}`;
}

export interface SubmitResult {
  intentId: string;
  response: SubmitNanopayResponse;
}

/** Never log this shape's members as-is; hashes / signatures / nonces are redacted. */
export function redactForLog(
  args: Partial<SubmitNanopayAuthorizationArgs>,
): Record<string, unknown> {
  const clip = (hex: string | undefined) =>
    typeof hex === "string" && hex.length > 10
      ? `${hex.slice(0, 6)}…(${hex.length - 6}ch)`
      : hex === undefined
        ? undefined
        : "<redacted>";
  return {
    intentId: args.intentId,
    signature: clip(args.signature),
    r: clip(args.r),
    s: clip(args.s),
    v: typeof args.v === "number" ? "<redacted>" : undefined,
  };
}

/**
 * POSTs the signed EIP-3009 authorization to the proxy. Resolves with
 * the backend's `SubmitNanopayResponse` (status advances to
 * `submitting` → `settling` → `paid` on success, or `failed`).
 *
 * Rejects with `NanopaySubmitError` on any non-2xx. Lets other errors
 * (network off, auth revoked) bubble so callers can distinguish a
 * transport failure from a semantic one.
 */
export async function submitNanopayAuthorization(
  args: SubmitNanopayAuthorizationArgs,
): Promise<SubmitResult> {
  const { intentId, ...split } = args;
  if (!intentId) {
    throw new NanopaySubmitError({
      intentId,
      status: null,
      message: "submitNanopayAuthorization: intentId is required",
    });
  }

  const body: SubmitNanopayRequest = {
    signature: split.signature,
    ...(split.v !== undefined ? { v: split.v } : {}),
    ...(split.r !== undefined ? { r: split.r } : {}),
    ...(split.s !== undefined ? { s: split.s } : {}),
  };

  try {
    const response = await api
      .post(`v1/pay/intents/${encodeURIComponent(intentId)}/nanopay`, {
        json: body,
      })
      .json<SubmitNanopayResponse>();
    return { intentId, response };
  } catch (err) {
    if (err instanceof HTTPError) {
      const status = err.response.status;
      // Backend may 404 during M2 rollout — keep the error typed so the
      // caller can render a "coming soon" banner instead of a crash.
      const msg =
        status === 404
          ? `Nanopay submit endpoint not available yet (intent ${intentId}).`
          : `Nanopay submit failed with status ${status} for intent ${intentId}.`;
      throw new NanopaySubmitError({ intentId, status, message: msg });
    }
    throw err;
  }
}
