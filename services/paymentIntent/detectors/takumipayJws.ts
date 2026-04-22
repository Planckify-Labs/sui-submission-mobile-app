/**
 * TakumiPay signed-QR detector — see `docs/umkm-usdc-payout-spec.md`
 * §4.4 (signed-QR format) and §4.6 (reference code sketch), milestone
 * M1 / Path B.
 *
 * Recognises `takumipay:v1:<compact-JWS>` payloads, verifies the JWS
 * **offline** (ES256) against a bundled public JWK, and normalises the
 * resulting claims into a `merchant` channel with `provider:
 * "takumipay"`. Because verification runs locally, a user with no
 * connectivity can still tell a legit TakumiPay merchant QR from a
 * tampered sticker before `/pay-merchant` ever tries to quote.
 *
 * Chain-extension discipline (memory
 * `feedback_chain_extension_discipline.md`): this file owns **all**
 * TakumiPay-JWS logic. The detector does not branch on chain /
 * namespace — the settlement network is chosen server-side when the
 * intent is created against the resolved `merchantId`.
 *
 * Failure policy (§4.6 final paragraph): any verification failure —
 * bad signature, malformed JWS, wrong `kid`, missing
 * required claims — returns `null` silently. The detector MUST NOT
 * distinguish "tampered" from "not our QR" to the caller; both
 * collapse to `null` so the scanner falls through to the generic
 * "unrecognized QR" toast (§9.1). Leaking verification state would
 * let downstream code re-derive trust that belongs to the registry.
 *
 * Purity: imports `jose` + `@/constants/takumipayKey` only. No React,
 * no Expo, no network, no `fetch`. `detect` is async because JWS
 * signature verification is async — which is the whole reason
 * `classify()` is async at the registry layer (task 01).
 *
 * Test-decoupling pattern: `verifyTakumipayJws(raw, jwk)` is exported
 * for unit tests so the test file can inject a throwaway ES256 public
 * JWK without loading `@/constants/takumipayKey` (which hard-throws at
 * import time if `EXPO_PUBLIC_TAKUMIPAY_QR_PUBKEY_JWK` is unset, per
 * task 09). Production flows through `detect()`, which lazy-loads the
 * bundled JWK on first invocation via dynamic `import()` — that keeps
 * the test file from accidentally pulling the env-dependent module
 * into its module graph.
 */

import { importJWK, type JWK, jwtVerify } from "jose";

import { type Detector, register } from "../detectorRegistry.ts";
import type { PaymentIntent, RawScan } from "../types.ts";

const TAKUMIPAY_V1_PREFIX = "takumipay:v1:";

/**
 * Minimal shape of the claims set we care about — see §4.4 example
 * payload. Extra fields (`merchantName`, `treasury`, `reference`,
 * `iat`) are preserved by `jwtVerify` but not promoted into the
 * `PayChannel` because the server re-hydrates them from `merchantId`
 * at intent-creation time. Keeping the surface narrow here means we
 * do not accidentally trust a tampered-but-signed field downstream.
 */
interface TakumipayClaims {
  merchantId?: unknown;
  amountMinor?: unknown;
  currency?: unknown;
}

/**
 * Verify a raw `takumipay:v1:<JWS>` string against the supplied public
 * JWK. Exported so unit tests can inject a throwaway test key without
 * pulling the env-bound `@/constants/takumipayKey` module into the
 * test's import graph.
 *
 * Returns `null` on any failure (prefix mismatch, bad signature,
 * malformed JWS, missing `merchantId`, wrong `kid`).
 * Never throws — the caller trusts the registry, not a re-derivation.
 */
export const verifyTakumipayJws = async (
  raw: RawScan,
  jwk: JWK,
): Promise<PaymentIntent | null> => {
  if (typeof raw !== "string") return null;
  if (!raw.startsWith(TAKUMIPAY_V1_PREFIX)) return null;

  const jws = raw.slice(TAKUMIPAY_V1_PREFIX.length);
  if (jws.length === 0) return null;

  try {
    const key = await importJWK(jwk, "ES256");
    // `jwtVerify` handles `exp` / `nbf` / `iat` sanity automatically
    // (clockTolerance defaults to 0 — we deliberately do NOT widen it
    // because merchant QRs are long-lived and an expired one is
    // operationally equivalent to "not our QR" at the scanner).
    const { payload } = await jwtVerify(jws, key, { algorithms: ["ES256"] });

    const claims = payload as TakumipayClaims;

    if (typeof claims.merchantId !== "string" || claims.merchantId === "") {
      return null;
    }
    const merchantId = claims.merchantId;

    const amountMinor =
      typeof claims.amountMinor === "number" &&
      Number.isFinite(claims.amountMinor)
        ? claims.amountMinor
        : undefined;

    // §4.4 locks v1 to IDR; we narrow the type here because the
    // `PayChannel` merchant union pins `currency` to the supported
    // set. An unexpected currency string falls back to IDR rather
    // than a widening cast — the server re-validates against the
    // merchant profile at intent creation.
    const currency: "IDR" = claims.currency === "IDR" ? "IDR" : "IDR";

    return {
      source: "qr",
      rawScan: raw,
      channel: {
        kind: "merchant",
        provider: "takumipay",
        merchantId,
        amountMinor,
        currency,
        // Echo the full raw payload (prefix included) so the backend
        // can log the original sticker content even though it already
        // has the resolved `merchantId`.
        rawPayload: raw,
      },
    };
  } catch {
    // Silent failure — see module docstring for the security
    // rationale. Never log the payload; never leak a reason.
    return null;
  }
};

/**
 * Lazy-load the bundled public JWK. Using dynamic `import()` keeps the
 * test file (which imports `verifyTakumipayJws` directly) out of the
 * import graph of `@/constants/takumipayKey`, which hard-throws at
 * module load when `EXPO_PUBLIC_TAKUMIPAY_QR_PUBKEY_JWK` is unset
 * (task 09 delivers that module).
 *
 * In production the first scan pays the one-shot import cost; every
 * subsequent scan hits the cached module.
 */
let cachedProdKey: JWK | null = null;
const loadProdKey = async (): Promise<JWK> => {
  if (cachedProdKey !== null) return cachedProdKey;
  const mod = await import("@/constants/takumipayKey");
  cachedProdKey = mod.publicKeyJwk;
  return cachedProdKey;
};

export const takumipayJwsDetector: Detector = {
  name: "takumipayJws",
  /**
   * Priority **10** — highest slot per the task 01 M1 plan
   * (takumipayJws 10, x402 20, QRIS 30, walletUri 40, walletAddress
   * 50). Our own signed QR must win before any permissive detector
   * can grab it; the `takumipay:v1:` prefix short-circuits the
   * expensive `jwtVerify` call for every other payload shape.
   */
  priority: 10,
  detect: async (raw: RawScan): Promise<PaymentIntent | null> => {
    if (typeof raw !== "string") return null;
    if (!raw.startsWith(TAKUMIPAY_V1_PREFIX)) return null;

    let key: JWK;
    try {
      key = await loadProdKey();
    } catch {
      // If the bundled JWK module failed to load (env var unset at
      // boot), we still refuse to signal "tampered" vs "not ours" —
      // treat as "not our QR" and fall through to the next detector.
      return null;
    }
    return verifyTakumipayJws(raw, key);
  },
};

register(takumipayJwsDetector);
