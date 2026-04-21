# Task 10 — "Register as Merchant" CTA on `app/login.tsx`

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** umkm-usdc-payout-spec.md §1.1.1 step 1, §1.1 (roles), milestone M1

## Why this matters

Merchant onboarding lives on the same auth principal as the payer
app (§1.1) — one device, one wallet, two roles. The entry point is
a second primary button on the login screen with **equal visual
weight** to "Sign in as Payer." Without this CTA, the merchant
signup flow (tasks 11–14) has no reachable entry.

## Scope

1. In `app/login.tsx`, add a second primary button labeled
   **"Register as Merchant"** next to (or under) the existing
   "Sign in as Payer" CTA.
2. Match the existing primary button's style exactly — same height,
   padding, font weight, corner radius, disabled/pressed states.
   The spec is explicit: **equal visual weight**, not a secondary
   treatment.
3. On press, navigate to `/merchant/signup-intro` (the screen in
   task 11). Pre-creation auth hand-off remains identical to the
   payer path — merchant signup signs the user in via the existing
   auth flow; the merchant profile is a downstream `/v1/merchants/
   signup` POST (task 12 / M3 backend).
4. Layout must gracefully handle the extra button on both small
   (iPhone SE) and large (Pro Max / tablet) widths — stack
   vertically with the same horizontal margin as the existing CTA.
5. Copy audience rule (§1.1) — the button is on a **pre-auth
   surface**, readable by anyone. Do not mention USDC, chains, or
   gas in the button label or any adjacent explanatory text.
   "TakumiPay" and "merchant" are allowed.

## Rules (non-negotiable)

- **Equal visual weight.** The merchant CTA is not a secondary
  button, not a text link, not a muted outline — identical prominence.
- **Copy-audience rule** (memory cross-ref: spec §1.1 bullet "Copy
  audience rule") — no USDC / chain / gas / signature language on
  this screen.
- **Three-role separation** (memory `feedback_role_separation.md`)
  — the CTA just navigates; auth and signup server calls happen
  downstream.
- **Do not gate on feature flag in M1.** The downstream screens
  are stubs, but the entry point ships with M1 so the flow can be
  tested end-to-end.

## Acceptance

- [ ] `app/login.tsx` renders both CTAs with identical styling.
- [ ] Pressing "Register as Merchant" routes to
      `/merchant/signup-intro`.
- [ ] Visual review passes on iPhone SE (small) + iPhone 15 Pro Max
      (large) + iPad-ish width.
- [ ] Copy contains no crypto-native terms.
- [ ] `pnpm check:syntax` passes.
- [ ] `pnpm biome:check` passes.

## Out of scope

- `/merchant/signup-intro` content — task 11.
- Signup form — task 12.
- Merchant QR home — task 13.
- Backend signup endpoint (§6.1 `MerchantSignupRequest`) — M3 /
  backend task.
- Merchant re-entry from Profile/Settings (§1.1.1 final paragraph)
  — tracked in task ≈ 22 (M2).
