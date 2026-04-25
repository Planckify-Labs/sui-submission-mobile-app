# Task 12 — Prisma schema: Blockchain + OnchainSettlement Solana fields

**Status:** Not taken
**Owner:** API (takumipay-api)
**Spec reference:** `solana-contract-integration-spec.md` §5.5.

## Why this matters

The existing `Blockchain` model assumes EVM-only (chainId is required,
no Solana-specific fields). The `OnchainSettlement` model stores EVM
hex hashes and requires `chainId`. Both need Solana fields before the
verification service and intent creation can work.

## Scope

### `Blockchain` model additions

```prisma
model Blockchain {
  // ... existing fields
  isEVM              Boolean  @default(true)
  solanaCluster      String?  // "mainnet-beta" | "devnet" | "testnet"
  takumiPayProgramId String?  // Solana program ID (base58)
}
```

- `solanaCluster` — identifies the Solana network. Nullable — only
  set for Solana chains.
- `takumiPayProgramId` — the deployed TakumiPay program address.
  Nullable — only set for Solana chains with contract integration.
- `isEVM` should already exist — verify. If not, add with
  `@default(true)` so existing rows are unaffected.

### `OnchainSettlement` model updates

```prisma
model OnchainSettlement {
  // ... existing fields
  txHash         String        // EVM: 0x hex, Solana: base58 signature
  chainId        Int?          // nullable for Solana (was required)
  cluster        String?       // Solana cluster identifier
}
```

- `chainId` → make nullable. Existing EVM rows have it; Solana rows
  use `cluster` instead.
- `cluster` — new nullable field for Solana.
- `txHash` column is already `String` — no type change needed. Just
  document that it now accepts both formats.

### Migration

- Create Prisma migration (`pnpm prisma migrate dev --name add_solana_blockchain_fields`).
- Migration must be backwards-compatible: new fields are nullable,
  existing rows unaffected.
- If `chainId` was `Int` (non-nullable), change to `Int?` — migration
  should `ALTER COLUMN ... DROP NOT NULL`.

## Rules (non-negotiable)

- **Backwards-compatible migration.** Existing EVM data must not break.
  All new fields nullable; `chainId` nullable for Solana rows.
- **No seed data in this task.** Seed data (Solana blockchain row) is
  Phase 4 (Task 25).
- **`solanaQuoteSignerKeypair` NOT in Prisma.** The spec mentions it
  but it's an env var (`SOLANA_QUOTE_SIGNER_PRIVATE_KEY`), not a DB
  field. Secrets never go in the database.

## Acceptance

- [ ] Migration created and applies cleanly.
- [ ] `pnpm prisma generate` succeeds.
- [ ] Existing EVM blockchain rows unaffected.
- [ ] `OnchainSettlement.chainId` is now nullable.
- [ ] New fields (`solanaCluster`, `takumiPayProgramId`, `cluster`)
      present in generated Prisma client.
- [ ] `pnpm run build` succeeds.

## Out of scope

- Seed data for Solana blockchain (Task 25).
- Using these fields in services (Tasks 06/11/13/14).
