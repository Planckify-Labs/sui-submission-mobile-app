# Task 07 — `TWallet.namespace` + backfill

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** `dapp-bridge-spec.md` §3 audit row `TWallet has no
namespace`, §4.5.

## Why this matters

Today `TWallet` has no way to distinguish an EVM wallet from a
future Solana wallet. `DappBridge` routes by `namespace`, so every
wallet needs one before adapter dispatch works. Backfill is
load-bearing — existing users already have wallets in SecureStore
and Zustand persist.

## Scope

- Extend `constants/types/walletTypes.ts` `TWallet`:
  ```ts
  namespace: Namespace;        // required; "eip155" for today's wallets
  chainId?: string | number;   // CAIP-2 reference, adapter-interpreted
  ```
- On app boot, inside `useWallet`'s rehydrate path, for any wallet
  without `namespace`, set `namespace: "eip155"` and save back.
- Expose new selectors on `useWallet`:
  - `activeNamespace: Namespace | null`
  - `walletsByNamespace: Record<Namespace, TWallet[]>`
  - `getActiveWalletForNamespace(ns): TWallet | null`
- Update every existing `TWallet` creation site (private key import,
  seed phrase import, social login) to set `namespace: "eip155"`
  explicitly. Grep for `TWallet` literals.

## Rules (non-negotiable)

- **Backfill is idempotent.** Running twice is a no-op.
- **`namespace` is required, not optional.** TypeScript must refuse any
  wallet creation without it. Tests will catch omissions.
- **No runtime checks for "is this wallet undefined-namespace".** After
  one boot, every stored wallet has a namespace.
- **Chain switching still writes to `chainId`** — this task doesn't
  refactor chain-id storage (that's in the existing tech-debt list).

## Acceptance

- [ ] `TWallet.namespace` is required and populated on every wallet in
      storage after first boot.
- [ ] `useWallet.activeNamespace` / `walletsByNamespace` / `getActiveWalletForNamespace`
      exposed and covered by unit tests.
- [ ] Backfill unit test: feed in a wallet array missing `namespace`,
      assert post-hydrate values.
- [ ] `pnpm check:syntax` passes; `pnpm lint` clean.

## Out of scope

- Adding non-EVM wallet creation (Phase 3).
- Migrating chain-id storage to avoid the per-boot RPC fetch
  (tracked in `docs/todolist/technical-deb.md`).
