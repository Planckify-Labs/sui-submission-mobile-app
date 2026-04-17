/**
 * Source-level invariants for walletService — TWV-2026-002 (CSPRNG
 * mnemonic generation), TWV-2026-060 (serialised auth-gated writes),
 * and TWV-2026-070 (Solana Ed25519 signer dwell + extractable: false).
 *
 * The source-inspection suites below don't need the RN module graph.
 * The TWV-2026-070 behavioural suite DOES boot `walletService.ts`, so
 * it has to be run via the EVM resolver hook that stubs
 * `expo-secure-store` and the mmkv storage helper:
 *
 *   node --test --experimental-strip-types \
 *        --import ./services/walletKit/evm/_test-resolver.mjs \
 *        services/walletService.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { entropyToMnemonic, validateMnemonic } from "@scure/bip39";
import { wordlist as englishWordlist } from "@scure/bip39/wordlists/english";

import type { TWallet } from "../constants/types/walletTypes.ts";
import {
  createSolanaWalletFromMnemonic,
  createWalletFromMnemonic,
} from "../utils/walletUtils.ts";
import {
  clearAccountCache,
  getSolanaSignerForWallet,
} from "./walletService.ts";

const src = readFileSync(
  new URL("./walletService.ts", import.meta.url),
  "utf-8",
);

describe("walletService — CSPRNG invariants (TWV-2026-002)", () => {
  it("globalThis.crypto.getRandomValues is a function in the harness", () => {
    assert.equal(typeof globalThis.crypto?.getRandomValues, "function");
  });

  it("source fails loud if the CSPRNG polyfill is missing at import", () => {
    assert.match(
      src,
      /typeof globalThis\.crypto\?\.getRandomValues !== "function"[\s\S]*?throw new Error/,
    );
  });

  it("generateWalletMnemonic routes entropy through crypto.getRandomValues", () => {
    assert.match(
      src,
      /generateWalletMnemonic[\s\S]*?globalThis\.crypto\.getRandomValues\(entropy\)/,
    );
  });

  it("generateWalletMnemonic validates the BIP-39 checksum", () => {
    // Mirror of the production path — verify `@scure/bip39`'s
    // entropy-to-mnemonic produces valid checksums. This is the
    // property the source assertion relies on.
    const entropy = new Uint8Array(16);
    globalThis.crypto.getRandomValues(entropy);
    const m = entropyToMnemonic(entropy, englishWordlist);
    assert.equal(validateMnemonic(m, englishWordlist), true);
  });
});

describe("walletService — TWV-2026-060 bundle storage layout", () => {
  it("defines a bundle-mode key separate from the legacy per-wallet prefix", () => {
    assert.match(src, /WALLET_BUNDLE_KEY\s*=\s*"wallets_bundle_v1"/);
    assert.match(src, /WALLET_INDEX_KEY\s*=\s*"wallet_index"/);
  });

  it("saveWalletsToStorage writes exactly ONE auth-gated entry (the bundle)", () => {
    // Exactly one `signingSecureSet` call on the save path — the
    // bundle. NO per-wallet auth-gated writes (would scale N prompts).
    const saveBlock = src.match(
      /saveWalletsToStorage[\s\S]*?lastSave\s*=\s*next;/,
    );
    assert.ok(saveBlock);
    const sigSetCalls = (saveBlock[0].match(/signingSecureSet/g) ?? []).length;
    assert.equal(
      sigSetCalls,
      1,
      `expected 1 signingSecureSet in save; got ${sigSetCalls}`,
    );
    // The old per-wallet loop must not exist.
    assert.doesNotMatch(
      saveBlock[0],
      /for \(const wallet of wallets\)[\s\S]*?signingSecureSet\(walletKey/,
    );
  });

  it("loadWalletsFromStorage tries the bundle FIRST", () => {
    assert.match(
      src,
      /signingSecureGet\(WALLET_BUNDLE_KEY\)[\s\S]*?if \(bundleData\)/,
    );
  });

  it("loadWalletsFromStorage migrates legacy per-wallet entries to the bundle", () => {
    // Fallback path iterates legacy per-wallet keys and writes the
    // bundle once the migration is done.
    assert.match(
      src,
      /for \(const address of walletAddresses\)[\s\S]*?signingSecureGet\(walletKey\)/,
    );
    assert.match(
      src,
      /signingSecureSet\(\s*WALLET_BUNDLE_KEY,\s*JSON\.stringify/,
    );
  });

  it("WALLET_INDEX_KEY uses the non-auth helper (public address list)", () => {
    assert.match(src, /walletSecureSet\(\s*WALLET_INDEX_KEY/);
    assert.doesNotMatch(src, /signingSecureSet\(\s*WALLET_INDEX_KEY/);
  });
});

describe("walletService — single-flight guards (no prompt cascade)", () => {
  it("loadWalletsFromStorage shares an in-flight promise", () => {
    assert.match(src, /let inFlightLoad:\s*Promise<TWallet\[\]> \| null/);
    assert.match(src, /if \(inFlightLoad\) return inFlightLoad/);
  });

  it("saveWalletsToStorage chains saves via a rolling lastSave promise", () => {
    assert.match(src, /let lastSave:\s*Promise<unknown>/);
    assert.match(src, /lastSave\s*=\s*next/);
  });

  it("save-error path does NOT null cachedWallets", () => {
    // Nulling on every transient save failure forces a full re-read
    // on the next mount — another round of biometric prompts.
    const errorBlock = src.match(
      /catch \(error\)[\s\S]*?Failed to save wallets[\s\S]*?return false/,
    );
    assert.ok(errorBlock);
    assert.doesNotMatch(errorBlock[0], /cachedWallets\s*=\s*null/);
  });
});

/* --------------------------------------------------------------------
 * TWV-2026-070 — Solana signer dwell + cache.
 *
 * Source-level invariants first (match the style of the other suites
 * above), then a small behavioural suite exercising the real dwell
 * function via an in-memory Solana wallet produced by the golden-vector
 * creator in `utils/walletUtils.ts`.
 * ------------------------------------------------------------------ */

describe("walletService — TWV-2026-070 source invariants", () => {
  it("cites the TWV-2026-070 review gate in a header block", () => {
    assert.match(src, /Review gate\s+—\s+TWV-2026-070/);
  });

  it("declares the solanaSignerCache as module-local state", () => {
    assert.match(
      src,
      /const\s+solanaSignerCache:\s*Record<string,\s*KeyPairSigner>\s*=\s*\{\}/,
    );
  });

  it("exports getSolanaSignerForWallet with the Namespace guard first", () => {
    assert.match(
      src,
      /export async function getSolanaSignerForWallet[\s\S]*?if \(wallet\.namespace !== "solana"\) return null/,
    );
  });

  it("the dwell site calls createKeyPairFromPrivateKeyBytes with extractable=false", () => {
    assert.match(
      src,
      /createKeyPairFromPrivateKeyBytes\(\s*seed\s*,\s*false\s*\)/,
    );
  });

  it("failure logs are gated on __DEV__ and do NOT log seed / kp / signer bytes", () => {
    const fn = src.match(
      /export async function getSolanaSignerForWallet[\s\S]*?^}/m,
    );
    assert.ok(fn, "dwell function source block must be present");
    const body = fn[0];
    assert.match(body, /if \(__DEV__\)\s*\n?\s*console\.error/);
    // Never pass the raw key variables as arguments to a log call. We
    // scan for `console.<level>(... <ident> ...)` forms where the ident
    // is one of the three forbidden bindings, but not embedded inside a
    // string literal. We keep it conservative: strip string literals
    // from the body and then regex for the identifier tokens.
    const stripped = body
      .replace(/"(?:\\.|[^"\\])*"/g, '""')
      .replace(/'(?:\\.|[^'\\])*'/g, "''")
      .replace(/`(?:\\.|[^`\\])*`/g, "``");
    assert.doesNotMatch(
      stripped,
      /console\.(log|error|warn)\([^)]*\b(seed|kp|signer)\b[^)]*\)/,
    );
  });

  it("clearAccountCache wipes BOTH accountCache and solanaSignerCache", () => {
    const clear = src.match(/export function clearAccountCache[\s\S]*?^}/m);
    assert.ok(clear);
    assert.match(clear[0], /accountCache/);
    assert.match(clear[0], /solanaSignerCache/);
  });
});

// BIP-39 canonical test mnemonic. The base58 address below is Phantom-
// verified for SLIP-0010 derivation at the default Solana path
// (`m/44'/501'/0'/0'`) — cross-checked by
// `services/chains/solana/derivation.test.ts`.
const TEST_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const EXPECTED_SOLANA_ADDRESS = "HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk";
const EVM_TEST_MNEMONIC =
  "test test test test test test test test test test test junk";

describe("getSolanaSignerForWallet — TWV-2026-070 behavioural", () => {
  it("returns null for an EVM wallet (namespace guard)", async () => {
    const evmWallet = createWalletFromMnemonic(EVM_TEST_MNEMONIC);
    assert.equal(evmWallet.namespace, "eip155");
    const signer = await getSolanaSignerForWallet(evmWallet);
    assert.equal(
      signer,
      null,
      "EVM namespace must not produce a Solana signer",
    );
  });

  it("returns a signer whose .address equals wallet.address for a Solana mnemonic wallet", async () => {
    clearAccountCache();
    const wallet = (await createSolanaWalletFromMnemonic(
      TEST_MNEMONIC,
    )) as TWallet;
    assert.ok(wallet, "golden-vector mnemonic must produce a wallet");
    assert.equal(wallet.namespace, "solana");
    assert.equal(wallet.address, EXPECTED_SOLANA_ADDRESS);

    const signer = await getSolanaSignerForWallet(wallet);
    assert.ok(signer, "expected a KeyPairSigner for a Solana wallet");
    assert.equal(signer.address, wallet.address);
  });

  it("caches the signer — second call returns the SAME instance", async () => {
    clearAccountCache();
    const wallet = (await createSolanaWalletFromMnemonic(
      TEST_MNEMONIC,
    )) as TWallet;
    const sig1 = await getSolanaSignerForWallet(wallet);
    const sig2 = await getSolanaSignerForWallet(wallet);
    assert.ok(sig1 && sig2);
    assert.equal(
      Object.is(sig1, sig2),
      true,
      "cache hit must be reference-equal",
    );
  });

  it("clearAccountCache() wipes the Solana cache — subsequent call returns a NEW instance", async () => {
    clearAccountCache();
    const wallet = (await createSolanaWalletFromMnemonic(
      TEST_MNEMONIC,
    )) as TWallet;
    const sig1 = await getSolanaSignerForWallet(wallet);
    assert.ok(sig1);

    clearAccountCache();

    const sig3 = await getSolanaSignerForWallet(wallet);
    assert.ok(sig3);
    assert.equal(
      Object.is(sig1, sig3),
      false,
      "post-clear call must build a fresh signer",
    );
    // The re-built signer still addresses the same wallet.
    assert.equal(sig3.address, wallet.address);
  });
});
