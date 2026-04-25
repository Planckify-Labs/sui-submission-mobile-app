# Task 07 — `verifyTransactionRecord` — PDA fetch + verification

**Status:** Not taken
**Owner:** API (takumipay-api)
**Spec reference:** `solana-contract-integration-spec.md` §5.1, §6.1,
§7.2.

## Why this matters

Product purchase settlement on Solana creates a `TransactionRecord` PDA
on-chain. The API must read this PDA and verify every field matches the
expected booking parameters — the Solana equivalent of the EVM
`verifyTransactionInContract` method. Without this, the API cannot
confirm that a product was actually purchased on-chain.

## Scope

Add to `SolanaVerificationService` (Task 06):

```typescript
async verifyTransactionRecord(args: {
  programId: PublicKey;
  refId: string;
  refIdHash: Uint8Array;
  expectedWalletAddress: string;
  expectedTokenMint: string;
  expectedAmount: string;
  expectedBookingId: string;
  expectedExchangeRateId: string;
  expectedProductVariantId: string;
}): Promise<TakumiPayTransactionRecord>;
```

### Flow

1. Derive `configPda` from `programId`.
2. Derive `txRecordPda` using `refIdHash` (via Task 03 PDA helpers).
3. Fetch account: `program.account.transactionRecord.fetch(txRecordPda)`.
4. If account doesn't exist → throw `TransactionRecordNotFoundError`.
5. Field-by-field verification:
   - `walletAddress` matches `expectedWalletAddress`
   - `tokenMint` matches `expectedTokenMint`
   - `amount` (BN → bigint) matches `expectedAmount`
   - `bookingId` matches `expectedBookingId`
   - `exchangeRateId` (BN → bigint) matches `expectedExchangeRateId`
   - `productVariantId` matches `expectedProductVariantId`
6. Any mismatch → throw `TransactionVerificationMismatchError` with
   the specific field that failed.
7. Return the typed `TakumiPayTransactionRecord`.

## Rules (non-negotiable)

- **BN → bigint conversion at service boundary.** Anchor returns `BN`;
  convert to `bigint` for comparison with string amounts. Use
  `BigInt(bn.toString())`.
- **PublicKey → string comparison.** Use `.toBase58()` for comparison
  with expected string addresses.
- **All fields must match.** Partial verification is a security hole.

## Acceptance

- [ ] Method added to `SolanaVerificationService`.
- [ ] Unit test with mocked `program.account.transactionRecord.fetch`:
      happy path returns typed record.
- [ ] Unit test: mismatch on each field throws specific error.
- [ ] Unit test: account not found throws `TransactionRecordNotFoundError`.

## Out of scope

- Merchant payment verification (Task 08).
- Point deposit verification (Task 09).
- E2E testing against devnet (Task 26).
