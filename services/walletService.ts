// Review gate — TWV-2026-044 (UserOp hash binds EntryPoint + chainId;
// ECDSA `s` normalisation). Design note:
// docs/smart-account-audit-checklist.md.
//
// Pre-implementation rule for when a UserOp signing path is added here
// (or in a new module): the signing preimage MUST be
// `keccak256(abi.encode(packedUserOp, entryPoint, chainId))` and MUST
// NOT shortcut any field of the struct (including `paymasterAndData`
// and `initCode`). Before use, run the §4 test-vector validation from
// the audit checklist — mismatch marks the account untrusted.
// Client-side low-s normalisation is mandatory regardless of whether
// the account contract enforces it. Any PR that adds UserOp signing
// MUST cite TWV-2026-044 and include the validation.
//
// Review gate — TWV-2026-046 (HW pairing attestation + anti-klepto).
// Design note: docs/hw-pairing-ux-spec.md (§3.4 in particular).
//
// The software signing path in this module is the path that users take
// when they have NOT paired a hardware wallet. It must not be weaker
// than the HW path we are gating. Requirements:
//   - ECDSA nonces are RFC 6979 deterministic (Viem's default — do not
//     regress to a random-nonce scheme).
//   - An auxiliary-entropy leg is mixed in so the nonce is unique
//     even if two sighashes collide (belt-and-braces against
//     deterministic-nonce side channels on a modified JS heap).
//   - No `Math.random` anywhere on this path. CSPRNG only.
// Any PR that changes the nonce / signing algorithm must cite
// TWV-2026-046 and re-confirm these invariants.
//
// Review gate — TWV-2026-057 (Hermes-only RN engine; native-layer signing).
// Design note: docs/wallet-security-task/62_native_signing_design_note.md.
//
// This module is the single blessed site where decrypted key material
// enters the JS heap (`privateKeyToAccount`, `mnemonicToAccount`,
// `generateWalletMnemonic`). Any PR that:
//   - adds a new `privateKeyToAccount` / `mnemonicToAccount` call
//     outside `getAccountForWallet`,
//   - returns a Viem `Account` or the raw key from a public helper,
//   - extends the dwell of `accountCache`,
//   - adds a new seed-material logging or persistence path,
// MUST reference TWV-2026-057 in the PR description and re-confirm the
// JS-heap-dwell-minimisation invariants documented in the design note.
//
// Until the native-signing migration ships, callers must drop account
// references at function exit and must call `clearAccountCache()` on
// lock / logout / wallet removal.

import { entropyToMnemonic, validateMnemonic } from "@scure/bip39";
import { wordlist as englishWordlist } from "@scure/bip39/wordlists/english";
import {
  createKeyPairFromPrivateKeyBytes,
  createSignerFromKeyPair,
  type KeyPairSigner,
} from "@solana/kit";
import {
  type HDAccount,
  mnemonicToAccount,
  type PrivateKeyAccount,
  privateKeyToAccount,
} from "viem/accounts";
import { TWallet } from "@/constants/types/walletTypes";
import { storage } from "@/lib/storage/mmkv";
import { parseSolanaPrivateKey } from "@/services/chains/solana/codec";
import { mnemonicToSolanaPrivateKey } from "@/services/chains/solana/derivation";
import {
  signingSecureGet,
  signingSecureSet,
  walletSecureGet,
  walletSecureSet,
} from "./security/walletSecureStore";

// TWV-2026-002 — fail loud if the CSPRNG polyfill is missing at the point
// walletService is first imported. This is the single blessed call site
// for seed generation; never call `Math.random`, `Date.now()`-seeded PRNGs,
// or bare `new Uint8Array(...)` on any wallet-creation path.
if (typeof globalThis.crypto?.getRandomValues !== "function") {
  throw new Error(
    "walletService loaded before CSPRNG polyfill — `pollyfills.ts` must " +
      "be the first import of `app/_layout.tsx`.",
  );
}

const accountCache: Record<string, HDAccount | PrivateKeyAccount> = {};

let cachedWallets: TWallet[] | null = null;
// TWV-2026-060 — single-flight guard. React Query's retry + any other
// hook firing in parallel on cold start can all enter this function
// before the first pass finishes. Without this mutex, concurrent
// `signingSecureGet` calls race and the OS rejects all but the first
// with "Authentication is already in progress".
let inFlightLoad: Promise<TWallet[]> | null = null;

// TWV-2026-060 storage layout (bundle mode):
//   * `WALLET_BUNDLE_KEY` — the authoritative auth-gated entry holding
//     every wallet record in a single JSON array. ONE biometric prompt
//     unlocks ALL wallets for the session. Adding a 10th or 100th
//     wallet costs the same one prompt to save as adding the first.
//   * `WALLET_INDEX_KEY` — public address list, non-auth. Kept so
//     external code that only needs the addresses (e.g. the active-
//     wallet index bootstrap) doesn't touch the signing store.
//   * `WALLET_PREFIX` — legacy per-wallet keys from the pre-bundle
//     layout. Used only on migration; never written fresh.
//
// Security invariant: the bundle is still gated by
// `SIGNING_SECURE_STORE_OPTIONS` (requireAuthentication: true,
// WHEN_UNLOCKED_THIS_DEVICE_ONLY). A device attacker without the
// current biometric cannot read it. Per-wallet isolation was not a
// security property — every wallet shares the same device, same
// biometric, same process — so collapsing to one entry preserves the
// intent of TWV-2026-060 while fixing the N-prompts UX regression.
const WALLET_BUNDLE_KEY = "wallets_bundle_v1";
const WALLET_INDEX_KEY = "wallet_index";
const WALLET_PREFIX = "wallet_";

// Non-sensitive presence flag in plain MMKV. Exists so the app-shell
// can distinguish "biometric was cancelled on a device that HAS
// wallets" from "fresh install / signed out" — both paths yield an
// empty `wallets` array from `loadWalletsFromStorage`, and only the
// former should route to the lock screen. No wallet material ever
// goes through this key.
const HAS_WALLETS_FLAG_KEY = "takumi.has_wallets";
// Set once the bundle has been rewritten under the auth-free
// SecureStore options (see `walletSecureStore.ts` SIGNING_* comment).
// Absence triggers the one-time re-save on the next successful load.
const LOCK_MIGRATED_FLAG_KEY = "takumi.lock_gate_migrated_v1";

export function hasStoredWallets(): boolean {
  try {
    return storage.getString(HAS_WALLETS_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

function setStoredWalletsFlag(present: boolean): void {
  try {
    if (present) storage.set(HAS_WALLETS_FLAG_KEY, "1");
    else storage.set(HAS_WALLETS_FLAG_KEY, "");
  } catch {
    // MMKV errors aren't fatal — the flag is a best-effort UX hint.
  }
}

function stripAccount(wallet: TWallet): TWallet {
  const { account: _account, ...rest } = wallet;
  return {
    ...rest,
    account: { address: wallet.address },
  } as TWallet;
}

function applyNamespaceBackfill(wallets: TWallet[]): TWallet[] {
  for (const w of wallets) {
    if (!w.namespace) w.namespace = "eip155";
  }
  return wallets;
}

export async function loadWalletsFromStorage(): Promise<TWallet[]> {
  if (cachedWallets) return [...cachedWallets];
  if (inFlightLoad) return inFlightLoad;
  inFlightLoad = (async () => {
    try {
      // 1. Bundle layout (the fast path — ONE prompt on legacy devices).
      const bundleData = await signingSecureGet(WALLET_BUNDLE_KEY);
      if (bundleData) {
        const parsed = JSON.parse(bundleData) as TWallet[];
        cachedWallets = applyNamespaceBackfill(parsed);
        setStoredWalletsFlag(cachedWallets.length > 0);

        // One-time migration from `requireAuthentication: true` to the
        // new app-level gate (LockScreen + `LocalAuthentication`).
        // Rewrites the bundle under the auth-free SecureStore options
        // so subsequent cold starts don't hit the OS biometric sheet
        // at the keystore layer. After this flag flips, users get the
        // full "biometric OR device credential" choice instead of
        // Android's biometric-only `BiometricPrompt`.
        if (!storage.getBoolean(LOCK_MIGRATED_FLAG_KEY)) {
          try {
            await signingSecureSet(
              WALLET_BUNDLE_KEY,
              JSON.stringify(cachedWallets.map(stripAccount)),
            );
            storage.set(LOCK_MIGRATED_FLAG_KEY, true);
          } catch (e) {
            if (__DEV__)
              console.warn("[walletService] lock-gate migration failed:", e);
          }
        }

        return [...cachedWallets];
      }

      // 2. Legacy fallback — migrate per-wallet entries into the bundle.
      // One-time cost: N prompts to read the legacy entries, then one
      // prompt to write the bundle. Subsequent cold starts hit path 1.
      const indexListData = await walletSecureGet(WALLET_INDEX_KEY);
      if (!indexListData) {
        cachedWallets = [];
        return [];
      }
      const walletAddresses = JSON.parse(indexListData) as string[];
      const loaded: TWallet[] = [];
      for (const address of walletAddresses) {
        const walletKey = `${WALLET_PREFIX}${address}`;
        try {
          const walletData = await signingSecureGet(walletKey);
          if (walletData) loaded.push(JSON.parse(walletData) as TWallet);
        } catch (e) {
          // A single unreadable entry (user cancelled auth, legacy
          // accessibility policy mismatch) must not abort the whole
          // migration — the other wallets still surface.
          if (__DEV__)
            console.warn(`[walletService] skipping ${walletKey}:`, e);
        }
      }

      applyNamespaceBackfill(loaded);
      cachedWallets = loaded;

      // Write the bundle so the next cold start takes path 1.
      if (loaded.length > 0) {
        try {
          await signingSecureSet(
            WALLET_BUNDLE_KEY,
            JSON.stringify(loaded.map(stripAccount)),
          );
          // Best-effort legacy cleanup. Each `deleteItemAsync` on an
          // auth-gated key may itself prompt on some Android OEMs, so
          // we swallow errors — orphaned entries don't harm anything
          // and will be garbage-collected if the user uninstalls.
          await walletSecureSet(
            WALLET_INDEX_KEY,
            JSON.stringify(loaded.map((w) => w.address)),
          );
        } catch (e) {
          if (__DEV__) console.warn("[walletService] bundle migrate failed", e);
        }
      }
      return [...loaded];
    } catch (error) {
      console.error("Failed to load wallets:", error);
      return [];
    } finally {
      inFlightLoad = null;
    }
  })();
  return inFlightLoad;
}

// TWV-2026-060 — single-flight guard on saves. A concurrent save
// (e.g. the namespace-backfill path inside `loadWalletsFromStorage`
// firing while the user also adds a wallet) would race on
// `signingSecureSet`, hitting the same "Authentication is already
// in progress" failure mode. Chain every save behind the previous
// one so at most one OS auth session is in flight.
let lastSave: Promise<unknown> = Promise.resolve();

export async function saveWalletsToStorage(
  wallets: TWallet[],
): Promise<boolean> {
  const next = lastSave
    .catch(() => {})
    .then(async () => {
      try {
        cachedWallets = [...wallets];
        const walletAddresses = wallets.map((w) => w.address);
        // Public index (non-auth) — kept so code paths that only need
        // the address list don't touch the signing store.
        await walletSecureSet(
          WALLET_INDEX_KEY,
          JSON.stringify(walletAddresses),
        );
        // TWV-2026-060 bundle mode — ALL wallets written as one
        // auth-gated blob. ONE biometric prompt, regardless of how many
        // wallets the user holds. Adding a 100th wallet is the same
        // cost as adding the first.
        await signingSecureSet(
          WALLET_BUNDLE_KEY,
          JSON.stringify(wallets.map(stripAccount)),
        );
        setStoredWalletsFlag(wallets.length > 0);
        return true;
      } catch (error) {
        console.error("Failed to save wallets:", error);
        // Do NOT null `cachedWallets` here. Doing so would force the
        // next `loadWalletsFromStorage` to hit the signing store again
        // — N more biometric prompts — just because a save failed.
        // The in-memory state already reflects the caller's intent;
        // persistence can retry on the next natural save.
        return false;
      }
    });
  lastSave = next;
  return next;
}

export function getAccountForWallet(
  wallet: TWallet,
): HDAccount | PrivateKeyAccount | null {
  if (accountCache[wallet.address]) {
    return accountCache[wallet.address];
  }

  try {
    let account: HDAccount | PrivateKeyAccount | null = null;

    if (wallet.type === "PrivateKey" && wallet.privateKey) {
      account = privateKeyToAccount(wallet.privateKey as `0x${string}`);
    } else if (wallet.type === "SeedPhrase" && wallet.seedPhrase) {
      account = mnemonicToAccount(wallet.seedPhrase);
    }

    if (account) {
      accountCache[wallet.address] = account;
    }

    return account;
  } catch (error) {
    console.error("Error creating account:", error);
    return null;
  }
}

// Review gate — TWV-2026-070 (Ed25519 signer dwell + polyfill).
// Design note: docs/wallet-security-task/65_solana_signer_design_note.md.
//
// This function is the SINGLE blessed JS-heap dwell site for Solana
// private-key material, analogous to getAccountForWallet for EVM.
// Invariants:
//   - 32-byte seed reconstructed only here; immediately fed to
//     createKeyPairFromPrivateKeyBytes(bytes, { extractable: false }).
//   - The resulting CryptoKey is NOT extractable — the public surface
//     of KeyPairSigner cannot leak the private half.
//   - Cache by address in solanaSignerCache; clearAccountCache wipes
//     both caches on lock/logout/removal.
//   - Never log signer internals. No console.log of `bytes` or `kp`.
// Any PR that:
//   - adds a new createKeyPairFromPrivateKeyBytes call outside here,
//   - returns the raw Uint8Array seed from a public helper,
//   - extends solanaSignerCache dwell,
// MUST cite TWV-2026-070.

const solanaSignerCache: Record<string, KeyPairSigner> = {};

export async function getSolanaSignerForWallet(
  wallet: TWallet,
): Promise<KeyPairSigner | null> {
  if (wallet.namespace !== "solana") return null;
  const cached = solanaSignerCache[wallet.address];
  if (cached) return cached;

  try {
    // Derive the 32-byte ed25519 seed. Strict preference order:
    //   1. `wallet.privateKey` (base58) — both seed-phrase and
    //      private-key Solana wallets store the base58-encoded 32-byte
    //      seed here (see `createSolanaWalletFromMnemonic` /
    //      `createSolanaWalletFromPrivateKey` in `utils/walletUtils.ts`).
    //      This keeps this dwell site independent of BIP-39 derivation.
    //   2. `wallet.seedPhrase` (mnemonic) — defensive fallback for any
    //      hypothetical row that carries a mnemonic but no `privateKey`
    //      (e.g. future shared-mnemonic rows whose private-key field is
    //      intentionally left empty). Mirrors the EVM dwell site's
    //      seed-phrase branch shape.
    // The raw `seed` binding is a local `const` that never escapes this
    // function scope — no closure captures, no return of the bytes.
    let seed: Uint8Array | null = null;
    if (wallet.privateKey) {
      try {
        seed = parseSolanaPrivateKey(wallet.privateKey);
      } catch (_e) {
        if (__DEV__)
          console.error("[TWV-2026-070] Solana privateKey parse failed");
        return null;
      }
    } else if (wallet.seedPhrase) {
      seed = mnemonicToSolanaPrivateKey(wallet.seedPhrase);
    }
    if (!seed) return null;

    // `extractable: false` is enforced by the kit API — the second
    // positional arg is the extractable flag; we pass `false` so the
    // resulting CryptoKey pair cannot leak the private half via
    // `subtle.exportKey`.
    const kp = await createKeyPairFromPrivateKeyBytes(seed, false);
    const signer = await createSignerFromKeyPair(kp);
    solanaSignerCache[wallet.address] = signer;
    return signer;
  } catch (_e) {
    if (__DEV__) console.error("[TWV-2026-070] signer reconstruction failed");
    return null;
  }
}

export function clearAccountCache(): void {
  Object.keys(accountCache).forEach((key) => {
    delete accountCache[key];
  });
  Object.keys(solanaSignerCache).forEach((key) => {
    delete solanaSignerCache[key];
  });
}

export function clearWalletCache() {
  cachedWallets = null;
}

/**
 * Generate a fresh BIP-39 mnemonic whose entropy comes from the OS CSPRNG.
 * Uses `@scure/bip39` + `react-native-get-random-values` (→ iOS
 * `SecRandomCopyBytes` / Android `SecureRandom`). Strength is 128 or 256
 * bits (12- or 24-word mnemonic).
 */
export function generateWalletMnemonic(strength: 128 | 256 = 128): string {
  if (typeof globalThis.crypto?.getRandomValues !== "function") {
    throw new Error("CSPRNG unavailable at mnemonic generation time");
  }
  const entropyBytes = strength / 8;
  const entropy = new Uint8Array(entropyBytes);
  globalThis.crypto.getRandomValues(entropy);
  const mnemonic = entropyToMnemonic(entropy, englishWordlist);
  if (!validateMnemonic(mnemonic, englishWordlist)) {
    throw new Error("generated mnemonic failed BIP-39 checksum");
  }
  return mnemonic;
}
