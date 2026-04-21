/**
 * `services/nanopay/types.ts` — mobile-side mirrors of the backend contract
 * for Circle Nanopayments Path B (spec §6.2, milestone M2).
 *
 * These are the ONLY shapes this module accepts or emits. The rule (memory
 * `feedback_role_separation.md`) is load-bearing: the server pre-shapes
 * every field the wallet signs — this module reshapes what the server
 * sent and nothing else. It never *invents* authorization fields.
 *
 * Namespace discipline (memory `feedback_chain_extension_discipline.md`):
 * M2 ships EVM-only via the `evm_eip3009` discriminator. A future Solana
 * variant (M6 task 42) gets its own `services/nanopay/svm/*` and a switch
 * at the call site (task 18) — not an `if (namespace === "X")` branch in
 * this module.
 */

import type { SignTransferWithAuthorizationArgs } from "../walletKit/types.ts";

/** Minor-unit fiat amount (e.g. IDR 15,000 → 1_500_000 since IDR is 2dp). */
export type Currency = "IDR" | "PHP" | "THB" | "MYR" | "VND";

export type PaymentIntentStatus =
  | "pending"
  | "submitting"
  | "settling"
  | "paid"
  | "paid_out"
  | "failed"
  | "expired";

/** Polling stops once status hits one of these — the intent is terminal. */
export const TERMINAL_INTENT_STATUSES: ReadonlyArray<PaymentIntentStatus> = [
  "paid",
  "paid_out",
  "failed",
  "expired",
];

export function isTerminalIntentStatus(
  status: PaymentIntentStatus | undefined,
): boolean {
  return !!status && TERMINAL_INTENT_STATUSES.includes(status);
}

/**
 * Input to `POST /v1/pay/intents`.
 *
 * `merchantId` is set when the QR scan resolved client-side (our own
 * TakumiPay JWS); `scannedPayload` carries the raw EMVCo/QRIS bytes so
 * the backend can parse + resolve the merchant itself when we didn't.
 * At least one MUST be provided — enforced server-side.
 */
export interface CreateIntentRequest {
  merchantId?: string;
  scannedPayload?: string;
  /** Amount in minor units (null for open-amount QRs — user types it in `/pay-merchant`). */
  fiatAmountMinor?: number;
  currency: Currency;
}

/**
 * EIP-712 message fields the wallet signs. Mirrors the shape
 * `WalletKitAdapter.signTransferWithAuthorization` consumes — the server
 * generates every field (including the 32-byte random `nonce` and the
 * Gateway `domain`), the wallet just signs.
 */
export interface NanopayPayload {
  /** USDC asset address embedded in the EIP-712 `TransferWithAuthorization` struct. */
  usdc: `0x${string}`;
  /** Source chain carrying the USDC balance the payer will debit. */
  sourceChainId: number;
  /**
   * EIP-712 domain. `verifyingContract` is Circle's `GatewayWallet`
   * contract (NOT the USDC contract — signing against USDC's domain
   * passes verify but fails settle). Pulled by the backend from
   * `GET /gateway/v1/x402/supported` at boot.
   */
  domain: {
    name: string;
    version: string;
    verifyingContract: `0x${string}`;
  };
  from: `0x${string}`;
  /** `= PLATFORM_TREASURY_ADDRESS_EVM`. Merchants are resolved off-chain. */
  to: `0x${string}`;
  /** 6-decimal USDC units, encoded as a decimal string to preserve bigint precision over JSON. */
  value: string;
  validAfter: number;
  /**
   * Unix seconds. Circle requires `≥ now + 3 days` — shorter windows
   * fail settle with `authorization_validity_too_short`. The build step
   * enforces this guard before the wallet is touched.
   */
  validBefore: number;
  /** 32-byte random, server-generated per intent. */
  nonce: `0x${string}`;
}

/**
 * Response shape of both `POST /v1/pay/intents` and
 * `GET /v1/pay/intents/:id`. Polling uses the same shape — `status`
 * drives UI state, `nanopay` is `null` once the payload has been
 * consumed (post-settle).
 */
export interface PaymentIntentResponse {
  id: string;
  status: PaymentIntentStatus;
  /** 6-decimal USDC atomic units, decimal string to keep bigint semantics over JSON. */
  usdcAmountMicros: string;
  /** Source chain the payer debits from. */
  usdcSourceChainId: number;
  /** Gateway batched-wallet contract address on `usdcSourceChainId`. */
  usdcTreasuryAddress: `0x${string}`;
  /** Wire payload the wallet must sign. `null` once consumed. */
  nanopay: NanopayPayload | null;
  /** Unix ms — quote freeze (60s typically). */
  expiresAt: number;
}

/** Body of `POST /v1/pay/intents/:id/nanopay`. */
export interface SubmitNanopayRequest {
  signature: `0x${string}`;
  /** Split-signature fields — optional; server derives these from `signature` when omitted. */
  v?: number;
  r?: `0x${string}`;
  s?: `0x${string}`;
}

export interface SubmitNanopayResponse {
  id: string;
  status: PaymentIntentStatus;
}

/** Exactly the shape `signTransferWithAuthorization` (task 15) consumes. */
export type NanopaySignArgs = SignTransferWithAuthorizationArgs;
