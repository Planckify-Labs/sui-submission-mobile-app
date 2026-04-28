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
 * Purity: imports `@noble/curves/p256` + `@noble/hashes/sha2` +
 * `@/constants/takumipayKey` only. No React, no Expo, no network,
 * no `fetch`. Uses pure-JS ECDSA via `@noble/curves` instead of
 * jose's WebCrypto path — jose routes through
 * `crypto.subtle.importKey`/`verify` which hits
 * `react-native-quick-crypto`'s native JSI bindings. A crash in the
 * native layer is not catchable by JS try-catch, causing a force
 * close when scanning JWS QRs. The `@noble/curves` path is
 * deterministic, pure-JS, and fully try-catch safe.
 *
 * Test-decoupling pattern: `verifyTakumipayJws(raw, pubKeyBytes)` is
 * exported for unit tests so the test file can inject a throwaway
 * ES256 public key without loading `@/constants/takumipayKey` (which
 * hard-throws at import time if `EXPO_PUBLIC_TAKUMIPAY_QR_PUBKEY_JWK`
 * is unset, per task 09). Production flows through `detect()`, which
 * lazy-loads the bundled JWK on first invocation via dynamic
 * `import()`.
 */

import { p256 } from "@noble/curves/p256";
import { sha256 } from "@noble/hashes/sha256";

import { type Detector, register } from "../detectorRegistry.ts";
import type { PaymentIntent, RawScan } from "../types.ts";

const TAKUMIPAY_V1_PREFIX = "takumipay:v1:";

interface TakumipayClaims {
  merchantId?: unknown;
  merchantName?: unknown;
  displayName?: unknown;
  amountMinor?: unknown;
  currency?: unknown;
}

// base64url → Uint8Array (no padding required per RFC 7515 §2)
const b64urlDecode = (s: string): Uint8Array => {
  const padded = s + "=".repeat((4 - (s.length % 4)) % 4);
  const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

// JWK EC x/y (base64url 32 bytes each) → uncompressed P-256 public key (65 bytes)
export const jwkToUncompressedP256 = (jwk: {
  x?: string;
  y?: string;
}): Uint8Array | null => {
  if (typeof jwk.x !== "string" || typeof jwk.y !== "string") return null;
  try {
    const x = b64urlDecode(jwk.x);
    const y = b64urlDecode(jwk.y);
    if (x.length !== 32 || y.length !== 32) return null;
    const pub = new Uint8Array(65);
    pub[0] = 0x04; // uncompressed point
    pub.set(x, 1);
    pub.set(y, 33);
    return pub;
  } catch {
    return null;
  }
};

// ES256 JWS signature is two raw 32-byte integers (R || S) per RFC 7518 §3.4
const jwsSigToP256Der = (rawSig: Uint8Array): Uint8Array | null => {
  if (rawSig.length !== 64) return null;
  return rawSig;
};

const textEncoder = new TextEncoder();

/**
 * Verify a raw `takumipay:v1:<JWS>` string against the supplied public
 * key bytes (uncompressed P-256, 65 bytes). Exported so unit tests can
 * inject a throwaway test key.
 *
 * Returns `null` on any failure (prefix mismatch, bad signature,
 * malformed JWS, missing `merchantId`).
 * Never throws — the caller trusts the registry, not a re-derivation.
 */
export const verifyTakumipayJws = (
  raw: RawScan,
  pubKeyBytes: Uint8Array,
): PaymentIntent | null => {
  if (typeof raw !== "string") return null;
  if (!raw.startsWith(TAKUMIPAY_V1_PREFIX)) return null;

  const compactJws = raw.slice(TAKUMIPAY_V1_PREFIX.length);
  if (compactJws.length === 0) return null;

  try {
    const parts = compactJws.split(".");
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, sigB64] = parts;

    // Verify header declares ES256
    const headerBytes = b64urlDecode(headerB64);
    const header = JSON.parse(new TextDecoder().decode(headerBytes));
    if (header.alg !== "ES256") return null;

    // Decode signature (raw R||S per RFC 7518 §3.4)
    const sigBytes = b64urlDecode(sigB64);
    const sig = jwsSigToP256Der(sigBytes);
    if (!sig) return null;

    // ES256 signs SHA-256 of the ASCII `header.payload` signing input
    const signingInput = textEncoder.encode(`${headerB64}.${payloadB64}`);
    const msgHash = sha256(signingInput);

    // lowS: false — JWS/JWT (RFC 7518) does not require low-S
    // normalization. WebCrypto (which the backend uses to sign) produces
    // both high-S and low-S signatures nondeterministically.
    const valid = p256.verify(sig, msgHash, pubKeyBytes, { lowS: false });
    if (!valid) return null;

    // Decode claims
    const payloadBytes = b64urlDecode(payloadB64);
    const claims = JSON.parse(
      new TextDecoder().decode(payloadBytes),
    ) as TakumipayClaims;

    if (typeof claims.merchantId !== "string" || claims.merchantId === "") {
      return null;
    }
    const merchantId = claims.merchantId;

    const amountMinor =
      typeof claims.amountMinor === "number" &&
      Number.isFinite(claims.amountMinor)
        ? claims.amountMinor
        : undefined;

    // exp / nbf sanity — jose checked these automatically; replicate
    // with clockTolerance 0 (merchant QRs are long-lived, an expired
    // one is operationally "not our QR").
    const nowSec = Math.floor(Date.now() / 1000);
    const claimsAny = claims as Record<string, unknown>;
    if (typeof claimsAny.exp === "number" && claimsAny.exp < nowSec)
      return null;
    if (typeof claimsAny.nbf === "number" && claimsAny.nbf > nowSec)
      return null;

    const currency: "IDR" = claims.currency === "IDR" ? "IDR" : "IDR";

    const merchantName =
      typeof claims.merchantName === "string" && claims.merchantName !== ""
        ? claims.merchantName
        : typeof claims.displayName === "string" && claims.displayName !== ""
          ? claims.displayName
          : undefined;

    return {
      source: "qr",
      rawScan: raw,
      channel: {
        kind: "merchant",
        provider: "takumipay",
        merchantId,
        amountMinor,
        currency,
        rawPayload: raw,
        merchantName,
      },
    };
  } catch {
    return null;
  }
};

/**
 * Lazy-load the bundled public JWK and convert to uncompressed P-256
 * bytes. Using dynamic `import()` keeps the test file out of the
 * import graph of `@/constants/takumipayKey`, which hard-throws at
 * module load when `EXPO_PUBLIC_TAKUMIPAY_QR_PUBKEY_JWK` is unset.
 */
let cachedPubKey: Uint8Array | null = null;
const loadProdPubKey = async (): Promise<Uint8Array | null> => {
  if (cachedPubKey !== null) return cachedPubKey;
  const mod = await import("@/constants/takumipayKey");
  const bytes = jwkToUncompressedP256(mod.publicKeyJwk);
  if (bytes) cachedPubKey = bytes;
  return bytes;
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

    let pubKey: Uint8Array | null;
    try {
      pubKey = await loadProdPubKey();
    } catch {
      return null;
    }
    if (!pubKey) return null;
    return verifyTakumipayJws(raw, pubKey);
  },
};

register(takumipayJwsDetector);
