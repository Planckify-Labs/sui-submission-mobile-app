# Task 27 — TWV-2026-070 security design note

**Status:** Not taken
**Owner:** Mobile (mobile-app) — security reviewer sign-off required
**Spec reference:** `solana-chain-support-spec.md` §8, §3.3.

## Why this matters

Every review gate in this codebase has a durable design-note document
so future reviewers can understand the invariant without reading the
original PR. TWV-2026-070 is net-new — Ed25519 boot self-check plus the
Solana signer dwell site — and needs the same treatment as
`62_native_signing_design_note.md`. Without this, the next PR that
touches `getSolanaSignerForWallet` won't know what the gate actually
protects.

## Scope

- Create `docs/wallet-security-task/NN_solana_signer_design_note.md`
  (choose the next unused `NN` in that folder).
- Structure mirrors `62_native_signing_design_note.md`:
  - **Purpose** — why TWV-2026-070 exists (Hermes has no native
    Ed25519; Solana signer must match EVM's TWV-2026-057 dwell
    discipline).
  - **Invariants**, copied from the `walletService.ts` header comment:
    - 32-byte seed reconstructed only in `getSolanaSignerForWallet`.
    - `CryptoKey` is non-extractable.
    - Cache wipes on `clearAccountCache`.
    - No logging of `bytes`, `kp`, or signer internals.
  - **What must cite the gate** — any PR that adds a new
    `createKeyPairFromPrivateKeyBytes` call, returns a raw
    `Uint8Array` from a public helper, extends `solanaSignerCache`
    dwell, or disables the `pollyfills.ts` boot self-check.
  - **Boot self-check rationale** — why fail-loud (§7.1): a missing
    Ed25519 polyfill means silent fallback or throw-at-sign-time;
    neither is acceptable.
  - **Out of scope** — SPL signing (F6), SIWS (F8), hardware-wallet
    Solana (future).
- Cross-link from the `walletService.ts` comment header to the new
  doc's filename (keeps the source-of-truth readable).

## Rules (non-negotiable)

- **Document the why, not the code.** The doc survives code churn —
  if the implementation changes, the invariants above should still
  describe what reviewers must enforce.
- **Follow the existing numbering scheme.** `docs/wallet-security-task/`
  has a consistent `NN_…` convention; pick the next free slot.
- **No secret material in examples.** If the doc includes sample
  code, use placeholder fixtures only.

## Acceptance

- [ ] `docs/wallet-security-task/NN_solana_signer_design_note.md`
      exists and is linked from `services/walletService.ts`'s
      TWV-2026-070 header.
- [ ] Security reviewer approves the doc as an adequate replacement
      for reading the originating PR.
- [ ] Markdown lints cleanly (matches the style of existing security
      docs).

## Out of scope

- Running the manual devnet verification (§9.3) — that's a review-time
  checklist, separately tracked.
- Any code change (the implementation is Task 10).
