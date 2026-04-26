/**
 * Tests for `switchToScannedTarget` — see task 07 acceptance criteria.
 *
 * Run from the mobile-app root with:
 *
 *     node --test --experimental-strip-types \
 *          services/paymentIntent/switchToScannedTarget.test.ts
 *
 * Every branch of `PaymentIntent` has at least one test covering both
 * `route` and `params`. The helper is pure, so these tests do not import
 * `expo-router`, React, or any RN shim — the whole point of task 07 is
 * that the scan screen's dispatch logic is testable in a Node harness.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { switchToScannedTarget } from "./switchToScannedTarget.ts";
import type { PaymentIntent } from "./types.ts";

describe("switchToScannedTarget()", () => {
  it("routes a raw EVM wallet address to /send with namespace only", () => {
    const intent: PaymentIntent = {
      source: "qr",
      rawScan: "0xabcdef0123456789abcdef0123456789abcdef01",
      channel: {
        kind: "wallet",
        namespace: "eip155",
        address: "0xabcdef0123456789abcdef0123456789abcdef01",
        target: undefined,
      },
    };

    const out = switchToScannedTarget(intent);

    assert.deepEqual(out, {
      kind: "navigate",
      route: "/send",
      params: {
        recipientAddress: "0xabcdef0123456789abcdef0123456789abcdef01",
        namespace: "eip155",
        amount: undefined,
        token: undefined,
      },
    });
  });

  it("routes an EIP-681 URI with @chainId to /send with chainId", () => {
    const intent: PaymentIntent = {
      source: "qr",
      rawScan: "ethereum:0xabc...@137?value=1000000",
      channel: {
        kind: "wallet",
        namespace: "eip155",
        address: "0xabcdef0123456789abcdef0123456789abcdef01",
        target: { namespace: "eip155", chainId: 137 },
        amount: 1000000n,
      },
    };

    const out = switchToScannedTarget(intent);

    assert.equal(out.kind, "navigate");
    assert.equal(out.kind === "navigate" && out.route, "/send");
    assert.deepEqual(out.kind === "navigate" && out.params, {
      recipientAddress: "0xabcdef0123456789abcdef0123456789abcdef01",
      namespace: "eip155",
      amount: "1000000",
      token: undefined,
      chainId: "137",
    });
  });

  it("routes an EIP-681 /transfer URI to /send with token + amount", () => {
    const intent: PaymentIntent = {
      source: "qr",
      rawScan: "ethereum:0xTOKEN/transfer?address=0xRECIPIENT&uint256=25000000",
      channel: {
        kind: "wallet",
        namespace: "eip155",
        address: "0xrecipient",
        target: { namespace: "eip155", chainId: 1 },
        token: "0xtoken",
        amount: 25000000n,
      },
    };

    const out = switchToScannedTarget(intent);

    assert.equal(out.kind, "navigate");
    assert.equal(out.kind === "navigate" && out.route, "/send");
    assert.deepEqual(out.kind === "navigate" && out.params, {
      recipientAddress: "0xrecipient",
      namespace: "eip155",
      amount: "25000000",
      token: "0xtoken",
      chainId: "1",
    });
  });

  it("routes a solana: URI with ?cluster=devnet to /send with cluster", () => {
    const intent: PaymentIntent = {
      source: "qr",
      rawScan: "solana:SOLPUBKEY?amount=1&cluster=devnet",
      channel: {
        kind: "wallet",
        namespace: "solana",
        address: "SOLPUBKEY",
        target: { namespace: "solana", cluster: "devnet" },
        amount: 1n,
      },
    };

    const out = switchToScannedTarget(intent);

    assert.equal(out.kind, "navigate");
    assert.equal(out.kind === "navigate" && out.route, "/send");
    assert.deepEqual(out.kind === "navigate" && out.params, {
      recipientAddress: "SOLPUBKEY",
      namespace: "solana",
      amount: "1",
      token: undefined,
      cluster: "devnet",
    });
  });

  it("routes a TakumiPay merchant intent to /pay-merchant with raw JWS", () => {
    const jws = "takumipay:v1:eyJhbGciOiJFUzI1NiJ9.payload.signature";
    const intent: PaymentIntent = {
      source: "qr",
      rawScan: jws,
      channel: {
        kind: "merchant",
        provider: "takumipay",
        merchantId: "mch_abc123",
        amountMinor: 25000,
        currency: "IDR",
        rawPayload: jws,
      },
    };

    const out = switchToScannedTarget(intent);

    assert.deepEqual(out, {
      kind: "navigate",
      route: "/pay-merchant",
      params: {
        provider: "takumipay",
        raw: jws,
        merchantName: undefined,
      },
    });
  });

  it("routes a QRIS merchant intent to /pay-merchant with raw EMVCo payload", () => {
    const qris =
      "00020101021126660014ID.CO.QRIS.WWW01189360091400000099990215ID12345678901230303UMI5204581253033605802ID5920WARUNG KOPI IBU SARI6007JAKARTA61051031063041FDB";
    const intent: PaymentIntent = {
      source: "qr",
      rawScan: qris,
      channel: {
        kind: "merchant",
        provider: "xendit_qris",
        merchantId: "",
        amountMinor: undefined,
        currency: "IDR",
        rawPayload: qris,
      },
    };

    const out = switchToScannedTarget(intent);

    assert.deepEqual(out, {
      kind: "navigate",
      route: "/pay-merchant",
      params: {
        provider: "xendit_qris",
        raw: qris,
        merchantName: undefined,
      },
    });
  });

  it("routes x402 intents to /pay-x402 with the resolved resource URL (task 39)", () => {
    const intent: PaymentIntent = {
      source: "qr",
      rawScan: "x402://facilitator.example/pay/abc",
      channel: {
        kind: "x402",
        resourceUrl: "x402://facilitator.example/pay/abc",
      },
    };

    const out = switchToScannedTarget(intent);

    assert.deepEqual(out, {
      kind: "navigate",
      route: "/pay-x402",
      params: {
        resourceUrl: "x402://facilitator.example/pay/abc",
      },
    });
  });

  it("routes a pasted https:// x402 resource to /pay-x402 (task 39 Path C M5)", () => {
    // The detector (task 39) upgrades an `https://` URL to an x402 channel
    // when the classifier was called with `source: "paste"`. Router-side,
    // the intent looks identical to the `x402://` case — same route, same
    // params — so the pasted entrypoint shares the render path with the
    // scanned one.
    const intent: PaymentIntent = {
      source: "paste",
      rawScan: "https://merchant.example/resource",
      channel: {
        kind: "x402",
        resourceUrl: "https://merchant.example/resource",
      },
    };

    const out = switchToScannedTarget(intent);

    assert.deepEqual(out, {
      kind: "navigate",
      route: "/pay-x402",
      params: {
        resourceUrl: "https://merchant.example/resource",
      },
    });
  });
});
