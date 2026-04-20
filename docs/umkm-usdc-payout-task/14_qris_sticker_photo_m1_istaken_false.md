# Task 14 — QRIS sticker photo capture + compress + upload

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** umkm-usdc-payout-spec.md §1.1.1, §11.1 (packages), §12 Q9 (evidence archive), milestone M1

## Why this matters

When a merchant onboards via the "Scan my QRIS" path (task 11), we
capture a photo of the physical sticker as **lightweight evidence**
for the QRIS PAN claim. First-claim-wins on `qrisPan` (§12 Q9) is
dispute-safe only if ops can later review "did the merchant who
claimed this PAN actually hold the sticker?" The photo is the answer.
Compression is non-negotiable — uncompressed camera frames blow past
any sane upload limit and ruin the onboarding experience on mediocre
3G.

## Scope

1. Add `expo-image-picker` and `expo-image-manipulator` as deps
   (per §11.1; introduced in M1 alongside this task).
2. Create `hooks/useCaptureStickerPhoto.ts` exposing:
   ```
   captureFromCamera(): Promise<{ uri: string; base64: string }>
   captureFromLibrary(): Promise<{ uri: string; base64: string }>
   compress(uri): Promise<{ uri: string; base64: string; bytes: number }>  // ≤200 KB JPEG
   upload({ uri }): Promise<{ stickerPhotoKey: string }>
   ```
3. Compress rules (`expo-image-manipulator`):
   - Resize so the longest edge ≤ 1600 px.
   - JPEG quality start 0.8; drop in 0.1 steps until byte size
     ≤ 200 KB.
   - If a single-axis resize can't hit the budget, fall back to
     1024 px longest edge.
4. Upload via the existing upload pipeline (or a new
   `POST /v1/uploads/merchant-sticker` if none exists — coordinate
   with backend task). Server returns `{ stickerPhotoKey: string }`;
   pass through unchanged into the task 12 form's `qrisLink.
   stickerPhotoKey`.
5. Wire the capture step into the scan path on task 11:
   - After EMVCo decode succeeds, take one still frame from
     `expo-camera` (or, fallback, re-open the picker) — the still
     is the sticker photo, not the QR pixel itself.
   - Show a small "Photo attached ✓" confirmation before
     navigating to `/merchant/signup-form`.
6. Permissions:
   - Camera permission is already requested on scan path; reuse.
   - Gallery fallback requires `expo-image-picker`'s permission
     prompt — handle denial gracefully (offer "Try camera again").
7. On upload failure: surface a retry toast; do not block form
   submission — backend accepts `qrisLink` as optional, but M1
   target UX is "photo attached" on the happy path.

## Rules (non-negotiable)

- **200 KB JPEG ceiling.** Never upload raw camera frames.
- **Copy-audience rule.** Capture UI is on the merchant flow; any
  visible copy references "photo of your sticker" — never "QR
  pixel" / "image payload" / anything technical.
- **Three-role separation** (memory `feedback_role_separation.md`)
  — the upload hook posts to our backend; the wallet is not
  involved. Do not include wallet signing.
- **Evidence, not identity.** The photo is not a KYC doc; do not
  rename it, do not prompt for NIK / selfie. §12 Q9 is explicit:
  lightweight evidence archived for manual dispute review, not
  biometric / document verification.
- **Do not retain base64 in persistent state.** Keep in-memory
  until upload returns `stickerPhotoKey`; then discard.

## Acceptance

- [ ] `expo-image-picker` + `expo-image-manipulator` on
      `package.json`.
- [ ] `useCaptureStickerPhoto` hook exists with the four methods
      above.
- [ ] Output JPEG is ≤ 200 KB (verified on a real Android device
      photo, not just a synthetic test).
- [ ] Scan path on task 11 attaches the photo and
      `stickerPhotoKey` reaches the signup form on task 12.
- [ ] Upload failure does not block form submit.
- [ ] `pnpm check:syntax` passes.
- [ ] `pnpm biome:check` passes.

## Out of scope

- Server-side object storage + signed-URL retrieval for the
  merchant QR home card thumbnail (task 13) — `takumipay-api` task.
- Dispute-review tooling (`merchant_qris_claims` table, §12 Q9) —
  task 45.
- Re-upload / re-link flow from Settings — M2 task.
