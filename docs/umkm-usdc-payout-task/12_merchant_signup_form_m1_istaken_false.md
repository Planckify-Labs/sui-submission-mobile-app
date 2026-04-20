# Task 12 — `app/merchant/signup-form.tsx` (5 fields, polymorphic account input)

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** umkm-usdc-payout-spec.md §1.1.1 step 3 (entire table), §6.1 `MerchantSignupRequest`, milestone M1

## Why this matters

This is the one-screen merchant signup form. The UX subtlety that
makes or breaks it is the **polymorphic account-number input** — the
label, keyboard, and length validation flip on the picked channel
(phone for GoPay/OVO/DANA, digits-only for BCA/Mandiri). A naive
single-type input silently lets merchants enter bad account numbers
that Xendit then rejects at payout time (§9.1
`XENDIT_PAYOUT_DECLINED` — "Your USDC is safe. Merchant couldn't
receive"). Not a great first impression.

## Scope

1. Create `app/merchant/signup-form.tsx`. Consume route params from
   task 11 (either fields pre-filled from QRIS scan, or all blank
   on the manual path).
2. Render five fields per §1.1.1 step 3 table:
   - **Display name** (`displayName`) — pre-filled from QRIS tag 59
     if present (merchant edits casing since QRIS is ALL CAPS).
   - **WhatsApp number** (`contactPhone`) — E.164, defaults to
     `+62` prefix for ID.
   - **Payout channel** (`channelCode`) — **fetched** from
     `GET /v1/merchants/channels?country=ID` via a new TanStack
     Query hook (`useMerchantChannels`). Render in server order —
     **do not sort client-side** (filter-at-source). Mark channels
     with `kind: "ewallet"` vs `"bank"` via icon + subtitle.
   - **Account number** (`accountNumber`) — polymorphic:
     - `accountFormat === "phone_id"` → phone-pad keyboard, E.164
       validation, "+62" sticky prefix.
     - `accountFormat === "digits:N"` → numeric keyboard, length
       hint "N digits", numeric-only validation.
     - Any other format → freeform text, warn in console.
   - **Account holder name** (`accountHolderName`) — text, free-
     form, no pre-fill from QRIS tag 59 (store name ≠ e-wallet
     legal name, §1.1.1 step 3 footnote).
3. When picked channel is an e-wallet, show a checkbox
   **"Same as my WhatsApp number"** that copies digits from
   `contactPhone` → `accountNumber` on toggle. Preserve both
   values in form state regardless. Hide the checkbox entirely for
   bank channels.
4. Submit: POST `POST /v1/merchants/signup` (§6.1) with a
   `MerchantSignupRequest` including the optional `qrisLink`
   block when scan-path fields are present.
   - M1 stub: the endpoint may not exist yet. Gate behind a
     TanStack mutation that either calls the real API (if
     `EXPO_PUBLIC_API_URL` is reachable) or logs the payload and
     navigates to the QR home (task 13) on a mocked success.
     Document the stub path in a top-of-file comment.
5. On success, route to `/merchant/qr` (task 13).
6. Copy audience rule — merchant-facing screen, no USDC / chain
   language. "Payout channel" / "Account number" / "Holder name"
   match what a merchant would see on a bank or GoPay app.

## Rules (non-negotiable)

- **Filter-at-source** (memory `feedback_filter_at_source.md`) —
  render `ChannelDescriptor[]` from the API in the order the server
  returns. Do not re-sort by `kind`, `priority`, or alphabet.
- **Copy-audience rule.** Merchant strings never reference USDC /
  chains / gas.
- **Three-role separation** (memory `feedback_role_separation.md`)
  — form POSTs; server validates; wallet is not involved.
- **Polymorphic input is driven by the server's
  `accountFormat` string**, not by a client-side switch on
  `channelCode`. Adding a new format (e.g. IBAN) is a server-only
  change — parse the string ("phone_id" / "digits:N" / future
  additions) and pick UI behavior accordingly.
- **Validate before submit.** `channelCode` not picked → disable
  button. `accountNumber` length mismatches the format hint →
  show inline error.

## Acceptance

- [ ] `app/merchant/signup-form.tsx` exists with all 5 fields.
- [ ] `useMerchantChannels` hook fetches + caches the channel list
      (filter at source, renders server order).
- [ ] Polymorphic account input flips keyboard + validation on
      channel pick.
- [ ] "Same as my WhatsApp number" checkbox works for e-wallet
      channels only.
- [ ] Successful submit navigates to `/merchant/qr`.
- [ ] Copy has no crypto-native terms.
- [ ] `pnpm check:syntax` passes.
- [ ] `pnpm biome:check` passes.

## Out of scope

- Backend `GET /v1/merchants/channels` + `POST /v1/merchants/
  signup` — `takumipay-api` tasks (M3 for live wiring).
- Sticker photo capture + upload — task 14.
- Merchant QR home screen — task 13.
- Patch / re-issue endpoint (§6.1 `MerchantPatch`) — M2 task.
