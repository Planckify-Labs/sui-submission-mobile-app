# Task 11 — `app/merchant/signup-intro.tsx` ("Do you have a QRIS sticker?")

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** umkm-usdc-payout-spec.md §1.1.1 step 2, milestone M1

## Why this matters

Most Indonesian UMKM already own a QRIS sticker — scanning it shrinks
the signup form from five fields to four and pre-fills merchant name
+ country from EMVCo tag 59 / 58. The intro screen forks the path:
scan vs manual. It also captures the sticker photo as lightweight
dispute evidence (§12 Q9). This is the first screen after "Register
as Merchant" (task 10).

## Scope

1. Create `app/merchant/signup-intro.tsx` exporting the Expo Router
   default component.
2. Render the fork per §1.1.1 step 2:
   - Heading: "Do you have a QRIS sticker?"
   - Primary button: "Scan my QRIS" (camera icon).
   - Secondary button: "No QRIS yet — enter manually" (muted style).
3. **Scan path** — on press:
   - Open the camera (reuse `expo-camera` from `app/scan-to-pay.tsx`
     — either navigate to a sub-route `/merchant/signup-scan` or
     reuse the scanner component with a different completion
     callback; either is acceptable, pick the smaller diff).
   - Decode EMVCo locally via `services/emvco/parse` (task 04).
     Extract `{ qrisPan, displayName, country, acquirerSubTag00 }`.
   - Capture the sticker photo (task 14) — `stickerPhotoKey` once
     uploaded, `stickerPhotoBase64` in-memory for immediate preview.
   - Navigate to `/merchant/signup-form` (task 12) with the
     extracted fields + photo reference as route params (serialize
     safely; large base64 goes via a ref store, not URL).
4. **Manual path** — on press, navigate directly to
   `/merchant/signup-form` with all fields blank and `qrisLink`
   left `undefined`.
5. Copy audience rule (§1.1) — this entire screen is **merchant-
   facing**. Do not mention USDC, chains, or "onchain" anywhere.
   Say "payouts" / "payments" / "TakumiPay," not "USDC settlement."

## Rules (non-negotiable)

- **Copy-audience rule is load-bearing** — merchant strings never
  reference USDC / chains / gas. When in doubt, rewrite.
- **Three-role separation** (memory `feedback_role_separation.md`)
  — the screen classifies + collects; it does not POST anything.
  Form submission lives on task 12.
- **Filter-at-source** (memory `feedback_filter_at_source.md`) —
  consume `extractQrisFields(tags)` from task 04. Do not re-parse
  EMVCo TLV here.
- **Don't break the payer scanner.** Sharing `expo-camera`
  plumbing must not regress `app/scan-to-pay.tsx` (task 07) —
  instance the component, don't toggle a global flag.

## Acceptance

- [ ] `app/merchant/signup-intro.tsx` exists and renders the fork.
- [ ] Scan path decodes a real QRIS sticker and routes to the form
      with fields pre-filled (end-to-end, given tasks 04 + 12 are
      merged).
- [ ] Manual path routes to the form with blank fields.
- [ ] No USDC / chain language visible to merchant eyes.
- [ ] `pnpm check:syntax` passes.
- [ ] `pnpm biome:check` passes.

## Out of scope

- The signup form itself — task 12.
- Sticker photo capture + compression + upload — task 14.
- Merchant QR home screen post-submission — task 13.
- QRIS claim dispute flow (§12 Q9) — task 45.
