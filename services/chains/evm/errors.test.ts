/**
 * Unit tests for the EIP-1193 error contract (`PROVIDER_ERRORS`).
 * Covers every code from dapp-bridge-spec §10.3.
 *
 * Run from mobile-app root:
 *   node --test --experimental-strip-types services/chains/evm/errors.test.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PROVIDER_ERRORS,
  ProviderRpcError,
  toRpcErrorPayload,
} from "./errors.ts";

describe("ProviderRpcError", () => {
  it("carries code, message, and optional data", () => {
    const e = new ProviderRpcError(4001, "nope", { foo: "bar" });
    assert.equal(e.code, 4001);
    assert.equal(e.message, "nope");
    assert.deepEqual(e.data, { foo: "bar" });
    assert.equal(e.name, "ProviderRpcError");
    assert.ok(e instanceof Error);
  });

  it("omits data when not passed", () => {
    const e = new ProviderRpcError(4200, "x");
    assert.equal(e.data, undefined);
  });
});

describe("PROVIDER_ERRORS — EIP-1193 + EIP-1474 code contract", () => {
  it("4001 userRejected", () => {
    const e = PROVIDER_ERRORS.userRejected();
    assert.equal(e.code, 4001);
  });
  it("4100 unauthorized", () => {
    assert.equal(PROVIDER_ERRORS.unauthorized().code, 4100);
  });
  it("4200 unsupportedMethod includes the method name", () => {
    const e = PROVIDER_ERRORS.unsupportedMethod("eth_foo");
    assert.equal(e.code, 4200);
    assert.match(e.message, /eth_foo/);
  });
  it("4900 disconnected", () => {
    assert.equal(PROVIDER_ERRORS.disconnected().code, 4900);
  });
  it("4901 chainNotConnected", () => {
    assert.equal(PROVIDER_ERRORS.chainNotConnected().code, 4901);
  });
  it("4902 chainNotAdded carries the chain id in message", () => {
    const e = PROVIDER_ERRORS.chainNotAdded(137);
    assert.equal(e.code, 4902);
    assert.match(e.message, /137/);
  });
  it("-32002 resourceUnavailable", () => {
    assert.equal(PROVIDER_ERRORS.resourceUnavailable().code, -32002);
  });
  it("-32602 invalidParams", () => {
    const e = PROVIDER_ERRORS.invalidParams("missing to");
    assert.equal(e.code, -32602);
    assert.match(e.message, /missing to/);
  });
  it("-32603 internalError", () => {
    const e = PROVIDER_ERRORS.internalError("oops");
    assert.equal(e.code, -32603);
    assert.match(e.message, /oops/);
  });
});

describe("toRpcErrorPayload", () => {
  it("preserves code/message/data from ProviderRpcError", () => {
    const p = toRpcErrorPayload(
      new ProviderRpcError(4001, "reject", { nested: true }),
    );
    assert.deepEqual(p, {
      code: 4001,
      message: "reject",
      data: { nested: true },
    });
  });

  it("wraps a plain Error as -32603 internal error", () => {
    const p = toRpcErrorPayload(new Error("kaboom"));
    assert.equal(p.code, -32603);
    assert.equal(p.message, "kaboom");
  });

  it("coerces non-Error values to string", () => {
    const p = toRpcErrorPayload("a string");
    assert.equal(p.code, -32603);
    assert.equal(p.message, "a string");
  });
});
