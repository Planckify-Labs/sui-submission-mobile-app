# Task 13 — Intent creation: Solana quote commitment + Ed25519 signature

**Status:** Not taken
**Owner:** API (takumipay-api)
**Spec reference:** `solana-contract-integration-spec.md` §5.3, §4.6,
§10 item 5 (spending limits).

## Why this matters

When `POST /v1/pay/intents` resolves to `path: "direct_arc"` on a
Solana chain, the response must include `quoteCommitmentSvm`,
`quoteSignatureSvm`, `backendSignerPubkey`, and `programId` — the
Solana counterpart to the EVM `quoteCommitment` + `quoteSignature`
(ECDSA). Without these fields, the mobile app cannot build the
Ed25519 verify instruction or the `processMerchantPayment` instruction.

## Scope

### Intent creation endpoint update

In the `POST /v1/pay/intents` handler (or the service it delegates to),
when the resolved blockchain is non-EVM (Solana):

1. Build `QuoteCommitmentSvm` from the intent parameters:
   ```typescript
   {
     refId: intent.refId,
     merchantId: intent.merchantId,
     tokenMint: resolvedToken.mintAddress, // base58, or "native" for SOL
     amount: quote.amount.toString(),
     platformFeeAmount: quote.platformFeeAmount.toString(),
     fiatAmountMinor: quote.fiatAmountMinor.toString(),
     fiatCurrency: quote.fiatCurrency, // "IDR"
     exchangeRateId: quote.exchangeRateId.toString(),
     expiresAt: quote.expiresAt.toString(), // unix seconds
   }
   ```

2. Convert to `MerchantQuoteParams` and call
   `solanaVerificationService.signMerchantQuote(params)` (Task 10).

3. Base64-encode the 64-byte Ed25519 signature.

4. Add to the response:
   ```typescript
   {
     path: "direct_arc",
     quoteCommitmentSvm: { ... },
     quoteSignatureSvm: base64Signature,
     backendSignerPubkey: keypair.publicKey.toBase58(),
     programId: blockchain.takumiPayProgramId,
   }
   ```

5. **Spending limits (§10 item 5):** Read the `SpendingLimit` PDA for
   the resolved token mint. If a spending limit exists, include it in
   the response so the mobile app can pre-validate before building
   the transaction:
   ```typescript
   {
     spendingLimit?: {
       maxAmount: string;      // max per-tx amount (decimal string)
       currentSpent: string;   // amount already spent in current period
       periodEnd: string;      // unix timestamp when period resets
     };
   }
   ```
   If no `SpendingLimit` PDA exists for the token, omit the field
   (no limit enforced).

6. EVM fields (`quoteCommitment`, `quoteSignature`, `contractAddress`)
   are NOT populated for Solana intents. Each path module asserts its
   own fields at entry (space docking).

### Response DTO update

Extend the `PaymentIntentResponse` DTO with optional Solana fields:

```typescript
quoteCommitmentSvm?: QuoteCommitmentSvm;
quoteSignatureSvm?: string;
programId?: string;
backendSignerPubkey?: string;
spendingLimit?: { maxAmount: string; currentSpent: string; periodEnd: string };
```

## Rules (non-negotiable)

- **EVM path unchanged.** When `blockchain.isEVM`, the existing ECDSA
  signing path runs as-is. The Solana branch is additive.
- **`backendSignerPubkey` must match on-chain `Config.backendSigner`.**
  If possible, verify at boot or intent creation by reading the
  Config PDA. Log a warning if RPC is unreachable.
- **`programId` from `blockchain.takumiPayProgramId`.** Not hardcoded
  — read from the DB row (Task 12).
- **No EVM fields on Solana responses.** Space docking: each path
  module reads its own fields. Mixing them invites bugs.

## Acceptance

- [ ] Solana intent creation returns `quoteCommitmentSvm` +
      `quoteSignatureSvm` + `backendSignerPubkey` + `programId`.
- [ ] EVM intent creation unchanged — existing tests pass.
- [ ] Unit test: mock Solana blockchain row → response contains
      SVM-specific fields, no EVM fields.
- [ ] Unit test: `quoteSignatureSvm` is valid base64, decodes to
      64 bytes.
- [ ] Response DTO has new optional fields.
- [ ] Unit test: when SpendingLimit PDA exists, `spendingLimit` field
      populated in response.
- [ ] Unit test: when no SpendingLimit PDA, field omitted.

## Out of scope

- Mobile consuming these fields (Task 19).
- `signMerchantQuote` implementation (Task 10).
- Prisma schema changes (Task 12).
