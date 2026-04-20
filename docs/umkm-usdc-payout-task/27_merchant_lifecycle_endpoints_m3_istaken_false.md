# Task 27 — Merchant Lifecycle Endpoints (signup / me / patch / qr)

**Status:** Not taken
**Owner:** Backend (takumipay-api)
**Spec reference:** umkm-usdc-payout-spec.md §6.1, §4.4, milestone M3

## Why this matters
These four endpoints drive the merchant onboarding flow (§1.1.1). A merchant signs up once, edits channel details as needed, and prints their chain-agnostic JWS-signed QR. The JWS signing lives server-side because the private PEM must never leave `takumipay-api` — mobile only verifies against the bundled public JWK (`EXPO_PUBLIC_TAKUMIPAY_QR_PUBKEY_JWK`).

## Scope
1. `POST /v1/merchants/signup` per §6.1 `MerchantSignupRequest` → 201 `MerchantProfile`. Idempotent on `(userId, latest submission)`. Returns the freshly-signed JWS on the `qr` block.
2. `GET /v1/merchants/me` → 200 `MerchantProfile`. Returns cached `jws_qr` from the row — do NOT re-sign on every read.
3. `PATCH /v1/merchants/me` per §6.1 `MerchantPatch`. Changing `channelCode` / `accountNumber` / `accountHolderName` invalidates the cached JWS and re-issues with a fresh `iat`. Changing `displayName` alone also re-issues (JWS payload carries `merchantName`).
4. `GET /v1/merchants/me/qr` → 200 `MerchantQrResponse`. Returns a fresh JWS (rotated `iat`) plus a server-rendered `pngBase64` for Save-to-Photos convenience.
5. Sign JWS with ES256 using `TAKUMIPAY_QR_PRIVATE_KEY_PEM` from `takumipay-api/.env`. Payload shape per §4.4: `{ merchantId, merchantName, country, currency, amountMinor: null, reference?, iat, exp? }`.
6. Emit `takumipay:v1:<base64url(JWS)>` wire format.
7. Validate `channelCode` against the `channels` table on signup/patch — 400 with pointer to `GET /v1/merchants/channels` on unknown codes (§6.0 type commentary).
8. Encrypt `xendit_account_number` at rest (§6.6 sensitive-fields list — KMS / pgcrypto / application envelope, whichever the repo already uses).

## Rules (non-negotiable)
- Three-role separation: private signing key lives only in server env. Mobile never signs. Users never hold the key.
- Chain-extension discipline: JWS is chain-agnostic by design (§4.4) — NO `chainId`, NO treasury address, NO settlement-path hint on the payload. A future Arc mainnet flip / Solana expansion does not reprint merchant stickers.
- Filter-at-source: `channelCode` validation is a single JOIN against `channels` — do not duplicate the channel list in a constants file.

## Acceptance
- [ ] Four endpoints wired; Zod schemas shared with mobile via `api/types/merchant.ts`.
- [ ] JWS verifies against the bundled mobile pubkey (cross-check with a test fixture loaded from the mobile constants file).
- [ ] PATCH with channel change re-issues JWS (new `iat`, same `merchantId`) and persists to `jws_qr` / `jws_issued_at`.
- [ ] Signup is idempotent — re-POST within 30 s returns the same profile.
- [ ] `pnpm run test -- --testPathPattern=merchants` green.
- [ ] `pnpm check:syntax` and `pnpm biome:check` clean.

## Out of scope
- QRIS PAN claim dispute workflow (task 45).
- `GET /v1/merchants/channels` endpoint (task 28).
- `GET /v1/merchants/me/payouts` pagination (deferred per §6.1 comment).
