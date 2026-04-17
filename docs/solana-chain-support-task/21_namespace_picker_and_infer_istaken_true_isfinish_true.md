# Task 21 — `NamespacePicker` + `inferNamespaceFromKey` shared components

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** `solana-chain-support-spec.md` §14.5, §14.6, §6.1.

## Why this matters

Three of the new sheets (`CreateWalletSheet`, `ImportSeedPhraseSheet`,
`ImportPrivateKeySheet`) all need a chain picker driven by
`walletKitRegistry.getAll()`. Duplicating the UI in each sheet makes
future changes churn-y; a single reusable picker with a single-/multi-
select toggle lands once and gets reused.

## Scope

- `components/wallet/create/NamespacePicker.tsx`:
  - Props: `{ mode: "single" | "multi"; selected: Namespace[]; onChange: (v: Namespace[]) => void; filter?: (kit) => boolean }`.
  - Renders a card per kit from `walletKitRegistry.getAll()` (filtered
    by the optional predicate — e.g. Task 25 passes
    `kit.supportsPrivateKeyImport?.() !== false`).
  - Uses `kit.displayName?.()` / `kit.iconUrl?.()` for labels and
    avatars; falls back to the `namespace` string if unset.
  - Multi-select shows checkboxes with all checked by default (spec
    §14.6 default for create / seed-phrase import).
  - Single-select behaves as radio cards.
- `components/wallet/create/inferNamespaceFromKey.ts` per §14.6:
  ```ts
  export function inferNamespaceFromKey(input: string): Namespace | null {
    const s = input.trim();
    if (/^(0x)?[0-9a-fA-F]{64}$/.test(s)) return "eip155";
    if (/^[1-9A-HJ-NP-Za-km-z]{87,88}$/.test(s)) return "solana";
    return null;
  }
  ```
  - Soft hint only — Task 25 uses it to pre-highlight a card; never
    bypasses the user's explicit pick.
- Unit tests:
  - `NamespacePicker`: renders one card per registered kit; filter
    excludes where returning `false`.
  - `inferNamespaceFromKey`: matches EVM / Solana / returns `null`.

## Rules (non-negotiable)

- **Registry is the source.** Never hard-code `["eip155", "solana"]`
  in the picker — iteration uses `getAll()` so adding Sui is zero edits
  here.
- **Soft inference only.** `inferNamespaceFromKey` is advisory; Task
  25's step-1 picker is still user-confirmed.
- **Stable ordering.** Kits render in registry-insertion order
  (Task 06 registers EVM first, Task 12 registers Solana second).
- **Accessible.** Each card has a readable label and tap target ≥44pt.

## Acceptance

- [ ] `NamespacePicker` renders correctly in both modes under a test
      harness that registers both kits.
- [ ] `inferNamespaceFromKey` test passes golden inputs.
- [ ] `pnpm check:syntax` passes; snapshot test added.

## Out of scope

- Sheets that consume this (Tasks 22–25).
- `addWallets` batch helper (lives inside `useWallet`, wired by the
  sheets that need it — Task 23 / 24).
