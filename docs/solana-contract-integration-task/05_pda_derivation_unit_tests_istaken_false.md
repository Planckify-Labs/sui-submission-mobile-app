# Task 05 — PDA derivation unit tests (mobile + API)

**Status:** Not taken
**Owner:** Mobile (mobile-app) + API (takumipay-api)
**Spec reference:** `solana-contract-integration-spec.md` §3.2, §9
Phase 1.

## Why this matters

PDA derivation is the glue between instruction building (mobile) and
account verification (API). If seeds are wrong, instructions silently
create accounts at the wrong address, and the API reads empty accounts
or the wrong data. Unit tests with known fixtures catch seed mismatches
before any on-chain interaction.

## Scope

### Mobile: `services/chains/solana/takumiPay/pda.test.ts`

For each PDA function in `pda.ts` (Task 02):

- Use a known `programId`, `config` pubkey, and seed inputs.
- Assert the derived `[PublicKey, bump]` matches the expected value
  computed independently (e.g., from `PublicKey.findProgramAddressSync`
  with manually constructed seeds).
- Cover edge cases:
  - `txId = 0` and `txId = 2^53 - 1` (bigint boundary).
  - `refIdHash` of empty string vs non-empty string.
  - `depositId = 0`.

### API: `src/blockchain-verification/solana/takumi-pay/pda.spec.ts`

Mirror the mobile tests using the API's PDA helpers (Task 03). Assert
that for the same inputs, mobile and API derive identical PDA addresses.

### Cross-project fixture

Create a shared fixture file
(`docs/solana-contract-integration-task/fixtures/pda-vectors.json`)
with known input→output pairs. Both test suites read from this fixture
to guarantee consistency without coupling the codebases.

## Rules (non-negotiable)

- **Fixtures derived from the contract.** Run `anchor test` with a
  known seed set and capture the PDA addresses the program actually
  uses. Do not invent expected values — compute them from the contract
  source or a verified reference.
- **Both projects must pass with the same fixture.** If one fails and
  the other passes, seeds diverge — block until fixed.

## Acceptance

- [ ] Mobile PDA tests pass: all functions, edge cases covered.
- [ ] API PDA tests pass: all functions, same fixtures.
- [ ] Cross-project fixture exists and is used by both test suites.
- [ ] `pnpm test -- --testPathPattern=pda` passes in both projects.

## Out of scope

- Instruction encoding tests (Task 24).
- On-chain PDA verification (Phase 4).
