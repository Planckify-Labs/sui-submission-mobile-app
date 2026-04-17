/**
 * Unit tests for `bootstrapFirstLoginWallets` + `defaultWalletNameFor`.
 *
 * Run from mobile-app root:
 *   node --test --experimental-strip-types \
 *        --import ./services/walletKit/evm/_test-resolver.mjs \
 *        services/walletKit/bootstrap.test.ts
 *
 * Style matches `services/walletKit/boot.test.ts`. The EVM resolver
 * hook is reused because `bootstrap.ts` transitively imports
 * `services/walletService.ts` (`generateWalletMnemonic` dwell site),
 * which pulls `expo-secure-store` + `@/lib/storage/mmkv`. The
 * resolver stubs both so the tests run under plain Node.
 */

import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import { __resetWalletKitBootForTests, bootWalletKits } from "./boot.ts";
import {
  bootstrapFirstLoginWallets,
  defaultWalletNameFor,
} from "./bootstrap.ts";
import { walletKitRegistry } from "./registry.ts";

describe("defaultWalletNameFor", () => {
  it("returns `Main Wallet · ETH` for eip155", () => {
    assert.equal(defaultWalletNameFor("eip155"), "Main Wallet · ETH");
  });

  it("returns `Main Wallet · SOL` for solana", () => {
    assert.equal(defaultWalletNameFor("solana"), "Main Wallet · SOL");
  });

  it("falls back to an uppercase namespace tag for unknown namespaces", () => {
    assert.equal(defaultWalletNameFor("sui"), "Main Wallet · SUI");
  });
});

describe("bootstrapFirstLoginWallets (zero-wallet first login)", () => {
  before(() => {
    walletKitRegistry.clear();
    __resetWalletKitBootForTests();
    bootWalletKits();
  });

  it("returns exactly one wallet per registered kit", async () => {
    const wallets = await bootstrapFirstLoginWallets();
    assert.equal(wallets.length, walletKitRegistry.getAll().length);
    // v2.3 ships EVM + Solana — assert the current registry size
    // to catch accidental kit un-registration in future diffs.
    assert.equal(wallets.length, 2);
  });

  it("each wallet has a non-empty address, a non-empty seedPhrase, and a registered namespace", async () => {
    const wallets = await bootstrapFirstLoginWallets();
    const registeredNamespaces = new Set(
      walletKitRegistry.getAll().map((k) => k.namespace),
    );
    for (const w of wallets) {
      assert.ok(
        typeof w.address === "string" && w.address.length > 0,
        `expected non-empty address for namespace ${w.namespace}`,
      );
      assert.ok(
        typeof w.seedPhrase === "string" && w.seedPhrase.length > 0,
        `expected non-empty seedPhrase for namespace ${w.namespace}`,
      );
      assert.ok(
        registeredNamespaces.has(w.namespace),
        `namespace ${w.namespace} is not in the registry`,
      );
    }
  });

  it("names each wallet via defaultWalletNameFor", async () => {
    const wallets = await bootstrapFirstLoginWallets();
    for (const w of wallets) {
      assert.equal(w.name, defaultWalletNameFor(w.namespace));
    }
  });

  it("all wallets share the same seedPhrase (one mnemonic → N wallets)", async () => {
    const wallets = await bootstrapFirstLoginWallets();
    assert.ok(wallets.length >= 1, "expected at least one wallet");
    const [first, ...rest] = wallets;
    for (const w of rest) {
      assert.equal(
        w.seedPhrase,
        first.seedPhrase,
        `namespace ${w.namespace} seedPhrase diverged from ${first.namespace}`,
      );
    }
  });

  it("produces a fresh mnemonic on each invocation (CSPRNG)", async () => {
    const [a] = await bootstrapFirstLoginWallets();
    const [b] = await bootstrapFirstLoginWallets();
    assert.notEqual(
      a.seedPhrase,
      b.seedPhrase,
      "bootstrap should mint a fresh mnemonic each call",
    );
  });

  it("preserves registry insertion order (EVM first, Solana second)", async () => {
    const wallets = await bootstrapFirstLoginWallets();
    const expected = walletKitRegistry.getAll().map((k) => k.namespace);
    assert.deepEqual(
      wallets.map((w) => w.namespace),
      expected,
    );
  });
});
