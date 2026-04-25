# Task 22 — Register Solana TakumiPay executors in registry

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** `solana-contract-integration-spec.md` §4.8
(Registry updates section).

## Why this matters

The mobile agent executor registry (`services/agent-executors/index.ts`)
must include the new Solana TakumiPay executors so the agent runtime
can dispatch `execute_booking_sol` and `deposit_points_sol` tool calls
to the correct mobile-side handlers.

## Scope

### `services/agent-executors/index.ts`

```typescript
import { SOLANA_TAKUMI_PAY_EXECUTORS } from "./solanaTakumiPay";

export const EXECUTORS: Record<string, MobileToolExecutor> = {
  ...READ_EXECUTORS,
  ...SIMULATE_EXECUTORS,
  ...WRITE_EXECUTORS,
  ...POINTS_EXECUTORS,
  ...ADDRESS_BOOK_EXECUTORS,
  ...SOLANA_EXECUTORS,
  ...SOLANA_TAKUMI_PAY_EXECUTORS,  // ← NEW
};
```

### `EXPECTED_MOBILE_TOOLS` update

```typescript
export const EXPECTED_MOBILE_TOOLS: ReadonlyArray<string> = [
  // ... existing entries ...
  // solana takumipay
  "execute_booking_sol",
  "deposit_points_sol",
];
```

This array is used to validate that the agent-API's tool registry
(Task 23) matches what the mobile app can actually execute. Mismatches
surface as warnings at startup.

## Rules (non-negotiable)

- **Flat map — no namespace namespacing.** All executors from all
  namespaces live in the same `EXECUTORS` map. Tool names are unique
  strings (e.g., `execute_booking_sol` vs `execute_booking`).
- **`EXPECTED_MOBILE_TOOLS` must include every executor.** If a tool
  is in `EXECUTORS`, it must be in `EXPECTED_MOBILE_TOOLS`. The
  inverse: if it's in `EXPECTED_MOBILE_TOOLS`, it must have an executor.

## Acceptance

- [ ] `SOLANA_TAKUMI_PAY_EXECUTORS` spread into `EXECUTORS`.
- [ ] `execute_booking_sol` and `deposit_points_sol` in
      `EXPECTED_MOBILE_TOOLS`.
- [ ] No duplicate keys in `EXECUTORS`.
- [ ] `pnpm check:syntax` passes.
- [ ] `pnpm biome:check` clean.

## Out of scope

- Executor implementations (Task 21).
- Agent-API tool definitions (Task 23).
