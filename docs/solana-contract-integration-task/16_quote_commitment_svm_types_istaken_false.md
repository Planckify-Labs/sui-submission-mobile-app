# Task 16 — `QuoteCommitmentSvm` type + `PaymentIntentResponse` extension

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** `solana-contract-integration-spec.md` §4.6, §10
item 5 (spending limits).

## Why this matters

The existing `QuoteCommitment` in `services/nanopay/types.ts` is
EVM-specific — `tokenAddress: \`0x${string}\`` with ECDSA signing. The
Solana path needs its own type with base58 addresses and Ed25519
signing. Adding `QuoteCommitmentSvm` and extending
`PaymentIntentResponse` unblocks the `pathOnchainSettlementSvm` module
(Task 19) which reads these fields from the intent response.

## Scope

### `services/nanopay/types.ts`

Add alongside the existing `QuoteCommitment` (do not modify existing):

```typescript
export interface QuoteCommitmentSvm {
  refId: string;
  merchantId: string;
  tokenMint: string; // base58 pubkey, or "native" for SOL
  amount: string;
  platformFeeAmount: string;
  fiatAmountMinor: string;
  fiatCurrency: string; // "IDR"
  exchangeRateId: string;
  expiresAt: string; // unix seconds
}
```

### `PaymentIntentResponse` extension

Add optional fields to the existing `PaymentIntentResponse`:

```typescript
export interface PaymentIntentResponse {
  // ... existing fields (quoteCommitment, quoteSignature,
  //     contractAddress for EVM)

  /** Present when path="direct_arc" and chain is Solana. */
  quoteCommitmentSvm?: QuoteCommitmentSvm;
  /** Ed25519 signature over borsh-serialized MerchantQuoteParams. Base64. */
  quoteSignatureSvm?: string;
  /** TakumiPay program ID for onchain settlement. Base58. */
  programId?: string;
  /** Backend Ed25519 signer pubkey. Base58. */
  backendSignerPubkey?: string;
  /** Per-token spending limit from SpendingLimit PDA (§10 item 5). */
  spendingLimit?: {
    maxAmount: string;
    currentSpent: string;
    periodEnd: string;
  };
}
```

## Rules (non-negotiable)

- **Existing EVM types unchanged.** `QuoteCommitment` stays as-is.
  The Solana type is a sibling, not a replacement.
- **Space docking at the type level.** The EVM path module reads
  `intent.quoteCommitment` + `intent.quoteSignature`. The Solana
  module reads `intent.quoteCommitmentSvm` + `intent.quoteSignatureSvm`.
  No shared code inspects both.
- **All amounts as strings.** Consistent with the EVM quote commitment
  pattern — amounts are decimal strings, not bigints, in the API
  response.

## Acceptance

- [ ] `QuoteCommitmentSvm` interface exported from `services/nanopay/types.ts`.
- [ ] `PaymentIntentResponse` extended with 5 optional Solana fields
      (4 core + `spendingLimit`).
- [ ] `pnpm check:syntax` passes — no downstream type errors.
- [ ] `pnpm biome:check` clean.
- [ ] Existing code that reads `quoteCommitment` compiles unchanged.

## Out of scope

- Consuming these types (Task 19).
- API populating these fields (Task 13).
