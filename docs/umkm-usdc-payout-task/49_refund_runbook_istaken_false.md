# Task 49 — Manual refund runbook (USDC-in-treasury, IDR-never-landed)

**Status:** Not taken
**Owner:** Ops + Backend (takumipay-api)
**Spec reference:** umkm-usdc-payout-spec.md §12 Q5, §6.4, §9.1
(`XENDIT_PAYOUT_*`), cross-cutting (must land before prod cutover in
task 48)

## Why this matters

§12 Q5 flags the only scenario where USDC and IDR diverge: Circle
settle succeeded (Path B) or Arc on-chain transfer confirmed (Path A),
then Xendit payout failed after all retries. USDC is locked in
`PLATFORM_TREASURY_ADDRESS` (or the Gateway balance); the intent is
`FAILED`; the payer sees `XENDIT_PAYOUT_DECLINED` or
`XENDIT_PAYOUT_LIMIT_EXCEEDED`. Without a defined refund path, the
user's USDC sits indefinitely and there's no ops-safe way to return
it. This runbook closes the loop.

## Scope

1. **Dispute intake** — payer taps "Refund request" on the §9.1 error
   screen. Mobile calls a new `POST /v1/pay/intents/:id/refund-
   request` that records the request against the intent and pages
   ops. No refund executes automatically.
2. **Reconciliation** — ops reviews
   `xendit_payouts.xendit_response_body` for the failing intent,
   confirms settle succeeded (Path B:
   `nanopay_submissions.circle_settle_tx_uuid`; Path A: on-chain
   `Transfer` event) and Xendit declined.
3. **Execute refund** (two options, ops-signed only):
   - **Option A — Gateway cross-chain refund.** `POST /v1/transfer`
     via Circle Gateway from the platform's Gateway balance back to
     the payer's source chain address. Preferred when the payer paid
     from a non-Arc source.
   - **Option B — Plain ERC-20 return on Arc.** Direct USDC
     `transfer` from `PLATFORM_TREASURY_ADDRESS_EVM` to the payer's
     Arc address. Preferred when the payer holds an Arc wallet.
4. **State update** — set `payment_intents.status = REFUNDED` (new
   state; schema migration required — **flag as a follow-up task**
   before this runbook can run end-to-end). Store the refund tx hash
   on a new `refund_tx_hash` column alongside the existing
   `nanopay_nonce` row.
5. **Telemetry** — emit `intent_refunded` event with
   `{ intentId, option, amountMicros, refundTxHash }` for ops
   dashboards. Payer sees an in-app notification when status flips.
6. **Runbook doc** — step-by-step in `docs/ops/refund-runbook.md`
   covering intake → reconciliation → option choice → signing →
   state update → payer notification → weekly audit.

## Rules (non-negotiable)

- **Three-role separation** — refund tx is signed by ops with
  `ARC_SETTLER_PRIVATE_KEY` server-side. User never supplies keys
  or bank creds for a refund; mobile only files the request.
- **Chain-extension discipline** — the option-A Gateway call and
  option-B ERC-20 transfer both go through the existing
  `WalletKitAdapter` server-side surfaces; no
  `if (ns === "X")` branching in the refund module.
- **Filter at source** — refund eligibility reads
  `intent.status === "FAILED"` and checked against settle proof
  from the DB; never recomputed on mobile.

## Acceptance

- [ ] `POST /v1/pay/intents/:id/refund-request` exists; mobile wires
      it behind the §9.1 "Refund request" CTA.
- [ ] Reconciliation query against `xendit_payouts` + settle-tx
      evidence is documented.
- [ ] Schema migration for `status = REFUNDED` + `refund_tx_hash`
      column tracked as follow-up.
- [ ] Runbook document exists under `docs/ops/`.
- [ ] Dry-run on staging: seed a failed-payout intent → execute
      refund option B → intent flips to `REFUNDED` → payer gets
      notification.

## Out of scope

- Auto-refund on Xendit failure — v1 is manual per §12 Q5.
- The `<PaymentError>` component itself (task 44).
- Mainnet cutover (task 48) — but this runbook must land first.
