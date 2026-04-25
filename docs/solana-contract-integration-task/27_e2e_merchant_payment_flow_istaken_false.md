# Task 27 — E2E: merchant payment flow (processMerchantPayment + Ed25519)

**Status:** Not taken
**Owner:** Mobile (mobile-app) + API
**Spec reference:** `solana-contract-integration-spec.md` §6.2, §8.1.

## Why this matters

Merchant QRIS payments are the primary revenue flow. This E2E test
validates the most complex Solana integration path: intent creation
with Ed25519 quote signing → mobile Ed25519 verify instruction +
`processMerchantPaymentSol/Token` → API verification via PDA.

## Scope

### Test flow (spec §6.2 diagram)

1. **Mobile** → `POST /v1/pay/intents` (QRIS scan).
2. **API** → Returns intent with `quoteCommitmentSvm`,
   `quoteSignatureSvm` (Ed25519), `backendSignerPubkey`, `programId`.
3. **Mobile** → Build Ed25519 verify instruction
   (`Ed25519Program.createInstructionWithPublicKey`).
4. **Mobile** → Build `processMerchantPaymentSol` or
   `processMerchantPaymentToken` instruction.
5. **Mobile** → Bundle `[ed25519Ix, merchantPaymentIx]` — Ed25519
   at index 0.
6. **Mobile** → `sendAnchorInstruction` → sign and broadcast.
7. **Mobile** → `POST /v1/pay/intents/:id/onchain` with
   `{ txSignature, cluster }`.
8. **API** → `waitForConfirmation` + `verifyMerchantPayment` PDA.
9. **API** → return `{ status: settled }`.

### Test cases

- **Native SOL merchant payment:** Full flow with SOL.
- **SPL token merchant payment:** Full flow with devnet USDC.
- **Ed25519 signature verification:** Verify the on-chain program
  accepts the backend-signed quote via the Ed25519 precompile.
- **Wrong Ed25519 signature:** Tamper with the signature → program
  rejects with `InvalidSignature` or `MissingEd25519Instruction`.
- **Expired quote:** Set `expiresAt` in the past → program rejects
  with `QuoteExpired`.
- **Duplicate refId:** Second payment with same `refId` → rejected.
- **Platform fee:** Verify `PlatformFeeAccount` PDA updated with
  correct fee amount.

### Critical verification

- Ed25519 instruction is index 0 in the broadcasted transaction.
- Borsh serialization of `MerchantQuoteParams` on mobile matches
  what the backend signed.
- `backendSignerPubkey` matches `Config.backendSigner` on-chain.

## Rules (non-negotiable)

- **Real devnet transactions.** No mocks.
- **Ed25519 ordering is the #1 failure mode.** If the instruction
  order is wrong, the program silently reads the wrong sysvar slot.
  Verify by inspecting the raw transaction on Solana Explorer.
- **Quote expiry test is critical.** If the program doesn't enforce
  expiry, stale quotes can be replayed.

## Acceptance

- [ ] SOL merchant payment: full flow succeeds on devnet.
- [ ] SPL token merchant payment: full flow succeeds.
- [ ] Wrong signature: program rejects.
- [ ] Expired quote: program rejects.
- [ ] Duplicate refId: program rejects.
- [ ] Platform fee PDA updated correctly.
- [ ] API `verifyMerchantPayment` returns typed record matching all
      quote params.

## Out of scope

- Product purchase E2E (Task 26).
- Point deposit E2E (Task 28).
- Production deployment (Task 29).
