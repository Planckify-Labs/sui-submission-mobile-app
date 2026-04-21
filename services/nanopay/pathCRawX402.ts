/**
 * `services/nanopay/pathCRawX402.ts` — Path C orchestration: raw x402
 * against an arbitrary merchant resource (spec §5.3, milestone M5).
 *
 * Path C exists so every x402-speaking resource on the internet is
 * payable from our wallet — not just merchants registered in our
 * backend. The crypto primitive is IDENTICAL to Path B (EIP-3009
 * `TransferWithAuthorization` via `walletKit.signTransferWithAuthorization`);
 * the only thing that changes is the POST destination:
 *
 *   - Path B → `takumipay-api /v1/pay/intents/:id/nanopay`
 *              (our proxy → Circle Gateway settle)
 *   - Path C → the merchant's own URL, with header `X-PAYMENT:
 *              <base64 signed envelope>`; the merchant (or the
 *              facilitator they name in the 402 response) settles.
 *
 * Three-role separation (memory `feedback_role_separation.md`, the
 * load-bearing invariant): the wallet still ONLY signs. The merchant /
 * facilitator is the trusted settlement layer. Our backend is NOT in
 * the loop for Path C — there's no intent id to create, no server-side
 * audit row, nothing to poll. Mobile talks directly to the merchant.
 *
 * Chain-extension discipline (memory `feedback_chain_extension_discipline.md`):
 * this module never switches on chain id. The 402 response's
 * `network` / `paymentRequirements.extra.verifyingContract` fields tell
 * us which chain to sign against; the caller resolves the matching
 * `ChainConfig` from `supportedChains` and hands it in. No
 * `if (chainId === X)` branching anywhere in this file.
 *
 * Nonce discipline: each 402 challenge carries a single-use nonce
 * (EIP-3009 replay protection). We fetch fresh on every call — there
 * is NO caching of challenges in this module.
 *
 * x402 header format: the x402 spec went through several shapes in
 * 2025-2026. We accept the newest (`X-PAYMENT-Requirements` JSON body,
 * Coinbase CDP / a16p style) as the primary path, and fall back to
 * the older `x402-payment-required` header with a compact string
 * payload. If the exact merchant implementation differs, the `parse`
 * step below is the single place to extend — keep this file the only
 * owner of the wire shape.
 */

import type { ChainConfig } from "../../constants/configs/chainConfig.ts";
import type { TWallet } from "../../constants/types/walletTypes.ts";
import { assertValidBeforeWindow } from "../walletKit/evm/signTransferWithAuthorization.ts";
import {
  GATEWAY_VALID_BEFORE_MIN_SECONDS,
  type SignTransferWithAuthorizationArgs,
  type WalletKitAdapter,
} from "../walletKit/types.ts";

/**
 * Parsed 402 challenge the merchant returned. We normalise the two
 * header shapes the x402 spec has shipped (2025 compact string + 2026
 * JSON body) into this single structure so the rest of the module sees
 * one shape regardless of wire format.
 *
 * Field names mirror Circle / Coinbase CDP's x402 spec snapshot (the
 * closest thing to canonical today). If a future spec revision renames
 * fields, extend `parseX402Challenge` — never branch further upstream.
 */
export interface X402Challenge {
  /** e.g. `"exact"` — x402 scheme discriminator. Only `"exact"` is in scope for M5. */
  scheme: "exact";
  /** CAIP-2 style network id (e.g. `"eip155:5042002"` for Arc Testnet). */
  network: string;
  /** 6-decimal USDC atomic units the merchant asks for, as a decimal string (preserve bigint precision over JSON). */
  maxAmountRequired: string;
  /** Merchant's payout address — becomes EIP-3009 `to`. */
  payTo: `0x${string}`;
  /** USDC asset address on `network`. Embedded in the signed struct. */
  asset: `0x${string}`;
  /** Human-readable resource URL the payer is satisfying (echoes the fetched URL). */
  resource: string;
  /** Upper bound for the merchant's server's own timeout when re-posting. Informational on-device. */
  maxTimeoutSeconds?: number;
  /**
   * Facilitator URL NAMED BY THE MERCHANT. Preferred over any per-chain
   * default (spec §5.3). When null, callers fall back to
   * `blockchains.x402_facilitator_url` (§6.7) — never hardcoded.
   */
  facilitator?: string | null;
  /**
   * `extra` carries EIP-712 domain pieces that EIP-3009 signing needs:
   * the Gateway `verifyingContract`, `name`, `version`, and the EIP-712
   * `chainId`. The payer signs against these verbatim (never invents).
   */
  extra: {
    verifyingContract: `0x${string}`;
    name: string;
    version: string;
    chainId: number;
  };
  /** 32-byte random nonce the merchant generated. Single-use. */
  nonce: `0x${string}`;
  /** Unix seconds lower bound for the authorization. Usually 0. */
  validAfter: number;
  /** Unix seconds upper bound. MUST be ≥ now + 3 days for Circle-backed settlement. */
  validBefore: number;
}

/** Typed error shapes so the screen can branch on `err.name`. */

export class X402FetchError extends Error {
  readonly name = "X402FetchError";
  readonly status: number | null;
  constructor(args: { status: number | null; message: string }) {
    super(args.message);
    this.status = args.status;
  }
}

export class X402ChallengeParseError extends Error {
  readonly name = "X402ChallengeParseError";
  constructor(message: string) {
    super(message);
  }
}

export class X402SettlementError extends Error {
  readonly name = "X402SettlementError";
  readonly status: number | null;
  constructor(args: { status: number | null; message: string }) {
    super(args.message);
    this.status = args.status;
  }
}

/**
 * Arguments for `buildPathCAuthorization`. Mirrors task 17's
 * `buildAuthorizationFromIntent({ intent, ctx })` but takes the raw
 * challenge straight from the merchant — there's no server intent in
 * Path C.
 */
export interface BuildPathCAuthorizationArgs {
  wallet: TWallet;
  chain: ChainConfig;
  challenge: X402Challenge;
  /** Original merchant URL the scanner / paste produced. Kept for audit — not signed. */
  resourceUrl: string;
}

/**
 * Pure shaper: `(wallet, chain, challenge) → SignArgs`. Identical
 * output shape to Path B's `buildAuthorizationFromIntent` so the
 * downstream `signTransferWithAuthorization` adapter is called with
 * no Path-awareness whatsoever (memory `feedback_role_separation.md`).
 */
export function buildPathCAuthorization(
  args: BuildPathCAuthorizationArgs,
): SignTransferWithAuthorizationArgs {
  const { wallet, chain, challenge } = args;
  if (chain.namespace !== "eip155") {
    throw new Error(
      `buildPathCAuthorization: expected eip155 chain, got namespace=${chain.namespace}`,
    );
  }
  if (chain.chain.id !== challenge.extra.chainId) {
    throw new Error(
      `buildPathCAuthorization: caller chain.id=${chain.chain.id} does not match challenge chainId=${challenge.extra.chainId}`,
    );
  }

  // Fail-fast on the 3-day validity window — same pre-flight guard as
  // Path B (task 17). Avoids touching the keystore for a payload we
  // already know the facilitator will reject.
  assertValidBeforeWindow(challenge.validBefore);

  return {
    wallet,
    chain,
    gatewayWallet: challenge.extra.verifyingContract,
    domainName: challenge.extra.name,
    domainVersion: challenge.extra.version,
    usdc: challenge.asset,
    from: resolveEvmAddress(wallet),
    to: challenge.payTo,
    valueMicros: BigInt(challenge.maxAmountRequired),
    validAfter: challenge.validAfter,
    validBefore: challenge.validBefore,
    nonce: challenge.nonce,
  };
}

/** `TWallet` is a loose shape (`services/walletService`); narrow to the EVM hex here. */
function resolveEvmAddress(wallet: TWallet): `0x${string}` {
  const address = (wallet as unknown as { address?: string }).address;
  if (typeof address !== "string" || !address.startsWith("0x")) {
    throw new Error(
      `buildPathCAuthorization: wallet.address must be a 0x-prefixed EVM address`,
    );
  }
  return address as `0x${string}`;
}

/**
 * Parse a 402 response into the normalised `X402Challenge` shape. Reads
 * the JSON body (preferred — what CDP and a16p ship today) and falls
 * back to a header-only compact form if the body is missing.
 *
 * TODO(task-39 residual): once the x402 spec stabilises (Circle's own
 * settle-endpoint publishes a canonical `X-PAYMENT` shape for Arc), pin
 * the parser to the canonical one and drop the fallback. Until then,
 * keep this permissive — merchants in the wild mix both shapes during
 * the rollout window.
 */
export async function parseX402Challenge(
  response: Response,
  resourceUrl: string,
): Promise<X402Challenge> {
  // Primary: x402 v1 JSON body. Shape (per x402.org / CDP docs):
  //   { x402Version: 1, accepts: [ { scheme, network, maxAmountRequired,
  //     payTo, asset, resource, maxTimeoutSeconds, extra, ... } ], error?: ... }
  //
  // We pick the first entry whose scheme we understand. Merchants that
  // offer multiple chains/schemes list them in `accepts` in preference
  // order — taking the first is the x402 convention.
  let body: unknown;
  try {
    body = await response.clone().json();
  } catch {
    body = null;
  }

  if (body && typeof body === "object") {
    const obj = body as Record<string, unknown>;
    const accepts = obj.accepts;
    if (Array.isArray(accepts) && accepts.length > 0) {
      for (const entry of accepts) {
        const parsed = tryParseAcceptEntry(entry, resourceUrl);
        if (parsed) return parsed;
      }
    }
  }

  // Fallback: header-only compact shape (older x402 drafts). Tolerated
  // so an early-adopter merchant doesn't brick Path C before the body
  // upgrade ships. Format is a single-line JSON blob in
  // `X-PAYMENT-Requirements` OR `x402-payment-required`.
  const headerBlob =
    response.headers.get("x-payment-requirements") ??
    response.headers.get("x402-payment-required");
  if (headerBlob) {
    try {
      const parsed = JSON.parse(headerBlob);
      const entry = tryParseAcceptEntry(parsed, resourceUrl);
      if (entry) return entry;
    } catch {
      // fall through to parse error below
    }
  }

  throw new X402ChallengeParseError(
    "Merchant 402 response did not carry a recognisable x402 challenge " +
      "(expected JSON body with `accepts[]` or a header with `scheme`, " +
      "`network`, `payTo`, `asset`, `maxAmountRequired`, `extra.verifyingContract`).",
  );
}

function tryParseAcceptEntry(
  entry: unknown,
  resourceUrl: string,
): X402Challenge | null {
  if (!entry || typeof entry !== "object") return null;
  const e = entry as Record<string, unknown>;

  if (e.scheme !== "exact") return null;

  const network = typeof e.network === "string" ? e.network : null;
  const payTo = typeof e.payTo === "string" ? e.payTo : null;
  const asset = typeof e.asset === "string" ? e.asset : null;
  const maxAmountRequired =
    typeof e.maxAmountRequired === "string"
      ? e.maxAmountRequired
      : typeof e.maxAmountRequired === "number"
        ? String(e.maxAmountRequired)
        : null;
  const nonce = typeof e.nonce === "string" ? e.nonce : null;

  const extraRaw = e.extra && typeof e.extra === "object" ? e.extra : null;
  const extra = extraRaw as Record<string, unknown> | null;
  const verifyingContract =
    extra && typeof extra.verifyingContract === "string"
      ? extra.verifyingContract
      : null;
  const name = extra && typeof extra.name === "string" ? extra.name : null;
  const version =
    extra && typeof extra.version === "string" ? extra.version : null;
  const chainId =
    extra && typeof extra.chainId === "number" ? extra.chainId : null;

  const validAfter = typeof e.validAfter === "number" ? e.validAfter : 0;
  const validBefore = typeof e.validBefore === "number" ? e.validBefore : null;

  if (
    !network ||
    !payTo ||
    payTo.startsWith("0x") === false ||
    !asset ||
    asset.startsWith("0x") === false ||
    !maxAmountRequired ||
    !nonce ||
    nonce.startsWith("0x") === false ||
    !verifyingContract ||
    verifyingContract.startsWith("0x") === false ||
    !name ||
    !version ||
    chainId === null ||
    validBefore === null
  ) {
    return null;
  }

  const facilitator = typeof e.facilitator === "string" ? e.facilitator : null;
  const maxTimeoutSeconds =
    typeof e.maxTimeoutSeconds === "number" ? e.maxTimeoutSeconds : undefined;
  const resource =
    typeof e.resource === "string" && e.resource.length > 0
      ? e.resource
      : resourceUrl;

  return {
    scheme: "exact",
    network,
    maxAmountRequired,
    payTo: payTo as `0x${string}`,
    asset: asset as `0x${string}`,
    resource,
    maxTimeoutSeconds,
    facilitator,
    extra: {
      verifyingContract: verifyingContract as `0x${string}`,
      name,
      version,
      chainId,
    },
    nonce: nonce as `0x${string}`,
    validAfter,
    validBefore,
  };
}

/** Arguments for `executePathC`. */
export interface ExecutePathCArgs {
  resourceUrl: string;
  wallet: TWallet;
  chain: ChainConfig;
  kit: WalletKitAdapter;
  /**
   * Injected for testability. Defaults to the platform `fetch`. Tests
   * pass a stub so the module stays Node-runnable with no network.
   */
  fetchImpl?: typeof fetch;
}

export type ExecutePathCResult =
  | { status: "paid"; settlementRef?: string }
  | { status: "failed"; reason: string };

/**
 * Run the full Path C handshake end-to-end.
 *
 *   1. `fetch(resourceUrl)` → expect HTTP 402.
 *   2. Parse the challenge from the 402 response.
 *   3. Sign an EIP-3009 authorization via `kit.signTransferWithAuthorization`.
 *   4. POST the signed envelope back with header `X-PAYMENT: <base64>`.
 *   5. 200 → paid. 202 → pending (poll `Location` until terminal).
 *
 * No caching — every call fetches fresh so the single-use nonce stays
 * fresh. No server-side audit row — Path C is strictly payer ↔ merchant.
 */
export async function executePathC(
  args: ExecutePathCArgs,
): Promise<ExecutePathCResult> {
  const { resourceUrl, wallet, chain, kit } = args;
  const doFetch = args.fetchImpl ?? fetch;

  if (typeof kit.signTransferWithAuthorization !== "function") {
    return {
      status: "failed",
      reason:
        "Active wallet kit does not support EIP-3009 signing — switch to an EVM wallet to pay this resource.",
    };
  }

  // Step 1 — probe the resource.
  const probe = await doFetch(resourceUrl, { method: "GET" });
  if (probe.status !== 402) {
    // Some merchants may return 200 when the resource is freely
    // available, or 4xx/5xx for unrelated reasons. Either way it's not
    // a Path C flow — surface the status to the screen.
    throw new X402FetchError({
      status: probe.status,
      message: `Expected 402 Payment Required, got ${probe.status} from ${resourceUrl}`,
    });
  }

  // Step 2 — parse the challenge. No caching; nonce is single-use.
  const challenge = await parseX402Challenge(probe, resourceUrl);

  // Step 3 — sign. Fails-fast via `assertValidBeforeWindow` inside the
  // builder so we don't even open the keystore on a stale challenge.
  const signArgs = buildPathCAuthorization({
    wallet,
    chain,
    challenge,
    resourceUrl,
  });
  const signature = await kit.signTransferWithAuthorization(signArgs);

  // Step 4 — POST the signed envelope back. The header name has varied
  // across x402 drafts ("x402-payment" vs "X-PAYMENT"); we emit both
  // so a merchant that only reads one still sees it.
  const envelope = encodeX402Envelope({ challenge, signature, signArgs });
  const submit = await doFetch(resourceUrl, {
    method: "POST",
    headers: {
      "x402-payment": envelope,
      "X-PAYMENT": envelope,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      x402Version: 1,
      payload: {
        scheme: challenge.scheme,
        network: challenge.network,
        signature,
        authorization: {
          from: signArgs.from,
          to: signArgs.to,
          value: signArgs.valueMicros.toString(),
          validAfter: signArgs.validAfter,
          validBefore: signArgs.validBefore,
          nonce: signArgs.nonce,
        },
      },
    }),
  });

  // Step 5 — interpret terminal status.
  if (submit.status === 200) {
    const settlementRef = await extractSettlementRef(submit);
    return { status: "paid", settlementRef };
  }
  if (submit.status === 202) {
    // Pending — the merchant is asynchronously settling. Poll the
    // `Location` header until terminal. Capped poll budget so we never
    // hang the UI; if we time out, the caller can resubmit (the nonce
    // is still theirs until `validBefore`).
    const pending = await pollPendingSettlement(submit, doFetch);
    return pending;
  }

  throw new X402SettlementError({
    status: submit.status,
    message: `Merchant rejected the signed authorization (HTTP ${submit.status}).`,
  });
}

/**
 * Base64-encode the signed envelope for the `X-PAYMENT` header. Header
 * values are ASCII only; base64 is the x402 convention.
 */
function encodeX402Envelope(args: {
  challenge: X402Challenge;
  signature: `0x${string}`;
  signArgs: SignTransferWithAuthorizationArgs;
}): string {
  const payload = {
    x402Version: 1,
    scheme: args.challenge.scheme,
    network: args.challenge.network,
    signature: args.signature,
    authorization: {
      from: args.signArgs.from,
      to: args.signArgs.to,
      value: args.signArgs.valueMicros.toString(),
      validAfter: args.signArgs.validAfter,
      validBefore: args.signArgs.validBefore,
      nonce: args.signArgs.nonce,
    },
  };
  const json = JSON.stringify(payload);
  // `btoa` is present on React Native and Node ≥ 16; used here rather
  // than Buffer so the module stays RN-friendly.
  return globalThis.btoa
    ? globalThis.btoa(json)
    : (
        globalThis as unknown as {
          Buffer: { from(input: string): { toString(enc: string): string } };
        }
      ).Buffer.from(json).toString("base64");
}

async function extractSettlementRef(
  response: Response,
): Promise<string | undefined> {
  // Merchants commonly echo a settlement id in `X-PAYMENT-Response` or
  // JSON body `settlement` / `txHash`. Try in order; ignore on miss.
  const headerRef =
    response.headers.get("x-payment-response") ??
    response.headers.get("x402-payment-response");
  if (headerRef && headerRef.length > 0) return headerRef;
  try {
    const body = (await response.clone().json()) as Record<string, unknown>;
    if (typeof body.settlement === "string") return body.settlement;
    if (typeof body.txHash === "string") return body.txHash;
    if (typeof body.transactionHash === "string") return body.transactionHash;
  } catch {
    // body not JSON — fine
  }
  return undefined;
}

/**
 * Cap poll attempts so we don't wedge the UI on a misbehaving merchant.
 * The signing window (3 days) gives the user plenty of time to retry
 * from the screen later if we give up here.
 */
const POLL_MAX_ATTEMPTS = 15;
const POLL_INTERVAL_MS = 2000;

async function pollPendingSettlement(
  accepted: Response,
  doFetch: typeof fetch,
): Promise<ExecutePathCResult> {
  const location = accepted.headers.get("location");
  if (!location) {
    // Merchant said 202 but didn't tell us where to poll — assume the
    // original URL exposes the status. Worst case we re-probe 402 and
    // the caller retries the full flow.
    return {
      status: "failed",
      reason: "Merchant accepted payment but did not provide a status URL.",
    };
  }

  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt += 1) {
    await sleep(POLL_INTERVAL_MS);
    const poll = await doFetch(location, { method: "GET" });
    if (poll.status === 200) {
      const ref = await extractSettlementRef(poll);
      return { status: "paid", settlementRef: ref };
    }
    if (poll.status >= 400) {
      return {
        status: "failed",
        reason: `Merchant status endpoint returned ${poll.status}.`,
      };
    }
    // 202 or other 2xx intermediary — keep polling.
  }
  return {
    status: "failed",
    reason: "Merchant settlement took longer than expected; try again shortly.",
  };
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Re-exported constant (mirrors Path B) so screens can size timeouts. */
export { GATEWAY_VALID_BEFORE_MIN_SECONDS };
