# Refund Runbook — Circle settle OK but Xendit payout FAILED

**Scope:** The single failure mode where USDC is in the platform treasury but
IDR never reached the merchant. Covers detection, decision tree, retry vs
refund, accounting reconciliation, and prevention.

**Spec anchors:** `umkm-usdc-payout-spec.md` §6.4 (Xendit payout), §9.1
(`XENDIT_PAYOUT_DECLINED`, `XENDIT_PAYOUT_LIMIT_EXCEEDED`), §12 Q5 (refund
policy).

**Related tasks:** 27 (merchant lifecycle), 29 (payout provider), 30 (Xendit
webhook handler), 32 (push on `PAID_OUT`), 45 (QRIS claim dispute admin
tools), 48 (mainnet cutover), 50 (ops credential provisioning).

**Role tags used below:** `[ops]` = human ops action, `[backend]` =
engineering change on `takumipay-api`, `[mobile]` = mobile surface change.

---

## 0. Failure mode in one paragraph

Payer signs EIP-3009 authorization. `takumipay-api` calls Circle Gateway
`/gateway/v1/x402/settle`; Circle returns 200, so
`payment_intents.status = SETTLED` and USDC is credited to
`PLATFORM_TREASURY_ADDRESS_EVM` (Path A: on-chain ERC-20 `Transfer` to the
same address). `takumipay-api` fires Xendit `POST /v2/payouts` keyed on
`intentId` (idempotent). Xendit returns FAILED — either synchronously or
via webhook — so `xendit_payouts.status = FAILED` and intent flips to
`FAILED`. Merchant does **not** receive IDR. Payer's USDC is locked in
the platform treasury with no automatic path back.

This runbook is the manual closure. **Nothing auto-refunds in v1** per
§12 Q5.

---

## 1. Detection

### 1.1 Signals that should page ops

| Signal | Source | Action |
| --- | --- | --- |
| `POST /webhooks/xendit` with `status = FAILED` | task 30 webhook handler | `[backend]` writes `xendit_payouts.status = FAILED`, `payment_intents.status = FAILED`, emits `xendit_payout_failed` telemetry event. |
| Alert fires | monitoring (Slack `#ops-payouts` channel, or a Linear issue auto-created in the `Ops` team) | `[ops]` acknowledges within the SLA (target: 15 min during business hours, 2 hr off-hours — confirm with product before cutover). |
| Mobile push to payer | task 32 push pipeline extended to `FAILED` state | `[mobile]` renders `<PaymentError code="XENDIT_PAYOUT_DECLINED" />` or `XENDIT_PAYOUT_LIMIT_EXCEEDED` with "Refund request" CTA. |

> **TODO `[backend]`:** confirm whether the alert rail is Slack webhook or
> Linear issue creation — both are cheap to wire. Owner: whoever lands task
> 30 webhook handler follow-up.

### 1.2 Triage queue

`[ops]` opens the failed-payout queue:

```
GET /v1/admin/payouts?status=FAILED
```

> **TODO `[backend]`:** this endpoint **does not exist yet**. Minimum viable
> shape:
>
> ```
> GET /v1/admin/payouts?status=FAILED&limit=50&cursor=…
> → {
>     items: [{
>       intentId, merchantId, payerUserId,
>       amountMicros, fiat, channelCode, accountNumberLast4,
>       xenditFailureCode, xenditResponseBodyPreview,
>       settleTxHash, createdAt, failedAt,
>     }],
>     nextCursor,
>   }
> ```
>
> Filters: `status`, `merchantId`, `fromDate`, `toDate`,
> `xenditFailureCode`. Reuses the admin auth that task 45 (QRIS claim
> dispute tool) already needs. List as follow-up (see §7).

Until the endpoint lands, `[ops]` queries the DB directly (read-only
replica):

```sql
SELECT pi.id, pi.status, xp.status AS xendit_status,
       xp.xendit_failure_code, xp.xendit_response_body,
       pi.amount_micros, pi.fiat_currency, pi.fiat_amount_minor,
       pi.merchant_id, pi.payer_user_id, pi.created_at
FROM payment_intents pi
JOIN xendit_payouts xp ON xp.intent_id = pi.id
WHERE pi.status = 'FAILED'
  AND xp.status = 'FAILED'
ORDER BY pi.created_at DESC
LIMIT 50;
```

### 1.3 Confirm the USDC actually settled

Before any refund, `[ops]` verifies the USDC is really in the treasury:

- **Path B (Gateway):** `xendit_payouts.settle_tx_uuid` (UUID from
  `/gateway/v1/x402/settle`) → cross-check
  `GET /gateway/v1/x402/transfers/{uuid}` → status must be `completed`.
- **Path A (on-chain Arc):** find the `ERC-20 Transfer(payer →
  PLATFORM_TREASURY_ADDRESS_EVM, amountMicros)` event in the intent's
  settle tx hash via Arc explorer.

If settle did **not** succeed, this is the wrong runbook — the intent
should have flipped to `FAILED` before payout was attempted; escalate to
engineering.

---

## 2. Decision tree

```
Xendit webhook / admin queue surfaces intent I with status = FAILED.
│
├── Did settle succeed? (see §1.3)
│   └── NO → wrong runbook. Escalate. STOP.
│
├── Is the Xendit failure RECOVERABLE?
│   ├── wrong `channel_code`            → §3 retry
│   ├── `account_holder_name` mismatch  → §3 retry
│   ├── `account_number` typo           → §3 retry
│   ├── transient Xendit 5xx / timeout  → §3 retry (no merchant edit)
│   └── channel cap / limit exceeded    → §3 retry after window OR §4
│                                        refund if merchant declines to
│                                        free headroom within 24h.
│
└── Is the Xendit failure PERMANENT?
    ├── account closed                       → §4 refund
    ├── compliance / sanctions block         → §4 refund (and flag
    │                                          merchant for KYB review,
    │                                          task 50).
    ├── bank / e-wallet permanently rejects  → §4 refund
    └── merchant unreachable > 72h           → §4 refund, mark merchant
                                               `inactive` via task 27
                                               PATCH endpoint.
```

**Rule of thumb:** `[ops]` attempts exactly **one** retry with corrected
details. A second failure on the same intent moves to refund. Do not loop
retries — Xendit's `Idempotency-key` is the `intentId`, so successive
retries against the same intent collapse to a single disbursement on their
side, and repeated retries against different corrected details is a smell
that indicates the merchant data is fundamentally wrong.

---

## 3. Retry flow (recoverable)

### 3.1 Correct the merchant's payout channel

`[ops]` confirms the intended `channel_code` / `account_number` /
`account_holder_name` with the merchant out-of-band (WhatsApp to
`Merchant.contactPhone` is the fastest — that field is populated at signup
per task 12).

`[ops]` edits via the task 27 lifecycle endpoint:

```
PATCH /v1/admin/merchants/:merchantId/channel
Body: {
  channelCode: "<CORRECTED_CHANNEL_CODE>",    # e.g. "OVO" → "DANA"
  accountNumber: "<CORRECTED_NUMBER>",
  accountHolderName: "<CORRECTED_NAME>",
}
```

> **Note:** Whether that exact path exists depends on task 27's final
> shape. If the only available surface is `PATCH /v1/merchants/:id` (self-
> service), ops may need to escalate to `[backend]` for a direct DB fix
> until an admin variant is added. See §7 follow-up.

The edit updates `merchants.channel_code`, `merchants.account_number`
(encrypted at rest per §6.6), and `merchants.account_holder_name`.

### 3.2 Re-fire the disbursement

`[ops]` triggers a manual retry through the PayoutService (task 29):

```
POST /v1/admin/payouts/:intentId/retry
Body: { reason: "channel_code_corrected" | "account_number_typo" | "compliance_cleared" | "transient_5xx" }
```

> **TODO `[backend]`:** this endpoint **does not exist**. It must:
>
> 1. Load `payment_intents` and `xendit_payouts` by intent id.
> 2. Re-read the merchant's **current** channel fields (post-PATCH).
> 3. Call `XenditPayoutProvider.disburse(intent, merchant)` — same path
>    as task 29's first attempt; the `Idempotency-key` is still the
>    `intentId` so Xendit will treat this as a new attempt iff the prior
>    attempt's `status` was `FAILED` (Xendit releases the idempotency
>    lock on terminal failures; confirm this per their docs at cutover).
> 4. Write a new `xendit_payouts` row (or update-in-place with a bumped
>    `attempt_count`) — decide at implementation time; prefer append-only
>    for audit trail.
> 5. Log the `reason` string in an ops audit table.
> 6. Guard: only callable when `payment_intents.status = FAILED` and
>    `xendit_payouts.status = FAILED`. 409 otherwise.
>
> Listed in §7 follow-up.

Until the endpoint lands, `[backend]` runs the retry manually via the
NestJS REPL or a one-off script that invokes `PayoutService.disburse` with
the refreshed merchant row.

### 3.3 Confirm success

`[ops]` watches for the Xendit webhook:

- Success → `payment_intents.status = PAID_OUT`; task 32 push fires to
  the payer; `<PaymentError>` CTA disappears.
- Failure again → decision tree (§2) moves to refund.

`[ops]` also spot-checks the Xendit dashboard for the
`reference_id = intentId` row to confirm the status match.

---

## 4. Refund flow (permanent failure)

### 4.1 Identify the payer

The payer is **not** the merchant. Do not use
`Merchant.contactPhone`. The payer lives on
`payment_intents.payer_user_id` → join `users` table for their wallet
address and any registered push token / email.

```sql
SELECT u.id, u.primary_wallet_address, u.email, u.push_token
FROM payment_intents pi
JOIN users u ON u.id = pi.payer_user_id
WHERE pi.id = '<INTENT_ID>';
```

The payer's **source chain address** (where the EIP-3009 authorization
came from) is recorded on `payment_intents.payer_address` +
`payment_intents.payer_chain_id`. That's the refund destination for
Option A below.

### 4.2 Pick a refund option

**Option A — USDC refund to the payer's wallet (preferred).** `[ops]`
initiates a signed transfer from `PLATFORM_TREASURY_ADDRESS_EVM` back to
`payer_address`. Two sub-modes per §12 Q5:

- **A1. Gateway cross-chain refund.** If the payer's source chain ≠ Arc
  (e.g. they paid from Base), use Gateway `POST /v1/transfer` (BurnIntent
  cross-chain product) from the platform's Gateway balance to
  `payer_address` on the source domain. Signed by
  `ARC_SETTLER_PRIVATE_KEY` server-side (three-role separation: ops
  triggers, server signs, user never touches keys).
- **A2. Plain ERC-20 return on Arc.** If the payer holds an Arc wallet,
  just send USDC from `PLATFORM_TREASURY_ADDRESS_EVM` → `payer_address`
  on Arc.

**Option B — IDR refund via Xendit to the payer's bank account.** `[ops]`
keeps the USDC in treasury and disburses IDR to the payer's bank via a
separate Xendit payout keyed on a new reference id (not the intentId —
that id is burned). Requires the payer to supply bank details out-of-
band, so it's only used when:

- the payer explicitly prefers IDR (no crypto wallet to refund to, or
  they want off-ramp),
- A1/A2 are infeasible (Gateway outage, payer's wallet is a contract
  wallet that can't receive).

**Default:** Option A, because it re-uses the same custody path (USDC
flows and adapter surfaces) and keeps Xendit out of the refund loop. Only
fall back to Option B on payer request or Gateway outage.

### 4.3 Execute the refund (Option A)

`[ops]` fills out the admin refund form (UI TBD — task 45 admin shell is
the natural home):

```
POST /v1/admin/payouts/:intentId/refund
Body: {
  option: "A1" | "A2" | "B",
  destination: {
    # A1 / A2
    chainId: <source chain id>,
    address: "0x…",
    # B
    channelCode: "…",
    accountNumber: "…",
    accountHolderName: "…",
  },
  amountMicros: <must equal intent.amountMicros — no partial refunds in v1>,
  reason: "xendit_permanent_decline" | "merchant_unreachable" | "compliance_block" | "payer_request",
}
```

> **TODO `[backend]`:** this endpoint **does not exist**. Behavior:
>
> 1. Guard: only callable when `payment_intents.status = FAILED`.
> 2. For A1: build `BurnIntent` payload, call Gateway `/v1/transfer`
>    via `BatchFacilitatorClient` (server-side Circle SDK), capture
>    `refund_tx_hash`.
> 3. For A2: build ERC-20 `transfer` tx, sign with
>    `ARC_SETTLER_PRIVATE_KEY`, submit via Arc RPC, capture
>    `refund_tx_hash`.
> 4. For B: call `XenditPayoutProvider.disburse` with a **new**
>    `reference_id` (e.g. `refund_<intentId>`), capture
>    `xendit_refund_payout_id`.
> 5. Write the refund row (see §4.4) and flip the intent.
> 6. Emit `intent_refunded` telemetry with
>    `{ intentId, option, amountMicros, refundTxHash? , refundPayoutId? }`.
> 7. Chain-extension discipline: step 3 goes through
>    `WalletKitAdapter` server surfaces — no `if (ns === "X")`
>    branching.
>
> Listed in §7 follow-up.

### 4.4 Record the refund in the intent

Set a new status:

```
UPDATE payment_intents
SET status = 'REFUNDED',
    refund_tx_hash = '<hash>' OR refund_payout_id = '<xendit_id>',
    refunded_at = now()
WHERE id = '<intent_id>';
```

> **TODO `[backend]`:** the `payment_intents.status` enum **does not
> include `REFUNDED`** yet, and the `refund_tx_hash` /
> `refund_payout_id` / `refunded_at` columns **do not exist**. These
> require a schema migration. Until the migration lands, `[ops]`
> records the refund in the ops ledger (§5) only and leaves the intent
> at `FAILED` with a pointer comment. Listed in §7 follow-up.

### 4.5 Notify the payer

`[mobile]` already renders `<PaymentError code="XENDIT_PAYOUT_DECLINED">`
with "Refund request" CTA (task 44). After the refund completes:

- **Push:** reuse task 32's push infrastructure. Add a new notification
  template:
  - Title: *"Your TakumiPay refund is complete"*
  - Body (A1/A2): *"We've returned [AMOUNT] USDC to your wallet. Tap to
    view the transaction."*
  - Body (B): *"We've sent [AMOUNT] IDR back to your bank account. It
    should arrive within 1–2 business days."*
  - Deep-link: transaction detail screen with the refund tx hash /
    payout id.
- **Email fallback** (only if push token is stale): same copy, sent via
  whatever transactional email provider ops already uses — placeholder
  `<EMAIL_PROVIDER>` until confirmed.
- In-app: `<PaymentError>` switches to a success state keyed on
  `intent.status === "REFUNDED"`. Mobile reads intent from existing
  polling — no new endpoint.

> **TODO `[mobile]`:** add the `REFUNDED` branch to
> `constants/paymentErrors.ts` + `<PaymentError>` component (task 44
> owner). Listed in §7.

---

## 5. Accounting reconciliation

Every refund decision is logged in an **ops ledger** — append-only,
human-readable, stored as a database table or a Notion / spreadsheet
shadow-record until an admin UI lands.

Minimum fields per row:

| Field | Source |
| --- | --- |
| `intentId` | intent under refund |
| `payerUserId` | `payment_intents.payer_user_id` |
| `merchantId` | `payment_intents.merchant_id` |
| `amountMicros` | USDC amount originally settled |
| `fiatAmountMinor` | intended IDR payout |
| `xenditFailureCode` | from `xendit_payouts.xendit_failure_code` |
| `refundOption` | `A1` / `A2` / `B` |
| `refundDestination` | wallet address or bank last-4 |
| `refundTxHash` or `refundPayoutId` | on-chain hash or Xendit id |
| `opsOperator` | `[ops]` user id / email who triggered |
| `reason` | free-form; cross-ref to any support ticket id |
| `decidedAt` / `executedAt` / `confirmedAt` | timestamps |

Reconciliation cadence:

- **Daily:** `[ops]` runs a totals query (sum of refunded `amountMicros`
  for the day) and matches against the treasury address's net USDC
  outflow on Arc explorer / Gateway balance diff. Any drift beyond the
  gas cost of the refund txs is a red flag — escalate immediately.
- **Weekly:** `[backend]` exports the ledger to the finance team's
  accounting system (format TBD — CSV to shared drive is fine for v1).

---

## 6. Prevention

Refunds are expensive and user-hostile. Each one triggers a root-cause
review:

1. **Pre-validate payout channel at merchant signup and at edit time.**
   `[backend]` calls a Xendit validation endpoint (or mirrors their
   channel-code list + account-number regex) before accepting the
   signup / edit in task 27. Reject malformed rows at the source
   instead of letting them fail at payout time.
2. **Merchant KYB before first payout** (task 50 credential
   provisioning). Reduces compliance-block failures.
3. **Alert on first retry, not first failure.** If Xendit fails once
   and retry succeeds, we learned something about the merchant's
   channel health — log it, but don't page ops. Page on the second
   failure for the same merchant within 24h.
4. **Cap payout amount during the merchant's first week.** Limits
   blast radius of a bad channel setup. Policy, not engineering — but
   `[backend]` owns the enforcement once the policy is set.
5. **Post-mortem each refund.** `[ops]` + `[backend]` jointly write a
   one-pager for any refund above a threshold (product picks; IDR
   500,000 is a reasonable v1 start). Feeds back into prevention list.

---

## 7. Follow-up engineering tasks (flagged above)

These are prerequisites for running this runbook end-to-end. Until they
land, ops operates in degraded mode (direct DB queries, engineering-
assisted REPL retries, ledger-only refund records).

| # | Task | Owner |
| --- | --- | --- |
| F1 | **`GET /v1/admin/payouts?status=FAILED`** — admin triage list endpoint with cursor paging and `xenditFailureCode` filter. | `[backend]` |
| F2 | **`POST /v1/admin/payouts/:intentId/retry`** — manual re-disbursement through the PayoutService. Requires append-only `xendit_payouts` attempt history or a bumped `attempt_count` column. | `[backend]` (task 29 follow-up) |
| F3 | **`POST /v1/admin/payouts/:intentId/refund`** — executes Option A1 / A2 / B, writes refund row, flips intent. | `[backend]` |
| F4 | **Schema migration** — `payment_intents.status` enum gains `REFUNDED`; new columns `refund_tx_hash`, `refund_payout_id`, `refunded_at`. | `[backend]` |
| F5 | **Ops ledger table** (or Notion mirror) with the fields in §5. | `[backend]` + `[ops]` |
| F6 | **Alert rail confirmation** — Slack webhook vs Linear auto-issue for Xendit `FAILED` webhook. | `[ops]` + `[backend]` (task 30 follow-up) |
| F7 | **`<PaymentError>` `REFUNDED` branch** — success state copy, deep-link to refund tx / payout id. | `[mobile]` (task 44 follow-up) |
| F8 | **Push template for refund complete** — add to task 32 push pipeline. | `[mobile]` + `[backend]` |
| F9 | **Admin surface for merchant channel PATCH** — confirm task 27's admin variant exists; add if missing. | `[backend]` (task 27 follow-up) |
| F10 | **Xendit idempotency semantics check** — confirm with Xendit docs / support that a FAILED terminal state releases the `Idempotency-key` so retry with the same intentId is accepted. Document the answer in task 29. | `[backend]` |

No follow-up is blocking detection (§1) or the decision tree (§2) —
those work today with direct DB access and manual engineering support.
The follow-ups unlock the ops-only, no-engineer-in-the-loop version of
this runbook, which is the v1-prod gate per task 48 (mainnet cutover).
