/**
 * Unit tests for the ERC-2612 permit decoder.
 *
 * Run from mobile-app root:
 *   node --test --experimental-strip-types services/decoders/erc2612.test.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { tryDecodeErc2612 } from "./erc2612.ts";

function validPermit(amount: string | bigint = 1_000_000n) {
  return {
    domain: {
      name: "USD Coin",
      version: "2",
      chainId: 1,
      verifyingContract:
        "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as `0x${string}`,
    },
    types: {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    primaryType: "Permit" as const,
    message: {
      owner: "0x1111111111111111111111111111111111111111",
      spender: "0x2222222222222222222222222222222222222222",
      value: typeof amount === "bigint" ? amount.toString() : amount,
      nonce: "0",
      deadline: "9999999999",
    },
  };
}

describe("tryDecodeErc2612", () => {
  it("decodes a valid USDC permit", () => {
    const d = tryDecodeErc2612(validPermit() as any);
    assert.ok(d);
    assert.equal(d.standard, "ERC2612");
    assert.equal(d.tokenName, "USD Coin");
    assert.equal(d.owner, "0x1111111111111111111111111111111111111111");
    assert.equal(d.spender, "0x2222222222222222222222222222222222222222");
    assert.equal(d.amount, 1_000_000n);
    assert.equal(d.isUnlimited, false);
  });

  it("flags near-max amount as unlimited", () => {
    // 2^256 - 1 — a common "unlimited approval" sentinel.
    const maxUint256 = (1n << 256n) - 1n;
    const d = tryDecodeErc2612(validPermit(maxUint256) as any);
    assert.ok(d);
    assert.equal(d.isUnlimited, true);
  });

  it("flags almost-max as unlimited (defeats dodge-the-check tricks)", () => {
    const almostMax = (1n << 256n) - 2n;
    const d = tryDecodeErc2612(validPermit(almostMax) as any);
    assert.ok(d);
    assert.equal(d.isUnlimited, true);
  });

  it("does not flag zero as unlimited", () => {
    const d = tryDecodeErc2612(validPermit(0n) as any);
    assert.ok(d);
    assert.equal(d.isUnlimited, false);
  });

  it("returns null for non-Permit primaryType", () => {
    const td = validPermit();
    const mutated = {
      ...td,
      primaryType: "NotPermit",
    };
    assert.equal(tryDecodeErc2612(mutated as any), null);
  });

  it("returns null when required fields are missing", () => {
    const td = validPermit();
    const missing = {
      ...td,
      types: {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          // missing value, nonce, deadline
        ],
      },
    };
    assert.equal(tryDecodeErc2612(missing as any), null);
  });

  it("returns null for non-object input", () => {
    assert.equal(tryDecodeErc2612(null), null);
    assert.equal(tryDecodeErc2612(undefined), null);
  });

  it("returns null if decoding throws (malformed amount)", () => {
    const td = validPermit();
    const broken = {
      ...td,
      message: { ...td.message, value: "not a bigint" },
    };
    assert.equal(tryDecodeErc2612(broken as any), null);
  });
});
