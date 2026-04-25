# Task 06 — `SolanaVerificationService` scaffold + `waitForConfirmation`

**Status:** Not taken
**Owner:** API (takumipay-api)
**Spec reference:** `solana-contract-integration-spec.md` §5.1.

## Why this matters

The API must verify Solana on-chain state after the mobile app
broadcasts transactions. This service is the Solana counterpart to the
existing EVM verification in `BlockchainVerificationService`. It needs
a `Connection` (RPC-only, no keypair) to read account data and confirm
transaction finality.

## Scope

- Create `src/blockchain-verification/solana-verification.service.ts`.
- NestJS `@Injectable()` service with:
  - `Connection` initialized from Solana blockchain's `rpcUrl` in DB
    (or `SOLANA_RPC_URL` env var).
  - Anchor `Program` instance initialized with the IDL from Task 03's
    `idl.ts` — used by verification methods in Tasks 07–09.
  - **No keypair needed for reads.** All PDA data is publicly readable
    via `getAccountInfo`. This differs from EVM where the API needs an
    admin wallet to call gated view functions.

### `waitForConfirmation`

```typescript
async waitForConfirmation(
  signature: string,
  commitment: Commitment = "finalized",
): Promise<void>;
```

- Poll `getSignatureStatuses([signature])` until
  `confirmationStatus >= commitment`.
- Timeout after configurable duration (default 60s).
- Throw `TransactionNotConfirmedError` on timeout.
- Handle `err !== null` in status → throw with decoded error.

### Module registration

- Register `SolanaVerificationService` in
  `BlockchainVerificationModule` (or equivalent NestJS module).
- Inject `PrismaService` and `ConfigService`.

## Rules (non-negotiable)

- **No keypair.** The service only reads — `Connection` suffices.
  The Ed25519 keypair for quote signing is a separate concern (Task 10).
- **`@coral-xyz/anchor` `Program` for deserialization.** Use
  `program.account.*.fetch(pda)` for typed account reads — not raw
  `getAccountInfo` + manual borsh deserialization.
- **Commitment level respected.** Always pass the caller's requested
  commitment through to RPC calls.

## Acceptance

- [ ] Service created and registered in NestJS module.
- [ ] `waitForConfirmation` works with mocked RPC (unit test).
- [ ] Timeout path throws `TransactionNotConfirmedError`.
- [ ] `Program` instance initializes from IDL without errors.
- [ ] `pnpm run build` succeeds.

## Out of scope

- Verification methods (Tasks 07/08/09).
- Quote signing (Task 10).
- Dispatch layer in `BlockchainVerificationService` (Task 11).
