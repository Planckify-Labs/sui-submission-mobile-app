/**
 * Tests for the x402 resource-URL detector.
 *
 * Run from the mobile-app root with:
 *
 *     node --test --experimental-strip-types \
 *          services/paymentIntent/detectors/x402.test.ts
 *
 * M1 scope covers the `x402://` scheme only. Task 39 (Path C M5) adds
 * the paste-gated `https://` upgrade — the detector now looks at an
 * optional `source` hint from `DetectContext` and accepts plain HTTPS
 * URLs ONLY when the caller set `source: "paste"`. A scanned HTTPS
 * URL still returns `null` so a malicious QR code can't trick the
 * scanner into auto-fetching an attacker-controlled URL.
 */

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { __resetForTest } from "../detectorRegistry.ts";
// Importing the detector module runs its top-level `register(...)`
// side-effect. We call `__resetForTest()` first in `beforeEach` so the
// registry does not leak cross-test, but we re-import fresh here so
// the detector reference is available for direct invocation too.
import { x402Detector } from "./x402.ts";

describe("x402Detector", () => {
  beforeEach(() => {
    __resetForTest();
  });

  it("detects a bare x402:// URL", () => {
    const hit = x402Detector.detect("x402://merchant.example/widget");
    assert.deepEqual(hit, {
      source: "qr",
      channel: {
        kind: "x402",
        resourceUrl: "x402://merchant.example/widget",
      },
      rawScan: "x402://merchant.example/widget",
    });
  });

  it("preserves port and query string when normalising", () => {
    const raw = "x402://merchant.example:8443/path?q=1";
    const hit = x402Detector.detect(raw);
    assert.notEqual(hit, null);
    assert.equal(hit?.channel.kind, "x402");
    if (hit?.channel.kind === "x402") {
      assert.equal(
        hit.channel.resourceUrl,
        "x402://merchant.example:8443/path?q=1",
      );
    }
    assert.equal(hit?.rawScan, raw);
  });

  it("returns null for plain https:// URLs from a scan (default branch)", () => {
    // Omitting `ctx` should behave identically to `{ source: "scan" }` so
    // existing callers that haven't been updated for task 39 keep their
    // pre-M5 behaviour byte-for-byte.
    const hit = x402Detector.detect("https://merchant.example/resource");
    assert.equal(hit, null);
  });

  it("returns null for plain https:// URLs when source is explicitly scan", () => {
    const hit = x402Detector.detect("https://merchant.example/resource", {
      source: "scan",
    });
    assert.equal(hit, null);
  });

  it("accepts https:// URLs when source is paste (task 39 Path C M5)", () => {
    // Explicit paste intent unlocks the HTTPS upgrade. The resulting
    // intent's `source` field is `"paste"` so downstream code can show
    // paste-audience copy without a second branch.
    const hit = x402Detector.detect("https://merchant.example/resource", {
      source: "paste",
    });
    assert.deepEqual(hit, {
      source: "paste",
      channel: {
        kind: "x402",
        resourceUrl: "https://merchant.example/resource",
      },
      rawScan: "https://merchant.example/resource",
    });
  });

  it("still honours x402:// when source is paste (scheme-unambiguous wins)", () => {
    // `x402://` is unambiguous regardless of source; we shouldn't lose it
    // just because the user pasted it. The intent's `source` mirrors the
    // ctx so downstream code sees it came from paste.
    const hit = x402Detector.detect("x402://merchant.example/resource", {
      source: "paste",
    });
    assert.equal(hit?.source, "paste");
    assert.equal(
      hit?.channel.kind === "x402" && hit.channel.resourceUrl,
      "x402://merchant.example/resource",
    );
  });

  it("still rejects non-HTTPS URLs when source is paste (e.g. http://)", () => {
    // Plain `http://` is never an x402 target — we refuse even with
    // paste intent to avoid downgrading TLS for a merchant payment.
    const hit = x402Detector.detect("http://merchant.example/resource", {
      source: "paste",
    });
    assert.equal(hit, null);
  });

  it("returns null for ethereum: URIs", () => {
    const hit = x402Detector.detect(
      "ethereum:0x0000000000000000000000000000000000000000",
    );
    assert.equal(hit, null);
  });

  it("returns null for non-URL garbage even on paste", () => {
    const hit = x402Detector.detect("not-a-url", { source: "paste" });
    assert.equal(hit, null);
  });

  it("returns null for an empty string", () => {
    const hit = x402Detector.detect("");
    assert.equal(hit, null);
  });

  it("exposes the M1 priority slot (20)", () => {
    // Pinning the priority here so a future refactor cannot silently
    // reorder detectors and break the task 01 slotting plan
    // (TakumiPay JWS 10, x402 20, QRIS 30, walletUri 40,
    // walletAddress 50).
    assert.equal(x402Detector.priority, 20);
  });
});
