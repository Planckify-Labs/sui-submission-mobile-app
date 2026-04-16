/**
 * Unit tests for the EIP-4361 (Sign-In with Ethereum) parser.
 *
 * Run from mobile-app root:
 *   node --test --experimental-strip-types services/decoders/siwe.test.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { tryParseSiwe } from "./siwe.ts";

const MINIMAL_SIWE = [
  "example.com wants you to sign in with your Ethereum account:",
  "0x0000000000000000000000000000000000000001",
  "",
  "URI: https://example.com",
  "Version: 1",
  "Chain ID: 1",
  "Nonce: abc123",
  "Issued At: 2024-01-01T00:00:00Z",
].join("\n");

const FULL_SIWE = [
  "example.com wants you to sign in with your Ethereum account:",
  "0x1234567890AbcdEF1234567890aBcdef12345678",
  "",
  "Welcome to example! Confirm to sign in.",
  "",
  "URI: https://example.com/login",
  "Version: 1",
  "Chain ID: 10",
  "Nonce: deadbeef",
  "Issued At: 2024-01-01T00:00:00Z",
  "Expiration Time: 2024-01-01T00:10:00Z",
  "Not Before: 2023-12-31T23:00:00Z",
  "Request ID: req-123",
  "Resources:",
  "- https://example.com/privacy",
  "- https://example.com/terms",
].join("\n");

describe("tryParseSiwe — minimal valid message", () => {
  it("extracts the required fields", () => {
    const s = tryParseSiwe(MINIMAL_SIWE);
    assert.ok(s);
    assert.equal(s.domain, "example.com");
    assert.equal(s.address, "0x0000000000000000000000000000000000000001");
    assert.equal(s.uri, "https://example.com");
    assert.equal(s.version, "1");
    assert.equal(s.chainId, 1);
    assert.equal(s.nonce, "abc123");
    assert.equal(s.issuedAt, "2024-01-01T00:00:00Z");
    assert.equal(s.statement, undefined);
    assert.deepEqual(s.resources, []);
  });
});

describe("tryParseSiwe — full message with all optional fields", () => {
  it("extracts statement, expiration, notBefore, requestId, resources", () => {
    const s = tryParseSiwe(FULL_SIWE);
    assert.ok(s);
    assert.equal(s.statement, "Welcome to example! Confirm to sign in.");
    assert.equal(s.expirationTime, "2024-01-01T00:10:00Z");
    assert.equal(s.notBefore, "2023-12-31T23:00:00Z");
    assert.equal(s.requestId, "req-123");
    assert.deepEqual(s.resources, [
      "https://example.com/privacy",
      "https://example.com/terms",
    ]);
    assert.equal(s.chainId, 10);
  });
});

describe("tryParseSiwe — negative cases", () => {
  it("returns null for an arbitrary message", () => {
    assert.equal(tryParseSiwe("just a regular message"), null);
  });

  it("returns null when no address follows the header", () => {
    const bad = "example.com wants you to sign in with your Ethereum account:\n";
    assert.equal(tryParseSiwe(bad), null);
  });

  it("returns null when required fields are missing", () => {
    const noUri = [
      "example.com wants you to sign in with your Ethereum account:",
      "0x0000000000000000000000000000000000000001",
      "",
      "Version: 1",
      "Chain ID: 1",
      "Nonce: abc",
      "Issued At: x",
    ].join("\n");
    assert.equal(tryParseSiwe(noUri), null);
  });

  it("returns null on empty string", () => {
    assert.equal(tryParseSiwe(""), null);
  });

  it("returns null on non-string input", () => {
    // @ts-expect-error — deliberately wrong type to prove the guard.
    assert.equal(tryParseSiwe(null), null);
  });

  it("returns null when Chain ID is not a number", () => {
    const bad = [
      "example.com wants you to sign in with your Ethereum account:",
      "0x0000000000000000000000000000000000000001",
      "",
      "URI: https://example.com",
      "Version: 1",
      "Chain ID: not-a-number",
      "Nonce: abc",
      "Issued At: x",
    ].join("\n");
    assert.equal(tryParseSiwe(bad), null);
  });
});
