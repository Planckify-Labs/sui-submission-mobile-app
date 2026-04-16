/**
 * Unit tests for the local 4-byte calldata decoder.
 *
 * Run from mobile-app root:
 *   node --test --experimental-strip-types services/decoders/calldata.test.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { encodeFunctionData, parseAbiItem } from "viem";

import { decodeCalldata } from "./calldata.ts";

function encode(sig: string, args: readonly unknown[]): `0x${string}` {
  const abi = [parseAbiItem(sig)] as any[];
  return encodeFunctionData({ abi, args: args as any });
}

describe("decodeCalldata — known selectors", () => {
  it("decodes ERC-20 transfer(address,uint256)", () => {
    const data = encode("function transfer(address to, uint256 amount)", [
      "0x1234567890123456789012345678901234567890",
      1_000_000n,
    ]);
    const d = decodeCalldata(data);
    assert.ok(d);
    assert.equal(d.selector, "0xa9059cbb");
    assert.equal(d.functionName, "transfer");
    assert.equal(d.args?.length, 2);
    assert.equal(d.args?.[0]?.name, "to");
    assert.equal(
      d.args?.[0]?.value,
      "0x1234567890123456789012345678901234567890",
    );
    assert.equal(d.args?.[1]?.value, 1_000_000n);
  });

  it("decodes ERC-20 approve(address,uint256)", () => {
    const data = encode("function approve(address spender, uint256 amount)", [
      "0x1111111111111111111111111111111111111111",
      500n,
    ]);
    const d = decodeCalldata(data);
    assert.ok(d);
    assert.equal(d.functionName, "approve");
    assert.equal(d.args?.[0]?.name, "spender");
  });

  it("decodes ERC-20 transferFrom(address,address,uint256)", () => {
    const data = encode(
      "function transferFrom(address from, address to, uint256 amount)",
      [
        "0x1111111111111111111111111111111111111111",
        "0x2222222222222222222222222222222222222222",
        1n,
      ],
    );
    const d = decodeCalldata(data);
    assert.ok(d);
    assert.equal(d.functionName, "transferFrom");
  });
});

describe("decodeCalldata — edge cases", () => {
  it("returns null for null/undefined input", () => {
    assert.equal(decodeCalldata(null), null);
    assert.equal(decodeCalldata(undefined), null);
  });

  it("handles empty data ('0x') as null", () => {
    assert.equal(decodeCalldata("0x"), null);
  });

  it("returns partial info for an unknown selector", () => {
    // Random 4-byte selector + arg bytes.
    const d = decodeCalldata(
      `0xdeadbeef${"00".repeat(64)}` as `0x${string}`,
    );
    assert.ok(d);
    assert.equal(d.selector, "0xdeadbeef");
    assert.equal(d.signature, null);
    assert.equal(d.args, undefined);
  });

  it("truncated-selector data (< 10 chars) still returns selector-only shape", () => {
    const d = decodeCalldata("0xa9");
    assert.ok(d);
    assert.equal(d.signature, null);
  });

  it("falls back gracefully when decode throws (malformed args)", () => {
    // Valid selector but missing args payload. `decodeFunctionData` should
    // throw; we should catch and return selector-only.
    const d = decodeCalldata("0xa9059cbb" as `0x${string}`);
    assert.ok(d);
    assert.equal(d.selector, "0xa9059cbb");
    // signature may be null (decode failed) or populated (viem tolerates
    // some shortness). Either way — must not throw.
  });
});
