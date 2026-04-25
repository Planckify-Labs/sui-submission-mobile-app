# Task 28 — E2E: point deposit flow (depositPoints)

**Status:** Not taken
**Owner:** Mobile (mobile-app) + API
**Spec reference:** `solana-contract-integration-spec.md` §6.3.

## Why this matters

Point deposits are user-facing (earn points by depositing tokens) and
must be verified end-to-end before launch. This test validates the
mobile instruction builder, on-chain program, and API verification
for the `depositPoints` flow.

## Scope

### Test flow (spec §6.3 diagram)

1. **Mobile** → Build `depositPoints` instruction (Task 18's builder)
   with `refId`, `refIdHash`, `amount`.
2. **Mobile** → `sendAnchorInstruction` → sign and broadcast.
3. **Mobile** → `POST /points/deposit` with
   `{ txSignature, refId, cluster }`.
4. **API** → `waitForConfirmation(txSignature)`.
5. **API** → `verifyPointDeposit(...)` — fetch PDA, verify fields.
6. **API** → Credit points, return result.

### Test cases

- **Standard deposit:** Deposit SPL tokens → verify
  `PointDepositRecord` PDA contains correct `walletAddress`,
  `tokenMint`, `amount`, `refId`.
- **Duplicate refId:** Second deposit with same `refId` → program
  rejects with `RefIdAlreadyUsed` (the `PointRefRecord` PDA already
  exists).
- **Zero amount:** Program rejects with `ZeroAmount`.
- **Points paused:** If `Config.pointDepositsPaused = true`, program
  rejects with `PointDepositsPaused`.
- **Agent mode deposit:** Execute via `depositPointsSol` agent
  executor (Task 21) → same on-chain result.

## Rules (non-negotiable)

- **Real devnet transactions.** No mocks.
- **Verify PDA data matches API-side expectations.** Don't just
  confirm the tx succeeded — fetch the `PointDepositRecord` and
  compare every field.
- **Test via agent executor too.** The agent path must produce
  identical on-chain state as the direct path.

## Acceptance

- [ ] Standard deposit: mobile → devnet → API verification succeeds.
- [ ] Points credited correctly in API.
- [ ] Duplicate refId rejected.
- [ ] Zero amount rejected.
- [ ] Agent executor `depositPointsSol` produces valid on-chain deposit.

## Out of scope

- Product purchase E2E (Task 26).
- Merchant payment E2E (Task 27).
- Production deployment (Task 29).
