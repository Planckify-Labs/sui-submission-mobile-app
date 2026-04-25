# Task 08 — `verifyMerchantPayment` — MerchantPayment PDA verification

**Status:** Not taken
**Owner:** API (takumipay-api)
**Spec reference:** `solana-contract-integration-spec.md` §5.1, §6.2,
§7.2.

## Why this matters

Merchant QRIS payments on Solana create a `MerchantPayment` PDA
on-chain. The API must verify this PDA after the mobile app broadcasts
the `processMerchantPaymentSol/Token` transaction. This is the Solana
equivalent of the EVM `verifyMerchantPaymentInContract`.

## Scope

Add to `SolanaVerificationService` (Task 06):

```typescript
async verifyMerchantPayment(args: {
  programId: PublicKey;
  refId: string;
  refIdHash: Uint8Array;
  expectedPayer: string;
  expectedMerchantId: string;
  expectedTokenMint: string;
  expectedAmount: string;
  expectedFiatAmountMinor: number;
  expectedFiatCurrency: string;
  expectedExchangeRateId: number;
}): Promise<TakumiPayMerchantPayment>;
```

### Flow

1. Derive `configPda` from `programId`.
2. Derive `merchantPaymentPda` using `refIdHash` (Task 03 PDA helpers).
3. Fetch: `program.account.merchantPayment.fetch(merchantPaymentPda)`.
4. If account doesn't exist → throw `MerchantPaymentNotFoundError`.
5. Field-by-field verification:
   - `payer` matches `expectedPayer`
   - `merchantId` matches `expectedMerchantId`
   - `tokenMint` matches `expectedTokenMint`
   - `amount` (BN → bigint) matches `expectedAmount`
   - `platformFeeAmount` — verify non-negative (no expected value
     from caller; the contract enforces the fee).
   - `fiatAmountMinor` (BN → number) matches `expectedFiatAmountMinor`
   - `fiatCurrency` (3-byte array → string) matches `expectedFiatCurrency`
   - `exchangeRateId` (BN → number) matches `expectedExchangeRateId`
6. Mismatch → throw `MerchantPaymentVerificationMismatchError`.
7. Return the typed `TakumiPayMerchantPayment`.

### `fiatCurrency` conversion

The on-chain account stores `fiatCurrency` as `[u8; 3]` (e.g.,
`[73, 68, 82]` for "IDR"). Convert via
`String.fromCharCode(...account.fiatCurrency)` and compare with the
expected 3-letter currency code.

## Rules (non-negotiable)

- **All fields verified.** Same security posture as EVM verification.
- **`platformFeeAmount` checked for non-negative only.** The exact
  fee is computed on-chain — the API trusts the contract's arithmetic
  but ensures the field isn't garbage data.
- **BN/PublicKey conversion at service boundary.** Same pattern as
  Task 07.

## Acceptance

- [ ] Method added to `SolanaVerificationService`.
- [ ] Unit test: happy path with all fields matching.
- [ ] Unit test: each field mismatch throws specific error.
- [ ] Unit test: `fiatCurrency` byte-array-to-string conversion works.
- [ ] Unit test: account not found throws `MerchantPaymentNotFoundError`.

## Out of scope

- Transaction record verification (Task 07).
- Point deposit verification (Task 09).
- E2E merchant payment flow (Task 27).
