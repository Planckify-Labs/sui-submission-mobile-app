# Task 17 — `buildCreateTransaction.ts` — Sol/Token instruction builder

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** `solana-contract-integration-spec.md` §4.3, §6.1,
§8.3, §10 item 4 (SPL approve race).

## Why this matters

Product purchase settlement on Solana requires building a
`createTransactionSol` or `createTransactionToken` instruction for the
TakumiPay Anchor program. This is the mobile-side instruction builder
that uses the types and PDA helpers from Task 02 to construct the
correct instruction for submission via `sendAnchorInstruction` (Task 15).

## Scope

Create `services/nanopay/solana/buildCreateTransaction.ts`:

```typescript
import type { PublicKey, TransactionInstruction } from "@solana/web3.js";
import type { CreateTransactionParams } from "@/services/chains/solana/takumiPay/types";

export function buildCreateTransactionInstruction(params: {
  payer: PublicKey;
  programId: PublicKey;
  tokenMint: PublicKey | null; // null = native SOL
  params: CreateTransactionParams;
  txCounter: bigint; // from Config account, for PDA derivation
}): TransactionInstruction;
```

### Implementation

1. **Variant selection:** Use `isNativeSol(tokenMint)` from Task 02's
   `index.ts` to pick `createTransactionSol` vs
   `createTransactionToken`.

2. **PDA derivation:** Using Task 02's PDA helpers:
   - `deriveConfigPda(programId)`
   - `deriveTxRecordPda(programId, config, txCounter)`
   - `deriveRefRecordPda(programId, config, params.refIdHash)`
   - `deriveSpendingLimitPda(programId, config, tokenMint)` (for Token variant)

3. **Instruction data:** Borsh-serialize `CreateTransactionParams`:
   - `bookingId`, `exchangeRateId`, `productVariantId`, `refId`,
     `refIdHash`, `amount`

4. **Account list:** Explicit accounts per the program's instruction
   definition (from IDL):
   - Sol variant: `payer`, `config`, `txRecord`, `refRecord`,
     `systemProgram`
   - Token variant: adds `tokenMint`, `payerTokenAccount`,
     `vaultTokenAccount`, `tokenProgram`, `spendingLimit`

5. **`refIdHash` computation:** Caller provides pre-computed
   `refIdHash` in `CreateTransactionParams` (from
   `computeRefIdHash(refId)` — Task 02).

6. **SPL token approve + revoke (Token variant only, §10 item 4):**
   For `createTransactionToken`, the user must approve the program's
   vault ATA to spend the exact transfer amount. The builder returns
   **three** instructions for the Token variant:
   - `approve(payerTokenAccount, vaultAta, payer, exactAmount)` — SPL
     Token `approve` instruction with exact amount (never unlimited).
   - The `createTransactionToken` program instruction itself.
   - `revoke(payerTokenAccount, payer)` — revoke the approval after
     the transfer completes.
   All three are bundled in the transaction by the caller. The Sol
   variant does not need approve/revoke (native SOL transfer is
   handled by the system program inside the instruction).

### Config account read helper

The caller needs `txCounter` from the on-chain `Config` account. Add
a helper:

```typescript
export async function fetchTakumiPayConfig(
  connection: Connection,
  programId: PublicKey,
): Promise<TakumiPayConfig>;
```

This reads the Config PDA and deserializes it using the IDL types.

## Rules (non-negotiable)

- **No Anchor client on mobile.** Build the instruction manually from
  IDL types — `TransactionInstruction` with `programId`, `keys`,
  `data`. Do not import `@coral-xyz/anchor` `Program`.
- **Borsh encoding must match contract.** Field order and types must
  match the Rust instruction struct exactly.
- **Sol/Token variant selected by `isNativeSol` helper.** Not by
  string comparison or namespace check.
- **Exact approve amount, never unlimited (§10 item 4).** SPL token
  approval must use the exact transfer amount. Approve before,
  revoke after. This prevents the approve race condition where a
  stale unlimited approval could be exploited.

## Acceptance

- [ ] Function exported from `services/nanopay/solana/buildCreateTransaction.ts`.
- [ ] Config fetch helper works with mocked RPC.
- [ ] Unit test: Sol variant produces correct instruction data and
      account keys.
- [ ] Unit test: Token variant includes token-specific accounts.
- [ ] Unit test: Token variant returns 3 instructions (approve +
      program IX + revoke) with exact amount on approve.
- [ ] `pnpm check:syntax` passes.

## Out of scope

- Broadcasting the instruction (Task 15 + caller code).
- Merchant payment instruction (Task 19).
- Point deposit instruction (Task 18).
