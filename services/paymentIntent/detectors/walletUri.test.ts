/**
 * Unit tests for `walletUriDetector`.
 *
 * Run with:
 *   node --test --experimental-strip-types services/paymentIntent/detectors/walletUri.test.ts
 *
 * The detector is pure so we register it into the real module-private
 * registry and drive it through `classify()` in a couple of smoke tests,
 * but the bulk of cases call `detect()` directly for speed + clarity.
 */

import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { classify } from "../classify.ts";
import { __resetForTest, register } from "../detectorRegistry.ts";
import { walletUriDetector } from "./walletUri.ts";

const EVM_ADDR = "0x1111111111111111111111111111111111111111";
const EVM_ADDR_2 = "0x2222222222222222222222222222222222222222";
const SOLANA_PUBKEY = "7EYnhQoAwHb9Vz6AbYMfEB6Lq9wGQJ7w9y3vQxN5kJYf";

describe("walletUriDetector", () => {
  beforeEach(() => {
    __resetForTest();
  });

  test("parses bare ethereum: URI without chainId", () => {
    const hit = walletUriDetector.detect(`ethereum:${EVM_ADDR}`);
    assert.ok(hit, "expected a PaymentIntent");
    assert.equal(hit.channel.kind, "wallet");
    if (hit.channel.kind !== "wallet") return;
    assert.equal(hit.channel.namespace, "eip155");
    assert.equal(hit.channel.address, EVM_ADDR);
    assert.equal(hit.channel.target, undefined);
    assert.equal(hit.channel.amount, undefined);
    assert.equal(hit.channel.token, undefined);
  });

  test("parses ethereum: URI with @chainId (decimal)", () => {
    const hit = walletUriDetector.detect(`ethereum:${EVM_ADDR}@137`);
    assert.ok(hit);
    if (hit.channel.kind !== "wallet") return;
    assert.deepEqual(hit.channel.target, {
      namespace: "eip155",
      chainId: 137,
    });
  });

  test("parses ethereum: URI with @chainId in 0x hex form", () => {
    const hit = walletUriDetector.detect(`ethereum:${EVM_ADDR}@0x1`);
    assert.ok(hit);
    if (hit.channel.kind !== "wallet") return;
    assert.deepEqual(hit.channel.target, {
      namespace: "eip155",
      chainId: 1,
    });
  });

  test("parses ethereum: URI with value= query as bigint amount", () => {
    const hit = walletUriDetector.detect(
      `ethereum:${EVM_ADDR}@1?value=1000000000000000000`,
    );
    assert.ok(hit);
    if (hit.channel.kind !== "wallet") return;
    assert.equal(hit.channel.amount, 1000000000000000000n);
    assert.equal(hit.channel.token, undefined);
  });

  test("parses ERC-20 /transfer path: token = URI address, recipient = ?address=", () => {
    const hit = walletUriDetector.detect(
      `ethereum:${EVM_ADDR}@137/transfer?address=${EVM_ADDR_2}&uint256=5000000`,
    );
    assert.ok(hit);
    if (hit.channel.kind !== "wallet") return;
    // ERC-20 transfer: `<addr>` in the URI is the token contract; the
    // ?address= param is the true recipient.
    assert.equal(hit.channel.address, EVM_ADDR_2);
    assert.equal(hit.channel.token, EVM_ADDR);
    assert.equal(hit.channel.amount, 5000000n);
    assert.deepEqual(hit.channel.target, {
      namespace: "eip155",
      chainId: 137,
    });
  });

  test("parses solana: URI with amount and defaults cluster to mainnet-beta", () => {
    const hit = walletUriDetector.detect(`solana:${SOLANA_PUBKEY}?amount=42`);
    assert.ok(hit);
    if (hit.channel.kind !== "wallet") return;
    assert.equal(hit.channel.namespace, "solana");
    assert.equal(hit.channel.address, SOLANA_PUBKEY);
    assert.deepEqual(hit.channel.target, {
      namespace: "solana",
      cluster: "mainnet-beta",
    });
    assert.equal(hit.channel.amount, 42n);
  });

  test("parses solana: URI with spl-token and cluster=devnet", () => {
    const splMint = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
    const hit = walletUriDetector.detect(
      `solana:${SOLANA_PUBKEY}?spl-token=${splMint}&cluster=devnet`,
    );
    assert.ok(hit);
    if (hit.channel.kind !== "wallet") return;
    assert.equal(hit.channel.token, splMint);
    assert.deepEqual(hit.channel.target, {
      namespace: "solana",
      cluster: "devnet",
    });
  });

  test("solana: amount with decimals is dropped (send screen re-parses)", () => {
    const hit = walletUriDetector.detect(`solana:${SOLANA_PUBKEY}?amount=1.5`);
    assert.ok(hit);
    if (hit.channel.kind !== "wallet") return;
    assert.equal(hit.channel.amount, undefined);
  });

  test("ethereum: without a valid address → null", () => {
    assert.equal(walletUriDetector.detect("ethereum:not-an-address"), null);
    assert.equal(walletUriDetector.detect("ethereum:0xabc"), null);
    assert.equal(walletUriDetector.detect("ethereum:"), null);
  });

  test("solana: with too-short pubkey → null", () => {
    assert.equal(walletUriDetector.detect("solana:short"), null);
    assert.equal(walletUriDetector.detect("solana:"), null);
  });

  test("unrelated schemes → null", () => {
    assert.equal(walletUriDetector.detect("https://example.com"), null);
    assert.equal(
      walletUriDetector.detect("bitcoin:1A1zP1eP5QGefi2DMPTfTL"),
      null,
    );
    assert.equal(walletUriDetector.detect(EVM_ADDR), null);
    assert.equal(walletUriDetector.detect(""), null);
  });

  test("empty / non-string input → null", () => {
    // @ts-expect-error runtime guard for non-string raw scans
    assert.equal(walletUriDetector.detect(undefined), null);
    // @ts-expect-error runtime guard for non-string raw scans
    assert.equal(walletUriDetector.detect(null), null);
  });

  test("registers at priority 40 (above walletAddress@50, below structured)", () => {
    assert.equal(walletUriDetector.priority, 40);
    assert.equal(walletUriDetector.name, "walletUri");
  });

  test("integrates via classify() registry", async () => {
    register(walletUriDetector);
    const intent = await classify(`ethereum:${EVM_ADDR}@42161`);
    assert.ok(intent);
    assert.equal(intent.source, "qr");
    if (intent.channel.kind !== "wallet") return;
    assert.deepEqual(intent.channel.target, {
      namespace: "eip155",
      chainId: 42161,
    });
  });
});
