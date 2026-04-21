# Task 38 — Deposit Receipt Endpoint (`POST /v1/pay/intents/:id/deposit-receipt`)

**Status:** Not taken
**Owner:** Backend (takumipay-api)
**Spec reference:** umkm-usdc-payout-spec.md §6.2 `DepositReceiptRequest` / `DepositReceiptResponse`, §6.5 `/v1/deposits` on Circle, §6.6 `gateway_deposits` table, milestone M4

## Why this matters

After the user's one-time on-chain deposit tx confirms, the backend needs to verify Circle has observed it and credited the user's Gateway ledger balance — only then can the pending intent proceed to Nanopay. Polling Circle's `POST /v1/deposits` (§6.5) with the depositor address is the intended path; writing our own source-chain watcher is both expensive and redundant. Without this endpoint, the onboarding screen (task 34) has no way to know when the user is ready to pay.

## Scope

1. New controller on `takumipay-api`. Route `POST /v1/pay/intents/:id/deposit-receipt`. SIWE-session auth.
2. Request body exactly matches `DepositReceiptRequest` from §6.2:
   ```ts
   { txHash: `0x${string}`; chainId: number; useCirclePaymaster: boolean }
   ```
3. Insert a row into `gateway_deposits` (§6.6) with `status = "PENDING_ATTESTATION"`, `user_id` from the auth principal, `amount_micros` from the associated intent.
4. Confirm by calling Circle's `POST /v1/deposits` with the depositor address — per §6.5, this eliminates the need to watch the source chain ourselves. Cache the depositor → Gateway-ledger mapping so repeat polls are cheap.
5. Status machine: `PENDING_ATTESTATION` → `CONFIRMED` (Circle returned a matching deposit) | `FAILED` (timeout after N minutes, or Circle reported `tx_failed`). Write `confirmed_at` on success.
6. Response body exactly matches `DepositReceiptResponse`:
   ```ts
   { depositId: string; status: "PENDING_ATTESTATION" | "CONFIRMED" | "FAILED" }
   ```
7. Only when `status === "CONFIRMED"` does the intent's `gasless.requiresDeposit` flip to `false` on subsequent `GET /v1/pay/intents/:id` fetches. Path selector (task 41) and Nanopay submit (task 17) gate on that flag.
8. Error mapping: translate Circle's deposit failure reasons to §9.1 `DEPOSIT_FAILED`. Transient Circle 5xx → keep polling; do not flip status to `FAILED` on a retryable error.

## Rules (non-negotiable)

- No on-chain watcher — source of truth is Circle's `POST /v1/deposits`. Saves us a per-chain infra commitment and avoids drift between our view and Circle's ledger (§6.5).
- `gateway_deposits` is the audit trail. Pending/failed rows accumulate per-user; a user has zero or one `CONFIRMED` row (§6.6).
- Onboarding screen consumes `gasless.requiresDeposit`, not this endpoint's response directly — keep the primary signal on the intent so the mobile state model is uniform. Memory: `feedback_filter_at_source.md` (read the canonical field, not a derived one).
- Three-role separation: mobile submits the receipt, server queries Circle and writes the row, Circle holds the ledger. Server does not touch user keys. Memory: `feedback_role_separation.md`.

## Acceptance

- [ ] `POST /v1/pay/intents/:id/deposit-receipt` accepts `DepositReceiptRequest`, returns `DepositReceiptResponse`.
- [ ] `gateway_deposits` row written on first POST with `status = "PENDING_ATTESTATION"`.
- [ ] Subsequent polls flip the row to `CONFIRMED` when Circle's `/v1/deposits` reports the deposit.
- [ ] `gasless.requiresDeposit` on the intent flips to `false` only after `CONFIRMED`.
- [ ] E2E test covers: testnet deposit → endpoint → eventual `CONFIRMED`.
- [ ] `pnpm check:syntax` clean.
- [ ] `pnpm biome:check` clean.

## Out of scope

- Mobile onboarding UX — task 34.
- Paymaster adapter / orchestrator — tasks 35, 36.
- UserOp proxy — task 37.
- `/v1/pay/intents/:id/nanopay` submission (already shipped in M2) — task 17.
