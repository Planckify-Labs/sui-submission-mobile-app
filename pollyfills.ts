// TWV-2026-002 — CSPRNG polyfill MUST stay the first import of this file
// AND this file MUST be the first import of `app/_layout.tsx`. Viem and
// `@scure/bip39` read `globalThis.crypto.getRandomValues` at call time;
// if any Viem-importing module loads before this polyfill, entropy can
// silently collapse to a non-CSPRNG fallback. Enforced by the self-check
// below + `services/walletService.test.ts`.
import "react-native-get-random-values";
import "fastestsmallesttextencoderdecoder";

// Native-JSI crypto — replaces the pure-JS fallbacks viem / @scure / @noble
// use (secp256k1, sha256, keccak256, pbkdf2, HMAC, etc.) with C++ via JSI.
// Order matters: install AFTER the CSPRNG polyfill so the native module's
// RNG picks up `react-native-get-random-values`, and BEFORE any import
// that pulls in `viem/accounts` or `@scure/bip32` so their lazy binding
// to `global.crypto` sees the native implementations.
//
// Impact on this app:
//   - BIP-32 derivation (`mnemonicToAccount`) — ~10× faster on mobile
//   - ECDSA sign / verify — ~10× faster
//   - SHA-256 / keccak256 batch work — ~20× faster
//
// Does NOT accelerate Ed25519 (Solana) — that still goes through the
// WebCrypto polyfill below. See the optional worker-offload in
// `services/cryptoWorker.ts` for the Solana-side speedup.
import { install as installQuickCrypto } from "react-native-quick-crypto";

installQuickCrypto();
// TWV-2026-070 — Ed25519 polyfill MUST load after the CSPRNG polyfill and
// the TextEncoder/TextDecoder shim, and BEFORE any `@solana/kit` import.
// Hermes' WebCrypto ships without Ed25519; without this shim,
// `subtle.generateKey({name:'Ed25519'}, …)` throws at runtime and the
// Solana signing path silently breaks TWV-2026-046 parity.
//
// `@noble/ed25519` (the hash backend the polyfill uses) calls
// `crypto.subtle.digest('SHA-512', …)` via its `etc.sha512Async` hook.
// Hermes does not implement `subtle.digest`, so we install a pure-JS
// SHA-512 (@noble/hashes) BEFORE the polyfill is called. Any later
// mutation of `etc.sha512Async` would silently re-introduce the
// `subtle.digest` dependency, so reviewers should catch edits that
// drop this block.
import * as ed25519 from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2";

ed25519.etc.sha512Async = async (...messages: Uint8Array[]) => {
  let total = 0;
  for (const m of messages) total += m.length;
  const joined = new Uint8Array(total);
  let off = 0;
  for (const m of messages) {
    joined.set(m, off);
    off += m.length;
  }
  return sha512(joined);
};
ed25519.etc.sha512Sync = (...messages: Uint8Array[]) => {
  let total = 0;
  for (const m of messages) total += m.length;
  const joined = new Uint8Array(total);
  let off = 0;
  for (const m of messages) {
    joined.set(m, off);
    off += m.length;
  }
  return sha512(joined);
};

// The react-native entry of this package does NOT auto-install — it
// only exports `install()`. Call it explicitly here so the polyfill
// actually runs. Enforced by the self-check below.
import { install as installEd25519Polyfill } from "@solana/webcrypto-ed25519-polyfill";

installEd25519Polyfill();

// The v2.0.0 polyfill compares `algorithm !== "Ed25519"` with strict
// string equality, but `@solana/keys` (and Firefox) pass the algorithm
// as `{ name: "Ed25519" }` per the WebCrypto spec. When the object
// form is used, the polyfill skips its Ed25519 branch, falls through
// to the native `generateKey`/`importKey` — which doesn't exist on
// Hermes — and throws `TypeError: No native ... function exists`.
// Normalise the algorithm argument to the string form the polyfill
// expects so both call styles reach the polyfill's implementation.
(() => {
  const subtle = (globalThis.crypto as Crypto | undefined)?.subtle as
    | (SubtleCrypto & {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        generateKey: (...args: any[]) => Promise<any>;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        importKey: (...args: any[]) => Promise<any>;
      })
    | undefined;
  if (!subtle) return;
  const normalizeAlg = (algorithm: unknown): unknown => {
    if (
      algorithm &&
      typeof algorithm === "object" &&
      "name" in (algorithm as Record<string, unknown>) &&
      (algorithm as { name: unknown }).name === "Ed25519"
    ) {
      return "Ed25519";
    }
    return algorithm;
  };
  const origGenerateKey = subtle.generateKey.bind(subtle);
  subtle.generateKey = (algorithm: unknown, ...rest: unknown[]) =>
    origGenerateKey(normalizeAlg(algorithm), ...rest);
  const origImportKey = subtle.importKey.bind(subtle);
  subtle.importKey = (
    format: unknown,
    keyData: unknown,
    algorithm: unknown,
    ...rest: unknown[]
  ) => origImportKey(format, keyData, normalizeAlg(algorithm), ...rest);
})();

if (typeof globalThis.crypto?.getRandomValues !== "function") {
  // Fail loud. A missing CSPRNG at boot is a seed-entropy incident —
  // see MetaMask / Trust Wallet Core 2023 post-mortems cited in the spec.
  throw new Error(
    "CSPRNG polyfill missing: `crypto.getRandomValues` is not a function. " +
      "Check that `pollyfills.ts` is imported before any Viem / @scure/bip39 code.",
  );
}

// TWV-2026-021 — freeze the global prototypes before any third-party
// code runs. CVE-2019-10744 (lodash) and friends mutate
// `Object.prototype` to swap addresses / chainIds mid-request; freezing
// removes the class wholesale. Self-check below logs (does not throw)
// if a downstream dep un-freezes it so we can detect regressions
// without bricking the app.
try {
  Object.freeze(Object.prototype);
  Object.freeze(Array.prototype);
  if (!Object.isFrozen(Object.prototype) || !Object.isFrozen(Array.prototype)) {
    console.error(
      "[TWV-2026-021] prototype freeze unstuck — a dep un-froze it. " +
        "Investigate before merging any prototype-pollution-relevant change.",
    );
  }
} catch (e) {
  console.error("[TWV-2026-021] prototype freeze failed:", e);
}

// TWV-2026-070 self-check — Ed25519 must be usable at boot. A missing
// polyfill means Solana key generation silently falls through to a
// non-Ed25519 path or throws at sign time — either way an incident.
// Mirrors the TWV-2026-002 pattern: fail loud, not warn.
(async () => {
  try {
    await crypto.subtle.generateKey(
      { name: "Ed25519" } as unknown as EcKeyGenParams,
      false,
      ["sign", "verify"],
    );
  } catch {
    throw new Error(
      "TWV-2026-070: Ed25519 unavailable at boot — polyfill did not install. " +
        "Verify `@solana/webcrypto-ed25519-polyfill` import order in pollyfills.ts.",
    );
  }
})();
