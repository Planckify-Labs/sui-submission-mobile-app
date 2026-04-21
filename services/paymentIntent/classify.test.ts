/**
 * Scaffold tests for `classify()` + `detectorRegistry`.
 *
 * These tests only exercise the wiring — real detector tests (EVM
 * address, Solana URI, EMVCo, TakumiPay JWS, x402) land alongside each
 * detector in tasks 02–06.
 *
 * Run from the mobile-app root with:
 *
 *     node --test --experimental-strip-types \
 *          services/paymentIntent/classify.test.ts
 */

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { classify } from "./classify.ts";
import { __resetForTest, type Detector, register } from "./detectorRegistry.ts";
import type { PaymentIntent } from "./types.ts";

const makeFakeIntent = (tag: string): PaymentIntent => ({
  source: "qr",
  channel: {
    kind: "wallet",
    namespace: "eip155",
    address: `0x${tag.padEnd(40, "0")}`,
  },
  rawScan: tag,
});

describe("classify()", () => {
  beforeEach(() => {
    __resetForTest();
  });

  it("returns null when no detectors are registered", async () => {
    const result = await classify("anything");
    assert.equal(result, null);
  });

  it("returns null when every detector declines", async () => {
    const decliner: Detector = {
      name: "decliner",
      priority: 10,
      detect: () => null,
    };
    register(decliner);

    const result = await classify("whatever");
    assert.equal(result, null);
  });

  it("returns the first hit from a registered detector (smoke)", async () => {
    const intent = makeFakeIntent("abc");
    const fake: Detector = {
      name: "fake",
      priority: 100,
      detect: (raw) => (raw === "match-me" ? intent : null),
    };
    register(fake);

    const hit = await classify("match-me");
    assert.deepEqual(hit, intent);

    const miss = await classify("nope");
    assert.equal(miss, null);
  });

  it("awaits async detectors", async () => {
    const intent = makeFakeIntent("async");
    const asyncDetector: Detector = {
      name: "async",
      priority: 50,
      detect: async (raw) => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return raw === "async-match" ? intent : null;
      },
    };
    register(asyncDetector);

    const hit = await classify("async-match");
    assert.deepEqual(hit, intent);
  });

  it("runs detectors in priority order (lower first) regardless of register order", async () => {
    const low = makeFakeIntent("low");
    const high = makeFakeIntent("high");

    // Register the higher-priority (= larger number, runs later) detector FIRST
    // so that a naive positional implementation would pick it. The registry
    // must sort numerically on insert so the lower-priority detector wins.
    const latecomer: Detector = {
      name: "latecomer",
      priority: 100,
      detect: () => high,
    };
    const winner: Detector = {
      name: "winner",
      priority: 1,
      detect: () => low,
    };
    register(latecomer);
    register(winner);

    const hit = await classify("anything");
    assert.deepEqual(hit, low);
  });

  it("falls through to the next detector when the first returns null", async () => {
    const intent = makeFakeIntent("second");
    const first: Detector = {
      name: "first",
      priority: 1,
      detect: () => null,
    };
    const second: Detector = {
      name: "second",
      priority: 2,
      detect: () => intent,
    };
    register(first);
    register(second);

    const hit = await classify("anything");
    assert.deepEqual(hit, intent);
  });
});
