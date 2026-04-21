# Task 45 — QRIS PAN claim dispute tool (first-claim-wins + ops review)

**Status:** Not taken
**Owner:** Backend (takumipay-api) + Ops
**Spec reference:** umkm-usdc-payout-spec.md §6.6 (`merchants`,
`merchant_qris_claims`), §9.1 (`PAN_ALREADY_CLAIMED`), §12 Q9,
cross-cutting (lands with M1 onboarding — task 14)

## Why this matters

Merchant onboarding trust-on-first-use means a bad actor can register
another merchant's QRIS PAN. §12 Q9 picks first-claim-wins with a
manual dispute path rather than acquirer-level verification (not
available v1). The sticker photo captured at signup (task 14) is the
evidence substrate; this task builds the ops workflow that reviews it
and reassigns the PAN when a dispute succeeds. Without this, a
duplicate claim bricks the real merchant silently.

## Scope

1. Enforce first-claim-wins via a unique index on
   `merchants.qris_pan` (already specced in §6.6). Migration adds the
   index if absent.
2. `POST /v1/merchants/signup` returns `409 PAN_ALREADY_CLAIMED` on
   unique-violation. Mobile surfaces the §9.1 row via `<PaymentError>`
   (task 44) with "Contact support" CTA + "Link a different QRIS"
   fallback.
3. Ensure each signup writes a row into `merchant_qris_claims`
   (already specced §6.6) with `qris_pan`, `merchant_id`,
   `qris_sticker_photo_key`, `dispute_status = "none"`.
4. Add ops-only endpoint `POST /ops/v1/qris-claims/:id/review`
   accepting `{ decision: "valid" | "invalid", notes }`. Guarded by
   the existing ops-bearer middleware (same shape as other `/ops/*`
   routes).
5. On `decision === "valid"`: set claim row `dispute_status =
   "resolved_valid"`, leave `merchants.qris_pan` as-is.
6. On `decision === "invalid"`: set `dispute_status =
   "resolved_invalid"`, `NULL` the losing merchant's
   `merchants.qris_pan`, and unblock the complaining merchant to
   re-claim via a normal signup retry (which will now succeed on the
   unique index).
7. Every state change is append-only auditable — never `DELETE` a
   claim row; archive the sticker photo under `qris_sticker_photo_key`
   in existing object storage.

## Rules (non-negotiable)

- **Three-role separation** — ops acts server-side only; the mobile
  app never submits a dispute verdict. Merchants contact ops via the
  WhatsApp support link surfaced in the §9.1 error.
- **Chain-extension discipline** — QRIS is a `channels` row, not a
  branch. If/when PromptPay, DuitNow, etc. need the same dispute path,
  it's the same table + endpoint, parameterized on channel.
- **Filter at source** — uniqueness enforced at the DB, not in app
  code. Dispute state is read straight from `merchant_qris_claims`,
  not recomputed.

## Acceptance

- [ ] DB migration adds `UNIQUE` index on `merchants.qris_pan`.
- [ ] `POST /v1/merchants/signup` returns 409 `PAN_ALREADY_CLAIMED`.
- [ ] `POST /ops/v1/qris-claims/:id/review` toggles `dispute_status`
      and (if invalid) clears the losing `merchants.qris_pan`.
- [ ] E2E test: signup A, signup B with same PAN → 409; ops resolves
      invalid → signup B retries → success.
- [ ] `pnpm check:syntax` + `pnpm biome:check` pass.

## Out of scope

- Acquirer-level SMS verification (post-v1 per §12 Q9).
- `<PaymentError>` component itself (task 44).
- Sticker photo capture UX on signup (task 14).
