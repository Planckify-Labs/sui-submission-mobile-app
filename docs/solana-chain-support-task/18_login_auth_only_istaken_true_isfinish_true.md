# Task 18 — Strip wallet UI from `app/login.tsx`; keep Google button as-is

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** `solana-chain-support-spec.md` §14.1, §14.8.

## Why this matters

Login today doubles as a wallet-creation entry point — "Create New
Wallet", "Import Seed Phrase", "Import Private Key" all live on the
login screen. That's wrong: wallet management is a post-auth concern.
This task makes login auth-only and routes all wallet-management into
`wallet.tsx` (Task 26) via the new sheets (Tasks 22–25).

## Scope

- `app/login.tsx`:
  - Delete the "GET STARTED" card's *Create New Wallet* button and any
    handler that pushed `/wallet-setup`.
  - Delete the entire "IMPORT EXISTING WALLET" card (Seed Phrase +
    Private Key buttons and their `/import-*` pushes).
  - **Keep the *Continue with Google* button as-is.** The
    `handleGoogleSignIn` placeholder alert behavior is preserved —
    real auth is a future session.
  - Wrap the success path: after `googleSignIn.mutateAsync()` resolves,
    if `walletService.loadWalletsFromStorage()` returns zero wallets,
    run the §14.3 bootstrap (see Task 19) before `router.replace("/")`.
- Remove any imports that are now unused (e.g. `WalletSetup` component
  if still imported here — deletion lands in Task 20).

## Rules (non-negotiable)

- **Do not rewire the Google button handler.** The placeholder alert
  stays; only the post-resolution logic changes.
- **Bootstrap runs before navigation.** The home screen must render
  with wallets already populated; no "wallets appear a beat later"
  flicker.
- **Zero-wallet is the only bootstrap trigger.** If wallets exist,
  skip bootstrap and navigate immediately.
- **No sheets mounted on login.** `AddWalletSheet` lives on
  `wallet.tsx` (Task 26).

## Acceptance

- [ ] `login.tsx` shows only the *Continue with Google* button and
      existing branding.
- [ ] Fresh install → login → home shows the auto-minted EVM + Solana
      wallets (step 2-equivalent of §9.3).
- [ ] Returning user with wallets in bundle → login → home, no
      bootstrap re-run.
- [ ] Grep `router.push("/wallet-setup")` / `/import-*` in `login.tsx`
      returns no matches.
- [ ] `pnpm check:syntax` passes.

## Out of scope

- Implementing the bootstrap (Task 19).
- Deleting the routes themselves (Task 20).
- Management hub wiring (Task 26).
