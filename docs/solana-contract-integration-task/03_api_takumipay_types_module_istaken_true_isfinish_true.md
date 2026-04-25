# Task 03 — API `src/blockchain-verification/solana/takumi-pay/` types module

**Status:** Not taken
**Owner:** API (takumipay-api)
**Spec reference:** `solana-contract-integration-spec.md` §3.2 (API
section), §5.6, §8.2, §8.4.

## Why this matters

The API verification service (Tasks 06–09) needs typed Anchor account
deserialization. This module provides the IDL, types, PDA helpers, and
error codes — the same information as the mobile module (Task 02) but
tailored to `@coral-xyz/anchor` types (`BN`, `PublicKey`).

## Scope

Create `api/src/blockchain-verification/solana/takumi-pay/` with:

```
src/blockchain-verification/solana/takumi-pay/
├── idl.ts              ← Copy of IDL JSON exported as `const`
├── types.ts            ← Account and verification interfaces
├── pda.ts              ← PDA derivation helpers
├── errors.ts           ← Error code enum
├── ref-id-hash.ts      ← SHA-256 helper
└── index.ts            ← Barrel export
```

### `types.ts`

Uses `@coral-xyz/anchor` `BN` for numeric fields and `@solana/web3.js`
`PublicKey` for addresses. See spec §3.2 API section for:

- `TakumiPayTransactionRecord`
- `TakumiPayMerchantPayment`
- `TakumiPayPointDepositRecord`

### API dependencies

Add to `api/package.json`:

```json
"@coral-xyz/anchor": "^0.31.x",
"@solana/web3.js": "^1.98.x"
```

This relaxes the "no `@solana/web3.js` on backend" constraint from
task 43 — the API now needs `@coral-xyz/anchor` for account
deserialization, which implicitly pulls `@solana/web3.js`.

### `ref-id-hash.ts`

Same SHA-256 logic as mobile but using `@noble/hashes` (add to API
deps if not already present).

## Rules (non-negotiable)

- **Use `@coral-xyz/anchor` types.** `BN` for numerics — Anchor's
  `program.account.*.fetch()` returns `BN`, not `bigint`.
- **PDA seeds must exactly match mobile (Task 02) and contract.**
  Same seeds, same derivation — different SDK types.
- **IDL JSON must be identical to mobile copy and contract canonical.**
  CI check (Task 04) enforces this.
- **NestJS file naming convention.** Use kebab-case (`ref-id-hash.ts`),
  not camelCase.

## Acceptance

- [ ] All files created at `src/blockchain-verification/solana/takumi-pay/`.
- [ ] API compiles with `pnpm run build`.
- [ ] `@coral-xyz/anchor` + `@solana/web3.js` added to `package.json`.
- [ ] IDL JSON matches mobile copy and canonical contract IDL.
- [ ] `pnpm biome:check` clean.

## Out of scope

- Mobile-side types (Task 02).
- Verification service implementation (Tasks 06–09).
- PDA unit tests (Task 05).
