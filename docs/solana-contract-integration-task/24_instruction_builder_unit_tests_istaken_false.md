# Task 24 — Unit tests: instruction encoding, Ed25519 ordering, variant selection

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** `solana-contract-integration-spec.md` §4.2, §4.3,
§4.4, §8.1, §8.3, §10 items 3/4.

## Why this matters

Instruction encoding bugs are silent until on-chain execution fails —
borsh field ordering, PDA derivation, and Ed25519 instruction placement
must be verified before any devnet or mainnet testing. These unit tests
catch encoding mismatches at build time.

## Scope

### `services/nanopay/solana/__tests__/buildCreateTransaction.test.ts`

- **Sol variant:** Build instruction for native SOL → verify:
  - Instruction data borsh-decodes to expected `CreateTransactionParams`.
  - Account keys include `systemProgram`, NOT `tokenProgram`.
  - PDA addresses match Task 05 fixtures.
- **Token variant:** Build instruction for SPL token → verify:
  - Account keys include `tokenProgram`, `tokenMint`,
    `payerTokenAccount`, `vaultTokenAccount`, `spendingLimit`.
  - Token-2022 program ID accepted as `tokenProgram`.
  - Returns 3 instructions: approve (exact amount) + program IX +
    revoke (§10 item 4).
  - Approve amount matches `CreateTransactionParams.amount` exactly.
- **Variant selection:** `isNativeSol(SystemProgram.programId)` →
  Sol; `isNativeSol(USDC_MINT)` → Token.
- **Sol variant has no approve/revoke:** Only 1 instruction returned.

### `services/nanopay/solana/__tests__/buildDepositPoints.test.ts`

- Correct instruction data for `depositPoints`.
- `refIdHash` in instruction data matches `computeRefIdHash(refId)`.
- Account keys include token-related accounts.
- `pointDepositCounter` used in PDA derivation.

### `services/nanopay/__tests__/pathOnchainSettlementSvm.test.ts`

- **Ed25519 instruction ordering:** The Ed25519 verify instruction
  MUST be at index 0 in the instruction array passed to
  `sendAnchorInstruction`. Verify with a mock that captures the
  `instructions` arg.
- **Borsh serialization consistency:** Serialize `MerchantQuoteParams`
  on mobile → compare byte output against a known fixture (ideally
  from the contract test suite).
- **Entry guard:** Assert throws when `chain.namespace !== "solana"`.
- **POST to onchain endpoint:** Mock API call, verify tx signature
  is sent.
- **Token variant approve/revoke (§10 item 4):** Mock captures full
  instruction array → verify approve (exact amount) before program
  IX, revoke after. Ed25519 still at index 0.

### Agent executor tests

- `services/agent-executors/__tests__/solanaTakumiPay.test.ts`:
  - `executeBookingSol`: mock `sendAnchorInstruction`, verify
    instruction builder called with parsed input params.
  - `depositPointsSol`: mock, verify amount conversion from
    human-readable to minor units.
  - Error case: wallet not Solana → returns `{ status: "error" }`.

## Rules (non-negotiable)

- **Fixtures from contract, not invented.** Known-good borsh
  encodings and PDA addresses should come from `anchor test` output
  or the contract's test suite.
- **Ed25519 index-0 assertion is a hard test.** If this test is
  removed or weakened, the on-chain program will reject every
  merchant payment.
- **No on-chain calls in unit tests.** Mock RPC and
  `sendAnchorInstruction`.

## Acceptance

- [ ] `buildCreateTransaction` tests: Sol + Token variants pass.
- [ ] `buildDepositPoints` tests: encoding + PDA derivation pass.
- [ ] `pathOnchainSettlementSvm` tests: Ed25519 at index 0, borsh
      consistency, entry guard, API call.
- [ ] Agent executor tests: both executors covered.
- [ ] `pnpm test -- --testPathPattern=solana` passes.
- [ ] All tests use fixtures from contract test suite.

## Out of scope

- E2E testing against devnet (Phase 4).
- API-side verification tests (Tasks 07–09).
