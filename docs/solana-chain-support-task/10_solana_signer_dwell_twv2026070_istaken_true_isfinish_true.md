# Task 10 — `walletService.getSolanaSignerForWallet` + cache (TWV-2026-070)

**Status:** Not taken
**Owner:** Mobile (mobile-app) — security reviewer required
**Spec reference:** `solana-chain-support-spec.md` §3.3, §7.4, §8.

## Why this matters

`walletService.ts` is the single blessed JS-heap dwell site for
decrypted key material (TWV-2026-057). Adding a second namespace means
adding a second *dwell site* under the same discipline — one function
that reconstructs the key, caches the signer, and is the *only* place
`createKeyPairFromPrivateKeyBytes` is called outside of wallet creation.
Any future PR that creates a kit signer elsewhere must cite TWV-2026-070.

## Scope

- Add to `services/walletService.ts`:
  - The TWV-2026-070 header comment block from §7.4 — invariants,
    what MUST cite the gate on modification.
  - `const solanaSignerCache: Record<string, KeyPairSigner> = {};`
  - `getSolanaSignerForWallet(wallet: TWallet): Promise<KeyPairSigner | null>`
    exactly as spec'd in §7.4:
    - Namespace check: non-Solana → `null`.
    - Cache hit → return cached.
    - From `privateKey` (base58): `base58ToBytes`, slice 64→32 if
      needed.
    - From `seedPhrase`: `mnemonicToSolanaPrivateKey`.
    - `createKeyPairFromPrivateKeyBytes(bytes, { extractable: false })`
      → `createSignerFromKeyPair(kp)` → cache → return.
  - Extend `clearAccountCache` to wipe `solanaSignerCache` too per §7.4.
- `services/walletService.test.ts` (extend):
  - Returns `null` for an EVM wallet.
  - Returns a signer whose `.address` equals `wallet.address` for a
    Solana seed-phrase wallet.
  - Second call returns the cached instance (reference equality).
  - `clearAccountCache()` empties both caches.

## Rules (non-negotiable)

- **Single dwell site.** `createKeyPairFromPrivateKeyBytes` is called
  only here (creation-time calls in `walletUtils.ts` are the only other
  allowed site — they do not cache). Grep must confirm.
- **`extractable: false` always.** Never accept a flag to change this.
- **Never log `bytes`, `kp`, `signer` internals.** `console.error` may
  log a failure message, but no secret material.
- **Dev-only error log.** Gate failure logging on `__DEV__` so release
  builds never emit signer errors.
- **Raw seed `Uint8Array` does not escape.** Local variable only; no
  reference returned from a public helper.

## Acceptance

- [ ] Header comment block cites TWV-2026-070 with the full invariant
      list from §7.4.
- [ ] `getSolanaSignerForWallet` and `solanaSignerCache` added;
      `clearAccountCache` wipes the new cache.
- [ ] Unit tests cover null-on-EVM, signer-returned, cache-hit,
      cache-clear.
- [ ] Grep `createKeyPairFromPrivateKeyBytes` shows only this dwell
      site + the two creators in `walletUtils.ts`.
- [ ] Security reviewer approves the diff (TWV-2026-070 gate).
- [ ] `pnpm check:syntax` passes.

## Out of scope

- Kit implementation (Task 12).
- Bridge signer wire-up (Task 17).
- The design-note doc (`docs/wallet-security-task/…`) — Task 27.
