/**
 * Tests for `takumipayJwsDetector` — task 05 acceptance criteria.
 *
 * Run from the mobile-app root with:
 *
 *     node --test --experimental-strip-types \
 *          services/paymentIntent/detectors/takumipayJws.test.ts
 *
 * Test isolation: the detector module registers itself with the shared
 * registry on import as a side-effect, so every test calls
 * `__resetForTest()` first. These tests exercise the internal
 * `verifyTakumipayJws(raw, jwk)` function directly with a throwaway
 * ES256 keypair generated per suite, which keeps this file **out of
 * `@/constants/takumipayKey`'s import graph** — task 09 bundles the
 * real JWK behind an env var that hard-throws when unset, and we do
 * not want the test harness to require that env var.
 */

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { exportJWK, generateKeyPair, type JWK, SignJWT } from "jose";

import { __resetForTest } from "../detectorRegistry.ts";
import { takumipayJwsDetector, verifyTakumipayJws } from "./takumipayJws.ts";

const TAKUMIPAY_V1_PREFIX = "takumipay:v1:";

/**
 * Build a signed `takumipay:v1:<JWS>` payload with the given claims
 * under the supplied private key. Returns the full raw string the
 * detector would see off the scanner.
 */
const mintTakumipayQr = async (
  privateKey: CryptoKey,
  claims: Record<string, unknown>,
  options?: { exp?: number | string; iat?: number },
): Promise<string> => {
  let signer = new SignJWT(claims).setProtectedHeader({ alg: "ES256" });
  if (options?.iat !== undefined) {
    signer = signer.setIssuedAt(options.iat);
  }
  if (options?.exp !== undefined) {
    signer = signer.setExpirationTime(options.exp);
  }
  const jws = await signer.sign(privateKey);
  return `${TAKUMIPAY_V1_PREFIX}${jws}`;
};

describe("takumipayJwsDetector", () => {
  beforeEach(() => {
    __resetForTest();
  });

  it("exposes the M1 priority slot (10) — highest", () => {
    // Pin the priority so a future refactor can't silently reorder
    // detectors and break the task 01 slotting plan (TakumiPay JWS
    // 10, x402 20, QRIS 30, walletUri 40, walletAddress 50).
    assert.equal(takumipayJwsDetector.priority, 10);
    assert.equal(takumipayJwsDetector.name, "takumipayJws");
  });

  it("verifies a valid JWS and returns a merchant intent", async () => {
    const { publicKey, privateKey } = await generateKeyPair("ES256", {
      extractable: true,
    });
    const publicJwk = await exportJWK(publicKey);

    const raw = await mintTakumipayQr(privateKey, {
      merchantId: "mch_abc123",
      merchantName: "Warung Kopi Ibu Sari",
      country: "ID",
      currency: "IDR",
      amountMinor: 25000,
    });

    const hit = await verifyTakumipayJws(raw, publicJwk);
    assert.notEqual(hit, null);
    assert.equal(hit?.source, "qr");
    assert.equal(hit?.rawScan, raw);
    assert.equal(hit?.channel.kind, "merchant");
    if (hit?.channel.kind === "merchant") {
      assert.equal(hit.channel.provider, "takumipay");
      assert.equal(hit.channel.merchantId, "mch_abc123");
      assert.equal(hit.channel.amountMinor, 25000);
      assert.equal(hit.channel.currency, "IDR");
      assert.equal(hit.channel.rawPayload, raw);
    }
  });

  it("treats an open-amount QR (no amountMinor) as undefined", async () => {
    const { publicKey, privateKey } = await generateKeyPair("ES256", {
      extractable: true,
    });
    const publicJwk = await exportJWK(publicKey);

    const raw = await mintTakumipayQr(privateKey, {
      merchantId: "mch_open_1",
      currency: "IDR",
    });

    const hit = await verifyTakumipayJws(raw, publicJwk);
    assert.notEqual(hit, null);
    if (hit?.channel.kind === "merchant") {
      assert.equal(hit.channel.amountMinor, undefined);
    }
  });

  it("returns null for a tampered signature", async () => {
    const { publicKey, privateKey } = await generateKeyPair("ES256", {
      extractable: true,
    });
    const publicJwk = await exportJWK(publicKey);

    const raw = await mintTakumipayQr(privateKey, {
      merchantId: "mch_abc123",
      currency: "IDR",
      amountMinor: 1000,
    });

    // Corrupt the signature segment by wholesale-replacing it with a
    // fixed, structurally-valid but wrong base64url blob. Flipping a
    // single character is unreliable against ECDSA (signature
    // malleability + R/S normalisation can mask the change); stomping
    // the entire segment guarantees `jwtVerify` rejects the signature
    // without risking a false negative in the test.
    const lastDot = raw.lastIndexOf(".");
    const tampered = `${raw.slice(0, lastDot + 1)}${"A".repeat(
      raw.length - lastDot - 1,
    )}`;

    const hit = await verifyTakumipayJws(tampered, publicJwk);
    assert.equal(hit, null);
  });

  it("returns null when signed by a different keypair (wrong key)", async () => {
    const signer = await generateKeyPair("ES256", { extractable: true });
    const other = await generateKeyPair("ES256", { extractable: true });
    const wrongPublicJwk = await exportJWK(other.publicKey);

    const raw = await mintTakumipayQr(signer.privateKey, {
      merchantId: "mch_abc123",
      currency: "IDR",
    });

    // Verifying with the other keypair's public JWK must fail.
    const hit = await verifyTakumipayJws(raw, wrongPublicJwk);
    assert.equal(hit, null);
  });

  it("returns null for the wrong scheme prefix (takumipay:v2:…)", async () => {
    const { publicKey, privateKey } = await generateKeyPair("ES256", {
      extractable: true,
    });
    const publicJwk = await exportJWK(publicKey);
    const raw = await mintTakumipayQr(privateKey, {
      merchantId: "mch_abc123",
      currency: "IDR",
    });
    // Swap the v1 prefix for v2 — this should short-circuit before
    // `jwtVerify` even runs.
    const v2 = raw.replace(TAKUMIPAY_V1_PREFIX, "takumipay:v2:");
    const hit = await verifyTakumipayJws(v2, publicJwk);
    assert.equal(hit, null);
  });

  it("returns null when the payload is missing merchantId", async () => {
    const { publicKey, privateKey } = await generateKeyPair("ES256", {
      extractable: true,
    });
    const publicJwk = await exportJWK(publicKey);

    // Legitimately-signed but missing the required merchantId claim.
    const raw = await mintTakumipayQr(privateKey, {
      merchantName: "Nameless",
      currency: "IDR",
    });

    const hit = await verifyTakumipayJws(raw, publicJwk);
    assert.equal(hit, null);
  });

  it("returns null for an expired exp claim", async () => {
    const { publicKey, privateKey } = await generateKeyPair("ES256", {
      extractable: true,
    });
    const publicJwk = await exportJWK(publicKey);

    const nowSec = Math.floor(Date.now() / 1000);
    const raw = await mintTakumipayQr(
      privateKey,
      { merchantId: "mch_expired", currency: "IDR" },
      { iat: nowSec - 120, exp: nowSec - 60 },
    );

    const hit = await verifyTakumipayJws(raw, publicJwk);
    assert.equal(hit, null);
  });

  it("returns null for malformed JWS (not three dot-segments)", async () => {
    const { publicKey } = await generateKeyPair("ES256", {
      extractable: true,
    });
    const publicJwk = await exportJWK(publicKey);

    const hit = await verifyTakumipayJws(
      "takumipay:v1:definitely-not-a-jws",
      publicJwk,
    );
    assert.equal(hit, null);
  });

  it("returns null for an empty JWS segment", async () => {
    const { publicKey } = await generateKeyPair("ES256", {
      extractable: true,
    });
    const publicJwk = await exportJWK(publicKey);

    const hit = await verifyTakumipayJws("takumipay:v1:", publicJwk);
    assert.equal(hit, null);
  });

  it("returns null for a non-takumipay payload (early short-circuit)", async () => {
    // Using a syntactically valid but unrelated JWK — the prefix
    // check must short-circuit before we even touch `importJWK`.
    const unusedJwk = {} as JWK;
    const hit = await verifyTakumipayJws(
      "ethereum:0x0000000000000000000000000000000000000000",
      unusedJwk,
    );
    assert.equal(hit, null);
  });
});
