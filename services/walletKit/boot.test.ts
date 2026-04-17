/**
 * Unit tests for `bootWalletKits`.
 *
 * Run from mobile-app root:
 *   node --test --experimental-strip-types \
 *        --import ./services/walletKit/evm/_test-resolver.mjs \
 *        services/walletKit/boot.test.ts
 *
 * Style matches `services/walletKit/registry.test.ts`. The EVM resolver
 * hook is reused because `boot.ts` transitively imports
 * `EvmWalletKit` → `services/walletService.ts`, which pulls
 * `expo-secure-store` / `@/lib/storage/mmkv`. The resolver stubs both so
 * the tests run under plain Node.
 */

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { __resetWalletKitBootForTests, bootWalletKits } from "./boot.ts";
import { walletKitRegistry } from "./registry.ts";

describe("bootWalletKits", () => {
  beforeEach(() => {
    walletKitRegistry.clear();
    __resetWalletKitBootForTests();
  });

  it("registers the EVM kit under the eip155 namespace", () => {
    bootWalletKits();
    assert.equal(walletKitRegistry.has("eip155"), true);
  });

  it("registers the Solana kit under the solana namespace", () => {
    bootWalletKits();
    assert.equal(walletKitRegistry.has("solana"), true);
  });

  it("the registered EVM kit reports namespace === 'eip155'", () => {
    bootWalletKits();
    const kit = walletKitRegistry.get("eip155");
    assert.equal(kit.namespace, "eip155");
  });

  it("the registered Solana kit reports namespace === 'solana'", () => {
    bootWalletKits();
    const kit = walletKitRegistry.get("solana");
    assert.equal(kit.namespace, "solana");
  });

  it("registers exactly two kits with eip155 first (insertion order)", () => {
    bootWalletKits();
    const kits = walletKitRegistry.getAll();
    assert.equal(kits.length, 2);
    assert.equal(kits[0].namespace, "eip155");
    assert.equal(kits[1].namespace, "solana");
  });

  it("is idempotent — calling twice does not double-register", () => {
    bootWalletKits();
    bootWalletKits();
    assert.equal(walletKitRegistry.getAll().length, 2);
  });
});
