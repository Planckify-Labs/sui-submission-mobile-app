/**
 * Unit tests for `inferNamespaceFromKey` (spec §14.6).
 *
 * Run from mobile-app root:
 *   node --test --experimental-strip-types \
 *     components/wallet/create/inferNamespaceFromKey.test.ts
 *
 * Node-only — no react / react-native / viem imports.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { inferNamespaceFromKey } from "./inferNamespaceFromKey.ts";

describe("inferNamespaceFromKey", () => {
  describe("EVM (eip155)", () => {
    it("returns 'eip155' for a 64-char hex string without 0x prefix", () => {
      const key =
        "4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318";
      assert.equal(inferNamespaceFromKey(key), "eip155");
    });

    it("returns 'eip155' for a 64-char hex string with 0x prefix", () => {
      const key =
        "0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318";
      assert.equal(inferNamespaceFromKey(key), "eip155");
    });

    it("returns 'eip155' for uppercase hex", () => {
      const key =
        "0xAABBCCDDEEFF0011223344556677889900112233445566778899AABBCCDDEEFF";
      assert.equal(inferNamespaceFromKey(key), "eip155");
    });

    it("trims surrounding whitespace before matching", () => {
      const key =
        "   0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318  \n";
      assert.equal(inferNamespaceFromKey(key), "eip155");
    });

    it("returns null for 63-char hex (too short)", () => {
      const key = "0".repeat(63);
      assert.equal(inferNamespaceFromKey(key), null);
    });

    it("returns null for 65-char hex (too long, and not base58 length)", () => {
      const key = "0".repeat(65);
      assert.equal(inferNamespaceFromKey(key), null);
    });
  });

  describe("Solana", () => {
    it("returns 'solana' for an 87-char base58 string", () => {
      // Valid base58 alphabet (no 0, O, I, l), length 87.
      const key = "1".repeat(87);
      assert.equal(inferNamespaceFromKey(key), "solana");
    });

    it("returns 'solana' for an 88-char base58 string", () => {
      const key = "1".repeat(88);
      assert.equal(inferNamespaceFromKey(key), "solana");
    });

    it("returns 'solana' for a realistic Phantom-style export", () => {
      // 88 chars, sampled from the base58 alphabet.
      const key =
        "5K3N2vXpQeRt1mLz9WwYx6JdFkHnCbGvUpSrTyAiBcEhDfMgPoN1Qz2Rx3Sy4Tv5Uw6Xa7Yb8Zc9AdBeCfDgEhFi";
      assert.equal(inferNamespaceFromKey(key), "solana");
    });

    it("returns null for base58 of the wrong length (86 chars)", () => {
      const key = "1".repeat(86);
      assert.equal(inferNamespaceFromKey(key), null);
    });

    it("returns null for base58-ish input containing forbidden chars (0, O, I, l)", () => {
      // 88 chars but includes '0' which is not in the base58 alphabet.
      const key = `0${"1".repeat(87)}`;
      assert.equal(inferNamespaceFromKey(key), null);
    });
  });

  describe("null returns", () => {
    it("returns null for a BIP-39 mnemonic (12 words)", () => {
      const mnemonic =
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
      assert.equal(inferNamespaceFromKey(mnemonic), null);
    });

    it("returns null for a BIP-39 mnemonic (24 words)", () => {
      const mnemonic =
        "legal winner thank year wave sausage worth useful legal winner thank year wave sausage worth useful legal winner thank year wave sausage worth title";
      assert.equal(inferNamespaceFromKey(mnemonic), null);
    });

    it("returns null for the empty string", () => {
      assert.equal(inferNamespaceFromKey(""), null);
    });

    it("returns null for whitespace-only input", () => {
      assert.equal(inferNamespaceFromKey("   \n\t  "), null);
    });

    it("returns null for gibberish", () => {
      assert.equal(inferNamespaceFromKey("not a real key, obviously"), null);
    });

    it("returns null for a short hex string (e.g. an address)", () => {
      assert.equal(
        inferNamespaceFromKey("0x1234567890abcdef1234567890abcdef12345678"),
        null,
      );
    });
  });
});
