# Task 21 — `solanaTakumiPay.ts` agent executors

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** `solana-contract-integration-spec.md` §4.8.

## Why this matters

Agent mode needs mobile-side executors for `execute_booking_sol` and
`deposit_points_sol` — the Solana counterparts to the EVM stubs in
`services/agent-executors/writes.ts` and `points.ts`. These executors
use the instruction builders from Tasks 17/18 and the
`sendAnchorInstruction` method from Task 15 to execute TakumiPay
program calls triggered by the AI agent.

## Scope

Create `services/agent-executors/solanaTakumiPay.ts`:

### `executeBookingSol`

```typescript
export const executeBookingSol: MobileToolExecutor = (input, context) =>
  safeExecute(async () => {
    // 1. Resolve Solana walletKit from registry
    // 2. Validate wallet namespace is Solana
    // 3. Read params: booking_id, exchange_rate_id,
    //    product_variant_id, ref_id, amount, token_mint
    // 4. Fetch Config account (txCounter) via fetchTakumiPayConfig
    // 5. Compute refIdHash from ref_id
    // 6. Build createTransactionSol or createTransactionToken IX
    //    (Task 17's buildCreateTransactionInstruction)
    // 7. walletKit.sendAnchorInstruction(...)
    // 8. Return { status: "success", data: { signature, cluster } }
  });
```

### `depositPointsSol`

```typescript
export const depositPointsSol: MobileToolExecutor = (input, context) =>
  safeExecute(async () => {
    // 1. Resolve Solana walletKit from registry
    // 2. Validate wallet namespace is Solana
    // 3. Read params: ref_id, token_mint, amount
    //    (convert human-readable amount to lamports/minor units)
    // 4. Fetch Config account (pointDepositCounter)
    // 5. Build depositPoints IX (Task 18's builder)
    // 6. walletKit.sendAnchorInstruction(...)
    // 7. Return { status: "success", data: { signature } }
  });
```

### Exports

```typescript
export const SOLANA_TAKUMI_PAY_EXECUTORS: Record<string, MobileToolExecutor> = {
  execute_booking_sol: executeBookingSol,
  deposit_points_sol: depositPointsSol,
};
```

## Rules (non-negotiable)

- **Space docking.** Resolve Solana kit via
  `walletKitRegistry.get("solana")` and call `sendAnchorInstruction` —
  same pattern as `send_sol` uses `sendNativeTransfer`.
- **Error wrapping in `safeExecute`.** Match the existing executor
  error contract — return `{ status: "error", message: "..." }` on
  failure, never throw.
- **Amount conversion.** `deposit_points_sol` receives human-readable
  amounts (e.g., "100"). Convert to minor units using the token's
  decimals before passing to the instruction builder.
- **No namespace branching in this file.** This file is Solana-only.
  The registry (Task 22) decides which executor to dispatch.

## Acceptance

- [ ] Both executors exported from `solanaTakumiPay.ts`.
- [ ] `SOLANA_TAKUMI_PAY_EXECUTORS` map exported.
- [ ] Unit test: `executeBookingSol` calls `buildCreateTransactionInstruction`
      with correct params.
- [ ] Unit test: `depositPointsSol` calls `buildDepositPointsInstruction`.
- [ ] Error cases return `{ status: "error" }`, not throw.
- [ ] `pnpm check:syntax` passes.

## Out of scope

- Registry update (Task 22).
- Agent-API tool definitions (Task 23).
- Instruction builder implementations (Tasks 17/18).
