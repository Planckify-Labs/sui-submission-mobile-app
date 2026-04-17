# Task 16 — `ChainSelector` namespace grouping

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** `solana-chain-support-spec.md` §6.2.

## Why this matters

`ChainSelector` today iterates `supportedChains` as one flat list. With
two Solana entries landing (Task 03), the list grows, and mixing
EVM + Solana + testnets without grouping makes it easy for a user to
accidentally pick the wrong chain. Grouping by namespace gives the
picker structure without breaking the existing agent-busy gate — that
gate fires inside `changeActiveChain`, not inside the selector UI.

## Scope

- `components/common/ChainSelector.tsx`:
  - Group `supportedChains` by `namespace`.
  - Render a section header per namespace — `"Ethereum"` for `eip155`,
    `"Solana"` for `solana` (uses `kit.displayName?.()` when the kit is
    registered; falls back to a hard-coded map for the `eip155` case
    where no EVM-kit name is needed).
  - Preserve the existing test-net grouping within each namespace (EVM
    mainnets first, testnets dimmed; Solana mainnet-beta first, devnet
    dimmed).
  - Keep every existing prop + callback — `onSelect`, busy-state,
    disabled affordances — unchanged.
- `components/common/ChainSelector.test.tsx` (if exists) updated to
  assert the new grouping renders headers and maintains selection flow.

## Rules (non-negotiable)

- **Agent-busy gate is unchanged.** The picker calls `changeActiveChain`
  as today; two-tier gating happens inside `useWallet`.
- **No Solana-specific copy in the EVM group.** Each group's labels
  come from that chain's config; grep for literal `"SOL"` / `"ETH"` to
  catch cross-contamination.
- **Icons respect `chain.iconUrl`.** No hard-coded asset paths.

## Acceptance

- [ ] Opening `ChainSelector` shows two sections: Ethereum + Solana.
- [ ] Switching from an EVM chain to `solana-devnet` during an active
      agent turn still fires the existing "Cancel task & switch" gate.
- [ ] Existing selection UX (checkmark, current chain highlight) is
      intact on both groups.
- [ ] `pnpm check:syntax` passes; snapshot test updated if applicable.

## Out of scope

- The "add custom RPC" flow — not introduced in this spec.
- Per-chain filtering by wallet namespace (future UX polish, not
  blocking v2.3).
