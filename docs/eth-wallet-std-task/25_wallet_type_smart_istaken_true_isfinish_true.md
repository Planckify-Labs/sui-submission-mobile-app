# Task 25 — `TWallet.type` extension for smart accounts

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** `dapp-bridge-spec.md` §6 Phase 1c bullet 1.

## Why this matters

Smart accounts are a different wallet *type*, not a different chain.
EIP-5792 (task 16), ERC-4337 (task 26), and EIP-7702 (task 27) all
branch on this. Landing the type distinction first means adapter
branches, capability reporting, and sheets can all be written against
a stable shape.

## Scope

- Extend `TWallet.type` in `constants/types/walletTypes.ts` to
  include `"Smart4337"` and `"Smart7702"` alongside existing
  `"PrivateKey" | "SeedPhrase" | "Social"`.
- Add per-type fields:
  - `Smart4337`: `{type: "Smart4337"; address: `0x${string}`;
    signerWalletId: string; factory?: string;
    bundlerUrl: string; entryPoint: string}`. `signerWalletId`
    references another `TWallet` (the EOA that holds the session
    key). `entryPoint` pins the account's entry-point version.
  - `Smart7702`: `{type: "Smart7702"; address: `0x${string}`;
    signerWalletId: string; delegator: `0x${string}`;
    authorizationByChain: Record<number, {expiresAt: number}>}`.
    The address is the EOA's own; 7702 delegates code without a
    separate account address.
- `useWallet` exposes:
  - `isSmartAccount(wallet: TWallet): boolean`.
  - `getSigner(wallet: TWallet): TWallet` — returns the underlying
    EOA for smart accounts, the wallet itself for EOAs.
- All existing `TWallet.type` checks in the codebase updated to use
  `isSmartAccount` or explicit branches. Grep `wallet.type ===
  "PrivateKey"` etc. and fix.

## Rules (non-negotiable)

- **Default wallet type stays EOA.** Existing creation flows are
  untouched — no forced migration.
- **Smart wallets require an EOA signer.** Creation UI (separate
  spec) picks or creates an EOA first, then deploys/delegates.
- **Storage migration is a no-op for existing wallets.** They stay
  on `"PrivateKey"` / `"SeedPhrase"` / `"Social"`. No field
  backfill needed.
- **`entryPoint` is explicit.** Don't assume v0.7 — network and
  bundler choices drive this.

## Acceptance

- [ ] Type compiles with the three new literal options.
- [ ] `isSmartAccount` returns correct booleans across all 5 types.
- [ ] `getSigner` resolves smart account → its EOA; EOA → itself.
- [ ] No existing flow regresses (all `PrivateKey` wallets keep
      working exactly as before).
- [ ] `pnpm check:syntax` passes.

## Out of scope

- Smart wallet *creation* UI (tracked in a wallet-creation spec).
- Bundler / delegator selection UI (tasks 26, 27, 28 handle the
  execution side).
