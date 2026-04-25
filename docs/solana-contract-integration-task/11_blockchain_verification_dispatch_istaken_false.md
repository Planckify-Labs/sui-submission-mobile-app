# Task 11 — `BlockchainVerificationService` — Solana dispatch layer

**Status:** Not taken
**Owner:** API (takumipay-api)
**Spec reference:** `solana-contract-integration-spec.md` §5.2.

## Why this matters

Today `BlockchainVerificationService` skips non-EVM chains in
`initializeClients()` (`if (!blockchain.isEVM) continue`) and all
verification methods use viem `readContract`. This task adds a dispatch
layer that routes to `SolanaVerificationService` (Tasks 06–09) when
the chain is non-EVM, making the existing verification pipeline
chain-agnostic.

## Scope

Update `BlockchainVerificationService` to inject
`SolanaVerificationService` and dispatch:

### `verifyTransactionInContract`

```typescript
const blockchain = await this.prisma.blockchain.findUnique({
  where: { id: blockchainId },
});
if (!blockchain.isEVM) {
  return this.solanaVerification.verifyTransactionRecord(solanaArgs);
}
// ... existing EVM viem readContract path
```

### `verifyMerchantPaymentInContract`

Same pattern — route to `this.solanaVerification.verifyMerchantPayment`
when `!blockchain.isEVM`.

### `verifyPointDeposit`

Same pattern — route to `this.solanaVerification.verifyPointDeposit`
when `!blockchain.isEVM`.

### `waitForTransactionReceipt` / equivalent

Route to `this.solanaVerification.waitForConfirmation` when
`!blockchain.isEVM`.

### Argument mapping

The existing EVM methods accept different arg shapes than the Solana
methods. Build a mapping layer that:

- Resolves `programId` from `blockchain.takumiPayProgramId` (new
  Prisma field from Task 12).
- Computes `refIdHash` from the `refId` string.
- Converts address format expectations (hex → base58).

## Rules (non-negotiable)

- **Existing EVM paths untouched.** The dispatch is additive — when
  `blockchain.isEVM` is true, the existing code runs unchanged.
- **No `if (namespace === "solana")` in shared code.** Use the
  `blockchain.isEVM` boolean flag (already exists in schema) as the
  dispatch discriminant.
- **`SolanaVerificationService` injected, not instantiated inline.**
  NestJS DI manages the lifecycle.

## Acceptance

- [ ] All three verification methods dispatch to Solana service when
      `!blockchain.isEVM`.
- [ ] Existing EVM verification unit tests still pass unchanged.
- [ ] New unit tests: mock Solana dispatch path, verify correct args
      passed to `SolanaVerificationService`.
- [ ] `pnpm run build` succeeds.

## Out of scope

- `SolanaVerificationService` implementation (Tasks 06–09).
- Prisma schema changes (Task 12).
- Onchain settlement endpoint (Task 14).
