# Task 14 — `POST /intents/:id/onchain` — Solana support

**Status:** Not taken
**Owner:** API (takumipay-api)
**Spec reference:** `solana-contract-integration-spec.md` §5.4.

## Why this matters

The mobile app calls `POST /v1/pay/intents/:id/onchain` after
broadcasting the on-chain settlement transaction. Today this endpoint
only handles EVM hex hashes. It must also accept Solana base58
signatures and route the verification worker to
`SolanaVerificationService`.

## Scope

### DTO update

```typescript
// OnchainSettlementDto
{
  txHash: string;    // EVM: "0x..." hex, Solana: base58 signature
  chainId?: number;  // nullable for Solana
  cluster?: string;  // "mainnet-beta" | "devnet" — for Solana
}
```

- `chainId` becomes optional in the DTO (was required).
- Add optional `cluster` field.
- Validation: at least one of `chainId` or `cluster` must be present.

### Endpoint handler update

1. Create `OnchainSettlement` row with `txHash`, `chainId` (nullable),
   and `cluster` (nullable).
2. Enqueue the verification job (BullMQ or equivalent).

### Verification worker update

When the worker picks up a Solana settlement job:

1. Resolve blockchain row — check `isEVM`.
2. **EVM** (existing): `waitForTransactionReceipt` +
   `verifyMerchantPaymentInContract` via viem.
3. **Solana** (new):
   - `solanaVerificationService.waitForConfirmation(txHash)`.
   - `solanaVerificationService.verifyMerchantPayment(...)` (or
     `verifyTransactionRecord` depending on the settlement type).
   - Mark settlement as verified on success.
   - On verification failure: mark as failed with error details.

### Error handling

- Solana-specific: `TransactionNotConfirmedError` → retry with backoff.
- Account not found → possible race condition (PDA not yet visible at
  the queried commitment level). Retry once at `"finalized"` before
  failing.

## Rules (non-negotiable)

- **Existing EVM flow untouched.** The worker's EVM branch stays
  as-is. The Solana branch is additive.
- **`txHash` column is already `String`.** No column type change — it
  naturally accepts both hex and base58.
- **Backend discriminates by `blockchain.isEVM` — not by txHash
  format.** Never regex-detect "0x" vs base58.

## Acceptance

- [ ] DTO accepts optional `chainId` + optional `cluster`.
- [ ] Validation: at least one identifier present.
- [ ] `OnchainSettlement` row created with Solana fields.
- [ ] Worker routes to Solana verification when `!blockchain.isEVM`.
- [ ] Existing EVM settlement tests still pass.
- [ ] Unit test: Solana settlement job → `waitForConfirmation` +
      `verifyMerchantPayment` called.

## Out of scope

- `SolanaVerificationService` methods (Tasks 06–09).
- Prisma schema changes (Task 12).
- Mobile sending the request (Task 19).
