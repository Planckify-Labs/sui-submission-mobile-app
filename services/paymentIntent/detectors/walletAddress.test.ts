/**
 * Tests for `walletAddressDetector` — see task 02 acceptance criteria.
 *
 * Run from the mobile-app root with:
 *
 *     node --test --experimental-strip-types \
 *          services/paymentIntent/detectors/walletAddress.test.ts
 *
 * Each test calls `__resetForTest()` so it owns a pristine registry —
 * importing the detector module auto-registers via its side effect, so
 * we re-import lazily after the reset where the registry wiring is
 * under test. For pure shape tests we call `detect()` directly.
 */

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { __resetForTest } from "../detectorRegistry.ts";
import { walletAddressDetector } from "./walletAddress.ts";

describe("walletAddressDetector", () => {
  beforeEach(() => {
    __resetForTest();
  });

  it("detects a lowercase EVM address", () => {
    const raw = "0xabcdef0123456789abcdef0123456789abcdef01";
    const hit = walletAddressDetector.detect(raw);
    assert.deepEqual(hit, {
      source: "qr",
      channel: {
        kind: "wallet",
        namespace: "eip155",
        address: raw,
        target: undefined,
      },
      rawScan: raw,
    });
  });

  it("detects a mixed-case (EIP-55 checksum) EVM address without verifying the checksum", () => {
    // Canonical EIP-55 checksum for 0xfb6916095ca1df60bb79ce92ce3ea74c37c5d359.
    // Task 02 only requires shape validation, not checksum verification.
    const raw = "0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359";
    const hit = walletAddressDetector.detect(raw);
    assert.ok(hit, "expected EVM detection");
    assert.equal(hit?.channel.kind, "wallet");
    if (hit?.channel.kind === "wallet") {
      assert.equal(hit.channel.namespace, "eip155");
      assert.equal(hit.channel.address, raw);
      assert.equal(hit.channel.target, undefined);
    }
  });

  it("detects a valid Solana base58 address (32-byte pubkey)", () => {
    // System program ID — a well-known 32-byte Solana pubkey.
    const raw = "11111111111111111111111111111111";
    const hit = walletAddressDetector.detect(raw);
    assert.ok(hit, "expected Solana detection");
    assert.equal(hit?.channel.kind, "wallet");
    if (hit?.channel.kind === "wallet") {
      assert.equal(hit.channel.namespace, "solana");
      assert.equal(hit.channel.address, raw);
      assert.equal(hit.channel.target, undefined);
    }
  });

  it("detects another valid Solana pubkey (44-char form)", () => {
    // Token program ID — 44-char base58, 32 bytes decoded.
    const raw = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
    const hit = walletAddressDetector.detect(raw);
    assert.ok(hit, "expected Solana detection for Token program ID");
    if (hit?.channel.kind === "wallet") {
      assert.equal(hit.channel.namespace, "solana");
      assert.equal(hit.channel.address, raw);
    }
  });

  it("handles leading/trailing whitespace on a valid EVM address", () => {
    const addr = "0xabcdef0123456789abcdef0123456789abcdef01";
    const hit = walletAddressDetector.detect(`  ${addr}\n`);
    assert.ok(hit);
    if (hit?.channel.kind === "wallet") {
      assert.equal(hit.channel.address, addr);
    }
  });

  it("rejects an EVM address of the wrong length", () => {
    // 39 hex chars instead of 40.
    const raw = "0xabcdef0123456789abcdef0123456789abcdef0";
    const hit = walletAddressDetector.detect(raw);
    assert.equal(hit, null);
  });

  it("rejects an EVM-shaped string with a non-hex character", () => {
    const raw = "0xZZcdef0123456789abcdef0123456789abcdef01";
    const hit = walletAddressDetector.detect(raw);
    assert.equal(hit, null);
  });

  it("rejects a base58 string that decodes to the wrong byte length", () => {
    // 32 chars all '1' decodes to 32 zero bytes — valid. So use
    // a 32-char base58 that decodes to fewer bytes: the literal
    // 'z' repeated 33 times is > 32 bytes when decoded.
    const raw = "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz"; // 44 'z's → 33 bytes
    const hit = walletAddressDetector.detect(raw);
    assert.equal(hit, null);
  });

  it("rejects base58 with an illegal character (0, O, I, l)", () => {
    const raw = "0OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO"; // starts with '0', disallowed
    const hit = walletAddressDetector.detect(raw);
    assert.equal(hit, null);
  });

  it("rejects empty and whitespace-only input", () => {
    assert.equal(walletAddressDetector.detect(""), null);
    assert.equal(walletAddressDetector.detect("   "), null);
  });

  it("rejects an arbitrary non-address string", () => {
    assert.equal(walletAddressDetector.detect("hello world"), null);
    assert.equal(walletAddressDetector.detect("not-an-address"), null);
  });

  it("declares priority 50 (lowest among M1 detectors)", () => {
    assert.equal(walletAddressDetector.priority, 50);
    assert.equal(walletAddressDetector.name, "walletAddress");
  });
});
