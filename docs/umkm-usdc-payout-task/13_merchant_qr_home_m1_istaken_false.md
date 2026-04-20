# Task 13 — `app/merchant/qr.tsx` home screen

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** umkm-usdc-payout-spec.md §1.1.1 step 4, §6.1 `MerchantProfile.qr`, milestone M1

## Why this matters

After merchant signup the user lands on their "home screen" — a
printable JWS QR they can save, share via WhatsApp, or print as a
sticker. This screen is the merchant's whole relationship with
TakumiPay day-to-day: show the QR, let customers scan, collect
payments. Getting Save-to-Photos + Share-Sheet right in M1 means the
merchant can hand out a printed QR before any payment rail is live.

## Scope

1. Create `app/merchant/qr.tsx`. Fetch the merchant profile via a
   new TanStack Query hook (`useMerchantProfile`) pointed at
   `GET /v1/merchants/me` (§6.1).
2. Render a centered `takumipay:v1:<JWS>` QR using
   `react-native-qrcode-svg` (per §11.1 — new dep in M1). Recommended
   size 300×300 logical px, error correction "M", include the
   merchant display name and a muted subtitle "Show this QR to
   receive payments."
3. **Save to Photos** button — render the QR to a PNG via
   `react-native-view-shot` (or `react-native-qrcode-svg`'s
   `toDataURL` → `expo-file-system`), write to the user's photo
   library via `expo-media-library`. Handle permission denial with
   a graceful toast.
4. **Share** button — pass the PNG through the system share sheet
   via `expo-sharing`. On iOS this surfaces AirDrop / WhatsApp /
   Mail / Print; on Android, WhatsApp / Gmail / Drive / etc.
5. **"Linked QRIS" card** (scan-path only — when
   `merchant.qrisPan` is non-null):
   - Thumbnail of the sticker photo (from
     `merchant.qrisStickerPhotoKey` via signed URL — backend
     endpoint TBD, fallback to `null` and hide the card in M1 if
     the signed-URL path isn't live yet).
   - Last-4 of the PAN: `"9360****3456"`.
   - Acquirer label decoded from tag 26 sub-tag 00 (server echoes
     this on the profile; if not yet served, derive client-side
     from a short map — BCA / Mandiri / BNI / BRI / OVO).
   - Muted line: _"Your existing QRIS sticker also works —
     customers can pay either one."_
6. **No `qrisPan` linked** (manual path): replace the card with
   "Not linked" + a muted "Link later in Settings" link (nav
   target TBD; `console.warn` is fine in M1 since the screen
   doesn't exist yet).
7. Quiet menu link at the bottom: "Payouts" — marked `(deferred
   v1.1)`. Placeholder that routes nowhere, just exists visually.
8. Copy audience rule — merchant surface, **zero USDC / chain
   language**.

## Rules (non-negotiable)

- **Copy-audience rule.** No USDC / chains / gas anywhere on this
  screen, including the "Linked QRIS" card. The subtitle under the
  QR says "Show this QR to receive payments" — not "Receive USDC."
- **Three-role separation** (memory `feedback_role_separation.md`)
  — the screen renders server state only. The JWS is minted
  server-side; the app doesn't sign or mutate.
- **Filter-at-source** (memory `feedback_filter_at_source.md`) —
  `MerchantProfile.qr.jws` is authoritative; do not re-derive or
  re-encode the QR payload client-side.
- **PNG render must be printable.** Target 400×400 PNG at error
  correction "M" (per §11.1 guidance: business-card-sized sticker
  print works at that density).

## Acceptance

- [ ] `app/merchant/qr.tsx` renders a scannable JWS QR.
- [ ] "Save to Photos" writes a PNG that another phone can scan.
- [ ] "Share" opens the system share sheet with the PNG attached.
- [ ] "Linked QRIS" card renders when `merchant.qrisPan` is set;
      "Not linked" message otherwise.
- [ ] Copy has no crypto-native terms.
- [ ] `pnpm check:syntax` passes.
- [ ] `pnpm biome:check` passes.

## Out of scope

- `GET /v1/merchants/me/qr` regeneration endpoint (§6.1
  `MerchantQrResponse`) — use the initially-issued JWS from
  `/v1/merchants/me` in M1. Regeneration UX lands in M2 (task ≈ 22).
- Payouts history screen (`GET /v1/merchants/me/payouts`) —
  v1.1 deferred.
- Re-entry from Profile/Settings for returning merchants (§1.1.1
  final paragraph) — M2 wiring task.
- QRIS sticker photo capture + upload — task 14.
