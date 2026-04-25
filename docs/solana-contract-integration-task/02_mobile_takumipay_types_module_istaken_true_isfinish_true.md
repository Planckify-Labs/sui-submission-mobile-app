# Task 02 — Mobile `services/chains/solana/takumiPay/` types module

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** `solana-contract-integration-spec.md` §3.2 (Mobile
App section), §8.3, §8.4.

## Why this matters

Every mobile-side instruction builder, PDA derivation, and error
handler depends on typed interfaces derived from the Anchor IDL. This
module is the foundation for all Phase 3 tasks (15–24). Without it,
instruction builders would import raw strings and untyped byte arrays.

## Scope

Create `mobile-app/services/chains/solana/takumiPay/` with:

```
services/chains/solana/takumiPay/
├── idl.ts              ← Copy of IDL JSON exported as `const`
├── types.ts            ← Account, instruction param, and event interfaces
├── pda.ts              ← PDA derivation helpers
├── errors.ts           ← Error code enum with message map
├── refIdHash.ts        ← SHA-256 helper for refId → [u8; 32]
└── index.ts            ← Barrel export
```

### `idl.ts`

Copy from `contract/solana/target/idl/takumi_pay.json` (post Task 01
build). Export as `export const TAKUMI_PAY_IDL = { ... } as const;`.

### `types.ts`

TypeScript interfaces using `@solana/web3.js` `PublicKey` and native
`bigint` (not BN). Covers:

- `TakumiPayConfig`
- `TakumiPayTransactionRecord`
- `TakumiPayMerchantPayment`
- `TakumiPayPointDepositRecord`
- `CreateTransactionParams`
- `MerchantQuoteParams`

See spec §3.2 for full interface definitions.

### `pda.ts`

All PDA derivation functions per spec §3.2:

- `TAKUMI_PAY_PROGRAM_ID` constant
- `deriveConfigPda`, `deriveRefRecordPda`, `deriveTxRecordPda`,
  `deriveMerchantPaymentPda`, `derivePlatformFeePda`,
  `deriveSpendingLimitPda`, `derivePointDepositPda`,
  `derivePointRefRecordPda`, `deriveWithdrawalPda`

Each returns `[PublicKey, number]` (address + bump).

### `errors.ts`

```typescript
export enum TakumiPayError {
  NotOwner = 6000,
  NotAdminOrOwner = 6001,
  // ... all 31 error codes through Overflow = 6030
}
export const TAKUMI_PAY_ERROR_MESSAGES: Record<TakumiPayError, string>;
```

### `refIdHash.ts`

```typescript
import { sha256 } from "@noble/hashes/sha256";

export function computeRefIdHash(refId: string): Uint8Array {
  return sha256(new TextEncoder().encode(refId));
}
```

### `index.ts`

Barrel re-export of all submodules. Also export:

```typescript
export function isNativeSol(tokenMint: PublicKey): boolean {
  return tokenMint.equals(SystemProgram.programId);
}
```

## Rules (non-negotiable)

- **Use `@solana/web3.js` `PublicKey`.** Mobile already depends on
  this — do NOT introduce `@coral-xyz/anchor` types on mobile.
- **Use native `bigint` for numeric fields.** Not `BN`. Mobile code
  consistently uses `bigint` for Solana amounts.
- **No runtime dependency on `@coral-xyz/anchor`.** The IDL is
  consumed as a plain JSON const, not through Anchor's `Program` class.
- **SHA-256 via `@noble/hashes`.** Already in mobile deps — no new
  dependency.
- **PDA seeds must exactly match the Anchor program seeds.** Verify
  seed prefixes against the contract source.

## Acceptance

- [ ] All files created at `services/chains/solana/takumiPay/`.
- [ ] `pnpm check:syntax` passes.
- [ ] `pnpm biome:check` clean.
- [ ] IDL JSON content matches `contract/solana/target/idl/takumi_pay.json`
      byte-for-byte (post Task 01).
- [ ] Every PDA function signature matches spec §3.2.

## Out of scope

- API-side types (Task 03).
- PDA unit tests (Task 05).
- Instruction builders (Tasks 17/18/19).
