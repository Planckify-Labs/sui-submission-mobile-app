# Task 18 — `buildDepositPoints.ts` — depositPoints instruction builder

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** `solana-contract-integration-spec.md` §4.4, §6.3.

## Why this matters

Point deposits on Solana require building a `depositPoints` instruction
for the TakumiPay Anchor program. This instruction builder is used by
both the pay-merchant flow and the agent executor
(`deposit_points_sol` in Task 21).

## Scope

Create `services/nanopay/solana/buildDepositPoints.ts`:

```typescript
import type { PublicKey, TransactionInstruction } from "@solana/web3.js";

export function buildDepositPointsInstruction(params: {
  payer: PublicKey;
  programId: PublicKey;
  tokenMint: PublicKey;
  refId: string;
  amount: bigint;
  pointDepositCounter: bigint; // from Config account
}): TransactionInstruction;
```

### Implementation

1. **Compute `refIdHash`:** `computeRefIdHash(params.refId)` from
   Task 02's `refIdHash.ts`.

2. **PDA derivation:** Using Task 02's PDA helpers:
   - `deriveConfigPda(programId)`
   - `derivePointDepositPda(programId, config, pointDepositCounter)`
   - `derivePointRefRecordPda(programId, config, refIdHash)`

3. **Instruction data:** Borsh-serialize:
   - `refId: string`
   - `refIdHash: [u8; 32]`
   - `amount: u64`

4. **Account list:** From IDL:
   - `payer`, `config`, `pointDepositRecord`, `pointRefRecord`,
     `tokenMint`, `payerTokenAccount`, `vaultTokenAccount`,
     `tokenProgram`, `systemProgram`

5. **`pointDepositCounter`** comes from the Config account (same
   `fetchTakumiPayConfig` helper from Task 17).

## Rules (non-negotiable)

- **No Anchor client on mobile.** Manual `TransactionInstruction`
  construction from IDL types.
- **`tokenMint` is always an SPL token.** Point deposits don't accept
  native SOL (the contract requires a token mint). No Sol/Token
  variant — only the token path.
- **`refIdHash` computed inside the function.** The caller passes
  `refId`; the builder computes the hash.

## Acceptance

- [ ] Function exported from `services/nanopay/solana/buildDepositPoints.ts`.
- [ ] Unit test: correct instruction data and account keys.
- [ ] Unit test: `refIdHash` matches `computeRefIdHash(refId)`.
- [ ] `pnpm check:syntax` passes.

## Out of scope

- Broadcasting (Task 15 + caller).
- Agent executor using this builder (Task 21).
- E2E testing (Task 28).
