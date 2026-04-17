/**
 * Unit tests for `deriveWalletsFromMnemonic`.
 *
 * Run from mobile-app root:
 *   node --test --experimental-strip-types \
 *        --import ./services/walletKit/evm/_test-resolver.mjs \
 *        services/walletKit/deriveAll.test.ts
 *
 * Style matches `services/walletKit/boot.test.ts`. The EVM resolver
 * hook is reused because `deriveAll.ts` transitively imports both
 * kits via `bootWalletKits()`, which pull
 * `services/walletService.ts` (→ `expo-secure-store` +
 * `@/lib/storage/mmkv`). The resolver stubs both so the tests run
 * under plain Node.
 */

import assert from "node:assert/strict";
import { before, beforeEach, describe, it } from "node:test";

import { mnemonicToAccount } from "viem/accounts";

import { __resetWalletKitBootForTests, bootWalletKits } from "./boot.ts";
import { deriveWalletsFromMnemonic } from "./deriveAll.ts";
import { walletKitRegistry } from "./registry.ts";

// Phantom-verified golden vector — must match
// `services/walletKit/solana/SolanaWalletKit.test.ts`.
const TEST_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const EXPECTED_SOLANA_ADDRESS = "HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk";

describe("deriveWalletsFromMnemonic (golden vector)", () => {
  before(() => {
    walletKitRegistry.clear();
    __resetWalletKitBootForTests();
    bootWalletKits();
  });

  beforeEach(() => {
    // Registry is populated once in `before()` — kits are stateless so
    // no per-test reset is needed. Left here as an explicit no-op to
    // document intent.
  });

  it("returns one wallet per requested namespace, in input order", async () => {
    const wallets = await deriveWalletsFromMnemonic(TEST_MNEMONIC, [
      "eip155",
      "solana",
    ]);
    assert.equal(wallets.length, 2);
    assert.equal(wallets[0].namespace, "eip155");
    assert.equal(wallets[1].namespace, "solana");
  });

  it("EVM address matches viem's `mnemonicToAccount` for the same mnemonic", async () => {
    const [evmWallet] = await deriveWalletsFromMnemonic(TEST_MNEMONIC, [
      "eip155",
    ]);
    const expected = mnemonicToAccount(TEST_MNEMONIC);
    assert.equal(
      evmWallet.address.toLowerCase(),
      expected.address.toLowerCase(),
    );
  });

  it("Solana address matches the Task 07 golden vector", async () => {
    const [solWallet] = await deriveWalletsFromMnemonic(TEST_MNEMONIC, [
      "solana",
    ]);
    assert.equal(solWallet.address, EXPECTED_SOLANA_ADDRESS);
  });

  it("all returned wallets share the same seedPhrase (== input mnemonic)", async () => {
    const wallets = await deriveWalletsFromMnemonic(TEST_MNEMONIC, [
      "eip155",
      "solana",
    ]);
    for (const w of wallets) {
      assert.equal(w.seedPhrase, TEST_MNEMONIC);
    }
  });

  it("honors the `nameFor` callback for each namespace", async () => {
    const wallets = await deriveWalletsFromMnemonic(
      TEST_MNEMONIC,
      ["eip155", "solana"],
      (ns) => `Test · ${ns}`,
    );
    assert.equal(wallets[0].name, "Test · eip155");
    assert.equal(wallets[1].name, "Test · solana");
  });

  it("returns an empty array when passed no namespaces", async () => {
    const wallets = await deriveWalletsFromMnemonic(TEST_MNEMONIC, []);
    assert.deepEqual(wallets, []);
  });
});
