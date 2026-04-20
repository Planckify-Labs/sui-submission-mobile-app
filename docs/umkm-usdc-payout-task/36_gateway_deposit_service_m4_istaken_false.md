# Task 36 — Gateway Deposit Service (`services/nanopay/gatewayDeposit.ts`)

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** umkm-usdc-payout-spec.md §5.4 gasless-UX table row "One-time Gateway deposit (onboarding only)", §5.5 service module layout, §6.7 chain-config, milestone M4

## Why this matters

This is the orchestrator that picks the right on-chain pathway for the one-time `GatewayWallet.deposit(amount)` call. On Arbitrum/Base source chains, Circle Paymaster is live and the deposit is gasless; on Arc (USDC = gas natively) no Paymaster is needed; on other chains the user pays native gas for this single step. The service hides that decision behind one callable, so the onboarding screen (task 34) stays transport-agnostic and the adapter (task 35) stays signing-only.

## Scope

1. Create `services/nanopay/gatewayDeposit.ts` alongside `buildAuthorization.ts` / `submitAuthorization.ts` per §5.5 service-module layout.
2. Input: `{ wallet, chain: ChainConfig, amountMicros }`. Chain carries `gateway.walletContract`, `paymaster.address` (nullable), and `usdc` token address from §6.7's enriched blockchain row.
3. Build the `GatewayWallet.deposit(usdc, amountMicros)` calldata via viem's `encodeFunctionData` — pure function, side-effect free.
4. Presence-of-method dispatch:
   - If `chain.paymaster !== null && kit.sendUserOpWithUsdcPaymaster != null` → build EIP-2612 `permit` for USDC → compose UserOp → call `kit.sendUserOpWithUsdcPaymaster({ wallet, chain, calls: [{ to: gateway.walletContract, data, value: 0n }], paymaster, permit })` (task 35).
   - Else → fall through to `viem.writeContract` via the existing wallet-client adapter primitive. This is the Arc path (§5.4 table: "Direct on Arc — USDC is the gas token"), plus any other chain without Paymaster.
5. Return `{ txHash, usedCirclePaymaster }` — consumed by the onboarding screen to POST `/v1/pay/intents/:id/deposit-receipt` (task 38) with the `useCirclePaymaster` boolean.
6. Add `services/nanopay/gatewayDeposit.test.ts` covering: Paymaster branch picks up non-null `chain.paymaster.address`, Arc branch (paymaster: null) falls back to plain send, permit typed-data shape matches USDC's EIP-2612 contract.

## Rules (non-negotiable)

- Branching is presence-of-method on the kit (`kit.sendUserOpWithUsdcPaymaster`), not namespace check. Memory: `feedback_chain_extension_discipline.md`.
- Paymaster address and gateway wallet contract come from the `ChainConfig` arg (sourced from `GET /v1/blockchains` §6.7) — never from env, never hardcoded.
- Service orchestrates; the adapter signs; the backend submits. Three-role separation held. Memory: `feedback_role_separation.md`.
- No blockchain fetching inside this service — caller pre-fetches the `ChainConfig` from `useBlockchains()`, service takes it as an arg (avoids the `activeChain` refetch smell called out in `docs/todolist/technical-deb.md`).

## Acceptance

- [ ] `services/nanopay/gatewayDeposit.ts` exports one async function matching the scope signature.
- [ ] `gatewayDeposit.test.ts` covers both branches + permit shape.
- [ ] Consumed by the onboarding screen (task 34) with zero per-chain branching at the call site.
- [ ] `pnpm check:syntax` clean.
- [ ] `pnpm biome:check` clean.

## Out of scope

- `sendUserOpWithUsdcPaymaster` adapter body — task 35.
- Onboarding screen — task 34.
- Backend `/v1/userop/submit` + `/v1/pay/intents/:id/deposit-receipt` — tasks 37, 38.
- Path selector — task 41.
