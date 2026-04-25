# Task 19 — `pathOnchainSettlementSvm.ts` — merchant payment with Ed25519

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** `solana-contract-integration-spec.md` §4.2, §6.2,
§8.1, §10 item 4 (SPL approve race).

## Why this matters

This is the core merchant payment flow for Solana — the counterpart to
`pathOnchainSettlement.ts` (EVM). It takes a payment intent with
`quoteCommitmentSvm` + `quoteSignatureSvm`, builds an Ed25519 verify
instruction + `processMerchantPaymentSol/Token` instruction, signs and
broadcasts via `sendAnchorInstruction`, and reports the tx signature to
the API.

## Scope

Create `services/nanopay/pathOnchainSettlementSvm.ts`:

```typescript
export interface ExecuteOnchainSettlementSvmArgs {
  intent: PaymentIntentResponse;
  wallet: TWallet;
  walletKit: WalletKitAdapter;
  chain: ChainConfig;
  programId: PublicKey;
}

export async function executeOnchainSettlementSvm(
  args: ExecuteOnchainSettlementSvmArgs,
): Promise<ExecuteOnchainSettlementSvmResult>;
```

### Flow (spec §4.2)

1. **Assert** `chain.namespace === "solana"` (entry guard).
2. **Extract** `quoteCommitmentSvm` from `intent`. Assert present.
3. **Compute** `refIdHash = computeRefIdHash(quoteCommitmentSvm.refId)`.
4. **Build** `MerchantQuoteParams` from the quote commitment fields.
5. **Build Ed25519 verify instruction:**
   ```typescript
   Ed25519Program.createInstructionWithPublicKey({
     publicKey: new PublicKey(intent.backendSignerPubkey).toBytes(),
     message: borshSerialize(merchantQuoteParams),
     signature: base64Decode(intent.quoteSignatureSvm),
   });
   ```
6. **Build** `processMerchantPaymentSol` or
   `processMerchantPaymentToken` instruction:
   - Derive all PDAs using `takumiPay/pda`.
   - Select Sol vs Token variant based on `isNativeSol(tokenMint)`.
   - Accounts: `payer`, `config`, `merchantPayment`, `refRecord`,
     `platformFeeAccount`, `spendingLimit`, `tokenMint`,
     `payerTokenAccount`, `merchantTokenAccount`, `platformFeeVault`,
     `tokenProgram`, `systemProgram`, `instructionsSysvar`.
7. **SPL token approve + revoke (Token variant only, §10 item 4):**
   For `processMerchantPaymentToken`, prepend an SPL `approve`
   instruction (exact amount, never unlimited) and append a `revoke`
   instruction. The Sol variant skips this.
8. **Bundle** instructions — Ed25519 MUST be instruction index 0:
   - Sol: `[ed25519Ix, merchantPaymentSolIx]`
   - Token: `[ed25519Ix, approveIx, merchantPaymentTokenIx, revokeIx]`
9. **Call** `walletKit.sendAnchorInstruction(...)`.
10. **POST** tx signature to `POST /v1/pay/intents/:id/onchain`.
11. **Return** result.

### Ed25519 instruction ordering

The Solana program reads the instructions sysvar and expects the
Ed25519 precompile instruction at index 0. If the mobile app places
it elsewhere, the program rejects with `MissingEd25519Instruction`.
The instruction array MUST be `[ed25519Ix, merchantPaymentIx]`.

### Borsh serialization

The message bytes signed by the backend are borsh-serialized
`MerchantQuoteParams`. The mobile app must produce identical bytes
for the Ed25519 verify instruction. Share the serialization logic
or derive it from the same field ordering.

## Rules (non-negotiable)

- **Ed25519 instruction at index 0.** Non-negotiable for on-chain
  verification. Assert in a test.
- **No Solana imports in `pathOnchainSettlement.ts` (EVM).** This is a
  separate, self-contained module. No Solana code leaks into the EVM
  path or shared nanopay code.
- **Three-role separation.** Mobile builds, signs, and broadcasts.
  The API only verifies after the fact (via Task 14).
- **Durable nonce by default for merchant payments.** Use the
  `durableNonce` parameter on `sendAnchorInstruction` (spec §11
  Decision 4).
- **Exact approve amount, never unlimited (§10 item 4).** For Token
  variant, approve the exact payment amount before the program IX,
  revoke immediately after. Ed25519 IX stays at index 0 regardless.

## Acceptance

- [ ] Module created at `services/nanopay/pathOnchainSettlementSvm.ts`.
- [ ] Ed25519 instruction is index 0 in the transaction (unit test).
- [ ] Sol/Token variant correctly selected.
- [ ] All PDAs derived correctly (cross-reference Task 05 fixtures).
- [ ] Token variant includes approve + revoke with exact amount.
- [ ] Ed25519 IX stays at index 0 in both Sol and Token variants.
- [ ] POST to `/intents/:id/onchain` called with tx signature.
- [ ] `pnpm check:syntax` passes.

## Out of scope

- Path selector wiring (Task 20).
- API verification (Tasks 07/08/14).
- Config fetch for state (reuse Task 17's helper).
