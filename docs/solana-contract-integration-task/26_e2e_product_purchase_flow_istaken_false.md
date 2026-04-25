# Task 26 — E2E: product purchase flow (createTransaction)

**Status:** Not taken
**Owner:** Mobile (mobile-app) + API
**Spec reference:** `solana-contract-integration-spec.md` §6.1.

## Why this matters

This is the first full end-to-end validation that the mobile
instruction builder, on-chain program, and API verification service
work together for product purchases on Solana.

## Scope

### Test flow (spec §6.1 diagram)

1. **Mobile** → `POST /bookings` → create booking via API.
2. **Mobile** → Build `createTransactionSol` or `createTransactionToken`
   instruction using Task 17's builder.
3. **Mobile** → `sendAnchorInstruction` → sign and broadcast to
   devnet.
4. **Mobile** → `POST /bookings/:id/submit` with `{ txSignature, cluster }`.
5. **API** → `waitForConfirmation(txSignature)`.
6. **API** → `verifyTransactionRecord(...)` — fetch PDA, verify all
   fields match booking params.
7. **API** → return `{ status: confirmed }`.

### Test cases

- **Native SOL purchase:** `createTransactionSol` with SOL amount.
  Verify TransactionRecord PDA on-chain contains correct `bookingId`,
  `amount`, `walletAddress`, `tokenMint = SystemProgram.programId`.
- **SPL token purchase:** `createTransactionToken` with devnet USDC.
  Verify `tokenMint` matches the SPL mint, token balances transferred.
- **Duplicate refId:** Second transaction with same `refId` should
  fail on-chain (`RefIdAlreadyUsed` error).
- **Spending limit:** If a `SpendingLimit` PDA is set for the token,
  verify it's enforced.

### Infrastructure

- Use Solana devnet (Task 25).
- Test wallet pre-funded with SOL + SPL tokens.
- API running locally against devnet RPC.

## Rules (non-negotiable)

- **Real devnet transactions.** No mocks — this is E2E.
- **Verify PDA data, not just tx success.** A successful tx doesn't
  guarantee correct data — fetch and compare every field.
- **Clean up: don't leave stale PDAs.** Use unique `refId` per test
  run to avoid `RefIdAlreadyUsed` collisions.

## Acceptance

- [ ] SOL purchase: mobile → devnet → API verification succeeds.
- [ ] SPL token purchase: same flow, token-specific accounts verified.
- [ ] Duplicate refId rejected by program.
- [ ] API `verifyTransactionRecord` returns typed record matching
      all booking params.

## Out of scope

- Merchant payment E2E (Task 27).
- Point deposit E2E (Task 28).
- Production deployment (Task 29).
