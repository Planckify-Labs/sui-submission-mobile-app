# Task 65 — Solana-signer design note (TWV-2026-070)

**Status:** Design note. Documents the gate implemented in Task 10 of
`docs/solana-chain-support-task/`.
**Companion task file:**
`docs/solana-chain-support-task/27_twv2026070_design_note_istaken_true.md`
**Review gate:** Added as a top-of-file comment in
`services/walletService.ts` above `getSolanaSignerForWallet`. Any PR
that touches the Solana signing path must reference this note.

## 1. Purpose — why TWV-2026-070 exists

Solana's wallet support introduces a new class of secret material into
the mobile app: a 32-byte Ed25519 seed. Two properties of the Hermes
runtime + `@solana/kit` make this non-trivial:

- **Hermes ships without native Ed25519.** Hermes' WebCrypto
  implementation does not include the Ed25519 algorithm. Without the
  `@solana/webcrypto-ed25519-polyfill` shim,
  `subtle.generateKey({ name: "Ed25519" }, …)` throws at runtime and
  every Kit call that derives a key or signs a transaction fails.
- **Solana must match EVM's dwell discipline.** TWV-2026-057
  (`62_native_signing_design_note.md`) declares
  `services/walletService.ts` the single blessed JS-heap dwell site
  for decrypted EVM key material. A Solana signer that reconstructed
  its 32-byte seed in a second place — or returned the bytes to a
  caller — would split that invariant and undo the audit surface
  TWV-2026-057 bought.
- **A silent breakage surfaces far from the cause.** If the Ed25519
  polyfill fails to install, the app looks fine until the first sign
  attempt, which can be hours into a session. A fail-loud boot
  self-check is the only honest behavior.

TWV-2026-070 packages those three requirements into one gate: a single
signer dwell site **and** a boot self-check for the Ed25519 polyfill.

## 2. Invariants

Copied from `services/walletService.ts` (the TWV-2026-070 header
comment above `solanaSignerCache`):

- **32-byte seed reconstructed only in `getSolanaSignerForWallet`.**
  The raw `seed: Uint8Array` binding is a local `const` inside that
  function. No closure captures it, no helper returns it, no callers
  receive it.
- **The derived `CryptoKey` is non-extractable.** The call is
  `createKeyPairFromPrivateKeyBytes(seed, false)` — the second
  positional arg is the `extractable` flag. `subtle.exportKey` on the
  resulting key pair cannot leak the private half.
- **`solanaSignerCache` is cleared by `clearAccountCache`.**
  `clearAccountCache` wipes both `accountCache` (EVM) and
  `solanaSignerCache` (Solana) on lock / logout / wallet-removal. No
  lock path clears only one of the two.
- **No logging of `bytes`, `kp`, or signer internals.** The only
  `console.error` lines on this path are fixed strings tagged
  `[TWV-2026-070]` — they name the failure mode (parse, reconstruction)
  but never the material.

## 3. What must cite this gate on PR review

A PR reviewer blocks and requires a TWV-2026-070 citation in the PR
description for any change that:

- Adds a new `createKeyPairFromPrivateKeyBytes` call **outside**
  `services/walletService.ts::getSolanaSignerForWallet`, **with one
  exception**: the two creation-time calls already resident in
  `utils/walletUtils.ts` (inside `createSolanaWalletFromMnemonic` and
  `createSolanaWalletFromPrivateKey`) — those exist to compute the
  public-key / address at wallet-creation time and are covered by
  §7.3 of the Solana spec. Any *third* call site is a finding.
- Returns a raw `Uint8Array` seed from a public helper — this includes
  returning a `CryptoKeyPair` whose private half is `extractable: true`,
  or surfacing the parsed output of `parseSolanaPrivateKey` outside
  the dwell function.
- Extends or bypasses `solanaSignerCache` — adds a new cache keyed on
  something other than `wallet.address`, introduces a TTL that keeps
  the signer alive across a lock event, or adds a "warm" preload path
  that populates the cache ahead of a user-initiated sign.
- Disables, removes, or weakens the Ed25519 polyfill boot self-check
  in `pollyfills.ts` — including reordering the import so the shim
  lands after any `@solana/*` module, downgrading the self-check to a
  warning, or wrapping it in a `__DEV__` guard.

Any of the above requires a signed-off TWV-2026-070 entry in the PR
description and a security-reviewer approval on the diff.

## 4. Boot self-check rationale

The self-check lives in `pollyfills.ts`:

```ts
// TWV-2026-070 self-check — Ed25519 must be usable at boot.
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
```

The IIFE runs exactly once, at app boot, immediately after the Ed25519
polyfill import. If `subtle.generateKey` with `{ name: "Ed25519" }`
throws, the self-check re-throws with a named, referenced error.

Alternatives considered and rejected:

- **Silent fallback** — e.g. fall back to `@noble/ed25519` and flip a
  boolean. Rejected: invites weaker-entropy substitutes, hides a
  supply-chain regression, and spreads the signing path across two
  implementations (a second audit surface). TWV-2026-002 made the
  same call for the CSPRNG polyfill; this mirrors it.
- **Throw at first sign** — let the app boot and let the first
  `createKeyPairFromPrivateKeyBytes` / `signMessage` raise. Rejected:
  surfaces the bug hours or days into a session, when the user is
  mid-transaction. The stack trace points at the signer, not at the
  actual cause (an import order or version bump). Boot-time is the
  only time at which the failure mode is directly debuggable.
- **Downgrade to a console warning** — the app still works, but a
  warning fires. Rejected on the same grounds as silent fallback:
  warnings are routinely swept to the floor in RN dev-tools.

Fail-loud on boot matches the TWV-2026-002 CSPRNG pattern and keeps
the invariant boring to verify: if the app launches, the polyfill is
installed.

## 5. Related gates

- **TWV-2026-057** — `62_native_signing_design_note.md`. The parent
  invariant that establishes `services/walletService.ts` as the
  single JS-heap dwell site for decrypted key material. TWV-2026-070
  is the Solana-shaped extension of the same discipline; the two
  gates share `clearAccountCache` as their lifecycle hook.
- **TWV-2026-002** — CSPRNG boot self-check (also in
  `pollyfills.ts`). TWV-2026-070 reuses the same "fail loud on boot"
  shape; the two self-checks are intentionally adjacent in the file
  so reviewers see them as a matched pair.
- **TWV-2026-046** — software signing path parity. Ed25519's
  deterministic-nonce property (RFC-8032) plus the non-extractable
  `CryptoKey` together satisfy the parity requirement for the Solana
  path; TWV-2026-070 is the surface that enforces the extractable
  flag.

## 6. Out of scope

The following are intentionally deferred and not protected by
TWV-2026-070. New gates will be added when these land:

- **SPL token signing** — future F6 (`docs/solana-chain-support-spec.md`
  §12). Adds `@solana-program/token` + ATA creation. Will extend the
  signer dwell surface; any PR that introduces SPL transfers must
  re-cite TWV-2026-070 and describe how the new signing path stays
  inside `getSolanaSignerForWallet`.
- **Sign-In With Solana (SIWS)** — future F8. Backend auth currently
  only understands SIWE-EVM. A SIWS path will need its own review
  note because it surfaces a new message-signing entry point.
- **Hardware-wallet Solana** — future. Ledger / hardware-wallet
  Solana signing bypasses the JS-heap dwell entirely; the gate's
  shape will change (no polyfill dependency, no `CryptoKey` at all).
  Tracked separately from TWV-2026-070.

## 7. Cross-reference

- Source of truth for the invariants:
  `services/walletService.ts` (TWV-2026-070 header comment above
  `solanaSignerCache` and `getSolanaSignerForWallet`).
- Boot self-check:
  `pollyfills.ts` (the TWV-2026-070 IIFE after the
  `@solana/webcrypto-ed25519-polyfill` import).
- Sibling dwell-site note (EVM):
  `docs/wallet-security-task/62_native_signing_design_note.md`.
- Spec sections that drove the gate:
  `docs/solana-chain-support-spec.md` §3.3 (security posture to
  preserve) and §8 (security considerations table).
