/**
 * `mintPaymentIntentTool` — AI tool descriptor the Takumi agent exposes
 * for scan-to-pay hand-offs (spec §8, §8.5).
 *
 * Shape deliberately matches the `ai` SDK's `tool()` contract
 * (inputSchema = Zod) so a future wiring into `useChat` / a server-side
 * tool stream can adopt this spec verbatim — no second source of truth.
 *
 * Three-role separation (memory `feedback_role_separation.md`):
 *   - User → the ask ("pay this QR for 15,000 IDR")
 *   - Server → the thinking (FX quote, treasury resolution, nonce)
 *   - Wallet → the signing, happens on `/pay-merchant?intentId=…`
 *
 * This tool is step 1 (mobile-side request-shaping). It does NOT sign,
 * does NOT return tx hashes, does NOT leak crypto-native strings into
 * chat output — only the opaque `intentId` and a natural-language
 * acknowledgement.
 */

import { z } from "zod";

/** Canonical tool name — matches the `executor: "mobile"` registry slot. */
export const MINT_PAYMENT_INTENT_TOOL_NAME = "mintPaymentIntent";

/**
 * Zod input schema. Kept loose on `merchantQrOrPan` because the
 * scanner upstream can hand us a QRIS payload, a TakumiPay JWS, or a
 * bare PAN — the server-side classifier is the source of truth. The
 * mobile does NOT parse TLV / validate CRC here; we forward bytes.
 */
export const mintPaymentIntentInputSchema = z.object({
  merchantQrOrPan: z
    .string()
    .min(1, "merchantQrOrPan is required")
    .describe(
      "Raw scanned QR payload, TakumiPay JWS, or merchant PAN. Forwarded " +
        "verbatim to the backend classifier — do not pre-parse on the client.",
    ),
  amountIdr: z
    .number()
    .int()
    .positive()
    .describe(
      "Amount in IDR minor units (rupiah). 15000 = Rp 15,000. Required " +
        "even for static QRs so the agent's approval prompt is deterministic.",
    ),
});

export type MintPaymentIntentInput = z.infer<
  typeof mintPaymentIntentInputSchema
>;

/**
 * Tool output returned to the agent. Kept intentionally compact — no
 * tx hashes, no signatures, no addresses. The hand-off is to the wallet
 * via `router.push("/pay-merchant?intentId=…")`; the agent's job is
 * done once the intent exists.
 */
export interface MintPaymentIntentOutput {
  intentId: string;
  reused: boolean;
  handoff: {
    route: "/pay-merchant";
    param: "intentId";
  };
}

/**
 * Tool descriptor — the object a chat harness would register. The
 * `execute` binding is provided at runtime by `useMintPaymentIntentTool`
 * because it needs the React hook's mutation + router + idempotency
 * cache. This file only declares the schema + metadata so tests and
 * server-side registries can import without pulling React.
 */
export const mintPaymentIntentToolSpec = {
  name: MINT_PAYMENT_INTENT_TOOL_NAME,
  description:
    "Create a pending payment intent from a scanned merchant QR/PAN and an " +
    "IDR amount. Hands off to the wallet for signing. Returns only the " +
    "opaque intent id — never a transaction hash or signature.",
  inputSchema: mintPaymentIntentInputSchema,
} as const;

/**
 * Short natural-language acknowledgement the agent can speak after the
 * wallet reports a successful pay. Deliberately free of crypto-native
 * nouns ("tx hash", "signature", "onchain") per the task rule.
 */
export function paidAcknowledgement(intentId: string): string {
  // Intent id is opaque — safe to echo. We trim to 12 chars for chat
  // readability; the full id stays in TanStack cache for debugging.
  const shortId = intentId.length > 12 ? `${intentId.slice(0, 12)}…` : intentId;
  return `Payment ${shortId} confirmed. The merchant has been notified.`;
}
