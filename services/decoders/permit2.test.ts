/**
 * Unit tests for the Permit2 decoder.
 *
 * Run from mobile-app root:
 *   node --test --experimental-strip-types services/decoders/permit2.test.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { tryDecodePermit2 } from "./permit2.ts";

function permitSingle(amount: string | bigint = 1_000_000n) {
  return {
    domain: {
      name: "Permit2",
      chainId: 1,
      verifyingContract:
        "0x000000000022D473030F116dDEE9F6B43aC78BA3" as `0x${string}`,
    },
    types: {
      PermitSingle: [
        { name: "details", type: "PermitDetails" },
        { name: "spender", type: "address" },
        { name: "sigDeadline", type: "uint256" },
      ],
      PermitDetails: [
        { name: "token", type: "address" },
        { name: "amount", type: "uint160" },
        { name: "expiration", type: "uint48" },
        { name: "nonce", type: "uint48" },
      ],
    },
    primaryType: "PermitSingle" as const,
    message: {
      details: {
        token: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        amount: typeof amount === "bigint" ? amount.toString() : amount,
        expiration: "9999999999",
        nonce: "0",
      },
      spender: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      sigDeadline: "9999999999",
    },
  };
}

describe("tryDecodePermit2 — PermitSingle", () => {
  it("decodes a regular bounded approval", () => {
    const d = tryDecodePermit2(permitSingle(1_000_000n) as any);
    assert.ok(d);
    assert.equal(d.standard, "Permit2");
    assert.equal(d.spender, "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    assert.equal(d.tokens.length, 1);
    assert.equal(
      d.tokens[0]?.address,
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
    assert.equal(d.tokens[0]?.amount, 1_000_000n);
    assert.equal(d.isUnlimited, false);
  });

  it("flags near-max uint160 as unlimited", () => {
    const maxUint160 = (1n << 160n) - 1n;
    const d = tryDecodePermit2(permitSingle(maxUint160) as any);
    assert.ok(d);
    assert.equal(d.isUnlimited, true);
  });

  it("flags almost-max uint160 as unlimited", () => {
    const almost = (1n << 160n) - 2n;
    const d = tryDecodePermit2(permitSingle(almost) as any);
    assert.ok(d);
    assert.equal(d.isUnlimited, true);
  });

  it("does not flag 0 as unlimited", () => {
    const d = tryDecodePermit2(permitSingle(0n) as any);
    assert.ok(d);
    assert.equal(d.isUnlimited, false);
  });
});

describe("tryDecodePermit2 — PermitBatch", () => {
  it("decodes multiple tokens", () => {
    const batch = {
      domain: permitSingle().domain,
      types: {
        PermitBatch: [
          { name: "details", type: "PermitDetails[]" },
          { name: "spender", type: "address" },
          { name: "sigDeadline", type: "uint256" },
        ],
      },
      primaryType: "PermitBatch" as const,
      message: {
        details: [
          {
            token: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            amount: "100",
            expiration: "9999999999",
            nonce: "0",
          },
          {
            token: "0xcccccccccccccccccccccccccccccccccccccccc",
            amount: ((1n << 160n) - 1n).toString(),
            expiration: "9999999999",
            nonce: "1",
          },
        ],
        spender: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        sigDeadline: "9999999999",
      },
    };
    const d = tryDecodePermit2(batch as any);
    assert.ok(d);
    assert.equal(d.tokens.length, 2);
    // One bounded, one at uint160 max — overall unlimited flag is true.
    assert.equal(d.isUnlimited, true);
  });
});

describe("tryDecodePermit2 — negative cases", () => {
  it("returns null when domain.name is not Permit2", () => {
    const p = permitSingle();
    const mutated = { ...p, domain: { ...p.domain, name: "NotPermit2" } };
    assert.equal(tryDecodePermit2(mutated as any), null);
  });

  it("returns null for unknown primaryType", () => {
    const p = permitSingle();
    const mutated = { ...p, primaryType: "SomethingElse" };
    assert.equal(tryDecodePermit2(mutated as any), null);
  });

  it("returns null for null/undefined", () => {
    assert.equal(tryDecodePermit2(null), null);
    assert.equal(tryDecodePermit2(undefined), null);
  });

  it("returns null on malformed amount", () => {
    const p = permitSingle();
    const broken = {
      ...p,
      message: {
        ...p.message,
        details: { ...p.message.details, amount: "not a number" },
      },
    };
    assert.equal(tryDecodePermit2(broken as any), null);
  });
});
