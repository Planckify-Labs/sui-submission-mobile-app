/**
 * Unit tests for `redactParams`. Ensures sensitive message bodies never
 * reach the BridgeEventBus in plaintext. Invariant §10.4.8.
 *
 * Run from mobile-app root:
 *   node --test --experimental-strip-types services/bridge/redact.test.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { redactParams } from "./redact.ts";

describe("redactParams — signing methods", () => {
  it("personal_sign replaces message with {length, sha256Prefix}, preserves address", () => {
    const out = redactParams("personal_sign", [
      "hello from a dApp",
      "0xabc123",
    ]) as [{ length: number; sha256Prefix: string }, string];
    assert.ok(typeof out[0] === "object");
    assert.equal(out[0].length, "hello from a dApp".length);
    assert.match(out[0].sha256Prefix, /^[0-9a-f]+$/);
    assert.equal(out[1], "0xabc123");
  });

  it("eth_sign preserves [address, redacted] order", () => {
    const out = redactParams("eth_sign", ["0xabc", "0xdeadbeef"]) as [
      string,
      { length: number; sha256Prefix: string },
    ];
    assert.equal(out[0], "0xabc");
    assert.ok(typeof out[1] === "object");
  });

  it("redacts every typed-data version", () => {
    for (const m of [
      "eth_signTypedData",
      "eth_signTypedData_v1",
      "eth_signTypedData_v3",
      "eth_signTypedData_v4",
    ]) {
      const out = redactParams(m, [
        "0xabc",
        { domain: { name: "X" }, message: { secret: 1 } },
      ]) as [string, { length: number; sha256Prefix: string }];
      assert.equal(out[0], "0xabc");
      assert.ok(out[1].sha256Prefix);
      // Original nested object must NOT appear as-is.
      assert.ok(!("message" in out[1]));
    }
  });
});

describe("redactParams — send transaction", () => {
  it("truncates calldata to selector only", () => {
    const out = redactParams("eth_sendTransaction", [
      {
        to: "0xrecipient",
        from: "0xsender",
        value: "0x0",
        chainId: "0x1",
        data: "0xa9059cbb000000000000000000000000abcabcabcabcabcabcabcabcabcabcabcabcabcabc",
      },
    ]) as [Record<string, unknown>];
    const r = out[0];
    assert.equal(r.to, "0xrecipient");
    assert.equal(r.from, "0xsender");
    assert.equal(r.chainId, "0x1");
    assert.equal(
      typeof r.dataLength,
      "number",
      "dataLength should be populated",
    );
    assert.ok(
      typeof r.dataSelector === "string" && r.dataSelector.startsWith("0xa9059cbb"),
      "selector preserved as first 10 chars",
    );
  });

  it("leaves tx with short data untouched (data already short)", () => {
    const out = redactParams("eth_sendTransaction", [
      { to: "0xabc", data: "0xaa" },
    ]) as [Record<string, unknown>];
    assert.equal(out[0].dataSelector, "0xaa");
  });

  it("returns params unchanged when tx is non-object", () => {
    const out = redactParams("eth_sendTransaction", [null]);
    assert.deepEqual(out, [null]);
  });
});

describe("redactParams — unknown methods", () => {
  it("pass-through for methods without a redaction rule", () => {
    const p = [123, "abc"];
    assert.deepEqual(redactParams("eth_chainId", p), p);
  });
});

describe("redactParams — solana", () => {
  it("redacts solana:signMessage payloads", () => {
    const out = redactParams("solana:signMessage", ["some secret"]) as [
      { length: number; sha256Prefix: string },
    ];
    assert.ok(out[0].sha256Prefix);
    assert.equal(out[0].length, "some secret".length);
  });
});
