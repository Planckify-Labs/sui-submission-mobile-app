/**
 * `services/nanopay/buildAuthorization.ts` — pure adapter: reshapes the
 * backend's `PaymentIntent.nanopay` block into the argument shape
 * `WalletKitAdapter.signTransferWithAuthorization` consumes (task 15).
 *
 * Rules (spec §5.5, memory `feedback_role_separation.md`):
 *   - PURE. No `Date.now()` drift, no env reads, no I/O. Temporal fields
 *     come straight from `intent.nanopay.validAfter / validBefore`.
 *   - The wallet only signs payloads the server pre-shaped. This module
 *     reshapes — it NEVER invents a `nonce`, `domain`, or `value`.
 *   - Namespace discipline (memory `feedback_chain_extension_discipline.md`):
 *     no `if (namespace === "X")` branches here. EIP-3009 is EVM-only;
 *     a future SVM variant lives in `services/nanopay/svm/*` with a
 *     switch at the call site (task 18). The caller's `chain` MUST be
 *     the EVM namespace — we guard and throw otherwise.
 *
 * The `validBefore` window guard is owned by the signer (task 15
 * `assertValidBeforeWindow`) so a single source of truth catches both
 * "server gave us a stale payload" and "payload decayed in transit"
 * cases at the moment of signing. We run it here as well as a pre-flight
 * fail-fast — the wallet keystore must not be unlocked for a payload we
 * already know will be rejected.
 */

import type { ChainConfig } from "../../constants/configs/chainConfig.ts";
import type { TWallet } from "../../constants/types/walletTypes.ts";
import { assertValidBeforeWindow } from "../walletKit/evm/signTransferWithAuthorization.ts";
import type { SignTransferWithAuthorizationArgs } from "../walletKit/types.ts";
import type { NanopayPayload, PaymentIntentResponse } from "./types.ts";

/** Typed error for "server didn't send a nanopay block on this intent". */
export class MissingNanopayPayloadError extends Error {
  readonly name = "MissingNanopayPayloadError";
  constructor(intentId: string) {
    super(
      `PaymentIntent ${intentId} has no \`nanopay\` block — cannot build EIP-3009 authorization.`,
    );
  }
}

/** Server sent a `nanopay` block missing required EIP-712 domain data. */
export class MissingNanopayDomainError extends Error {
  readonly name = "MissingNanopayDomainError";
  constructor(
    intentId: string,
    field: "name" | "version" | "verifyingContract",
  ) {
    super(
      `PaymentIntent ${intentId}: nanopay.domain.${field} is missing. ` +
        `Backend must populate all three domain fields from /gateway/v1/x402/supported.`,
    );
  }
}

/** Caller-supplied `chain.chain.id` doesn't match `intent.nanopay.sourceChainId`. */
export class SourceChainMismatchError extends Error {
  readonly name = "SourceChainMismatchError";
  readonly expectedChainId: number;
  readonly actualChainId: number;
  constructor(args: { expectedChainId: number; actualChainId: number }) {
    super(
      `Source chain mismatch: intent.nanopay.sourceChainId=${args.expectedChainId} but caller passed chain.id=${args.actualChainId}.`,
    );
    this.expectedChainId = args.expectedChainId;
    this.actualChainId = args.actualChainId;
  }
}

export interface BuildAuthorizationContext {
  wallet: TWallet;
  chain: ChainConfig;
}

/**
 * Pure shaper: `(PaymentIntentResponse, { wallet, chain }) → SignArgs`.
 *
 * The wallet + chain live on the caller — this module stays free of
 * wallet-state imports so it is trivially unit-testable and the type
 * surface makes the three-role separation explicit (server provides
 * data, caller provides identity, this module provides shape).
 */
export function buildAuthorizationFromIntent(
  intent: PaymentIntentResponse,
  ctx: BuildAuthorizationContext,
): SignTransferWithAuthorizationArgs {
  const payload = intent.nanopay;
  if (!payload) {
    throw new MissingNanopayPayloadError(intent.id);
  }
  assertNanopayDomainPresent(intent.id, payload);

  if (ctx.chain.namespace !== "eip155") {
    throw new Error(
      `buildAuthorizationFromIntent: expected eip155 chain, got namespace=${ctx.chain.namespace}`,
    );
  }
  const callerChainId = ctx.chain.chain.id;
  if (callerChainId !== payload.sourceChainId) {
    throw new SourceChainMismatchError({
      expectedChainId: payload.sourceChainId,
      actualChainId: callerChainId,
    });
  }

  // Fail-fast on `validBefore < now + 3 days`. Mirrors the guard inside
  // the signer so the wallet keystore is not touched for payloads we
  // already know will fail settle.
  assertValidBeforeWindow(payload.validBefore);

  return {
    wallet: ctx.wallet,
    chain: ctx.chain,
    gatewayWallet: payload.domain.verifyingContract,
    domainName: payload.domain.name,
    domainVersion: payload.domain.version,
    usdc: payload.usdc,
    from: payload.from,
    to: payload.to,
    valueMicros: BigInt(payload.value),
    validAfter: payload.validAfter,
    validBefore: payload.validBefore,
    nonce: payload.nonce,
  };
}

function assertNanopayDomainPresent(
  intentId: string,
  payload: NanopayPayload,
): void {
  const domain = payload.domain as
    | Partial<NanopayPayload["domain"]>
    | undefined;
  if (!domain) {
    throw new MissingNanopayDomainError(intentId, "verifyingContract");
  }
  if (!domain.name) throw new MissingNanopayDomainError(intentId, "name");
  if (!domain.version) throw new MissingNanopayDomainError(intentId, "version");
  if (!domain.verifyingContract) {
    throw new MissingNanopayDomainError(intentId, "verifyingContract");
  }
}
