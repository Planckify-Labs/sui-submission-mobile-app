# Task 09 — `verifyPointDeposit` — PointDepositRecord PDA verification

**Status:** Not taken
**Owner:** API (takumipay-api)
**Spec reference:** `solana-contract-integration-spec.md` §5.1, §6.3,
§7.2.

## Why this matters

Point deposits on Solana create a `PointDepositRecord` PDA on-chain.
The API must verify this PDA to credit points to the user — the Solana
equivalent of the EVM `verifyPointDeposit`.

## Scope

Add to `SolanaVerificationService` (Task 06):

```typescript
async verifyPointDeposit(args: {
  programId: PublicKey;
  refId: string;
  refIdHash: Uint8Array;
  expectedWalletAddress: string;
  expectedTokenMint: string;
  expectedAmount: bigint;
}): Promise<TakumiPayPointDepositRecord>;
```

### Flow

1. Derive `configPda` from `programId`.
2. Derive `pointDepositPda` using `refIdHash` (or `depositId` +
   `configPda` — check contract seeds).
3. Fetch: `program.account.pointDepositRecord.fetch(pointDepositPda)`.
4. If not found → throw `PointDepositNotFoundError`.
5. Verify fields:
   - `walletAddress` matches `expectedWalletAddress`
   - `tokenMint` matches `expectedTokenMint`
   - `amount` (BN → bigint) matches `expectedAmount`
   - `refId` matches the input `refId`
6. Mismatch → throw `PointDepositVerificationMismatchError`.
7. Return the typed `TakumiPayPointDepositRecord`.

## Rules (non-negotiable)

- **Same verification rigor as EVM path.** Every field that the API
  uses to credit points must be verified on-chain.
- **Amount comparison in bigint.** Both the expected and on-chain
  values must be compared as `bigint` to avoid floating-point issues.

## Acceptance

- [ ] Method added to `SolanaVerificationService`.
- [ ] Unit test: happy path returns typed record.
- [ ] Unit test: each field mismatch throws specific error.
- [ ] Unit test: account not found throws `PointDepositNotFoundError`.

## Out of scope

- Transaction record verification (Task 07).
- Merchant payment verification (Task 08).
- E2E point deposit flow (Task 28).
