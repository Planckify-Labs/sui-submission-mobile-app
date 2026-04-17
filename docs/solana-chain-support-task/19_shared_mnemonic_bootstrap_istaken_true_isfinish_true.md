# Task 19 — Shared-mnemonic bootstrap — `deriveAll.ts` + `bootstrap.ts`

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** `solana-chain-support-spec.md` §14.3, §6.1, §14.6, F7.

## Why this matters

On first sign-in for a zero-wallet account, users should land on home
with functional wallets — not be forced through a setup flow. Option C
(§14.3) auto-mints one `TWallet` per registered kit from a single
BIP-39 mnemonic. Same helper powers Task 24's multi-chain seed-phrase
import and Task 23's create-new flow, so it lives as a shared util.

## Scope

- `services/walletKit/deriveAll.ts`:
  ```ts
  export async function deriveWalletsFromMnemonic(
    mnemonic: string,
    namespaces: Namespace[],
    nameFor?: (ns: Namespace) => string,
  ): Promise<TWallet[]>
  ```
  - For each `ns`, resolve `walletKitRegistry.get(ns)` and call
    `kit.createWalletFromMnemonic(mnemonic, nameFor?.(ns))`.
  - Collect non-null results into an array; preserve input order.
  - Every returned wallet shares `seedPhrase` and has the correct
    `namespace`.
- `services/walletKit/bootstrap.ts`:
  ```ts
  export async function bootstrapFirstLoginWallets(): Promise<TWallet[]>
  ```
  per §14.3:
  - `mnemonic = generateWalletMnemonic(128)` (TWV-2026-002 CSPRNG).
  - `namespaces = walletKitRegistry.getAll().map(k => k.namespace)`.
  - Call `deriveWalletsFromMnemonic(mnemonic, namespaces, defaultWalletNameFor)`.
  - Returns wallets; **caller** (Task 18) persists via
    `walletService.saveWalletsToStorage`.
- Add `defaultWalletNameFor(ns: Namespace): string` next to the
  bootstrap — e.g. `"Main Wallet · ETH"` / `"Main Wallet · SOL"`.
- `services/walletKit/deriveAll.test.ts`: golden-vector test — known
  mnemonic through both kits yields known EVM + Solana addresses.
- `services/walletKit/bootstrap.test.ts`: zero-wallet bootstrap
  produces one wallet per registered kit, all sharing `seedPhrase`,
  all with valid per-kit addresses.

## Rules (non-negotiable)

- **One mnemonic for N wallets.** All rows share `seedPhrase`. §10
  formal `derivationGroupId` linkage is F7 — not in this task.
- **CSPRNG only.** The bootstrap calls `generateWalletMnemonic` — it
  does not generate entropy itself.
- **Idempotent caller contract.** Bootstrap returns wallets; it does
  not persist. The caller decides when/if to save.
- **Namespace list from registry.** When Sui/Bitcoin register later,
  bootstrap automatically mints them too (§14.3 last bullet).
- **No mnemonic display.** Per §14.3, the auto-minted mnemonic is
  **not** shown during bootstrap. Users see a soft banner on
  `wallet.tsx` prompting them to back it up (Task 26 / future settings
  flow).

## Acceptance

- [ ] Both modules exported; tests pass.
- [ ] After Task 18 wires bootstrap in, a fresh sim → Google login →
      home shows two wallets (EVM + Solana) named via `defaultWalletNameFor`.
- [ ] All auto-minted wallets have `seedPhrase` equal to the same
      mnemonic (assert via a dev-only helper; never log in prod).
- [ ] `pnpm check:syntax` passes; `pnpm run test` passes.

## Out of scope

- Login success-path wiring (Task 18).
- Management-hub empty-state (Task 26).
- Mnemonic backup gate / verify-words step in settings — follow-up.
