# Task 09 — TakumiPay JWS keypair + bundled public JWK

**Status:** Not taken
**Owner:** Mobile + Backend (mobile-app + takumipay-api) + Ops
**Spec reference:** umkm-usdc-payout-spec.md §13 step 6, §4.4 (rotation paragraph), §10 (env vars), milestone M1

## Why this matters

The TakumiPay JWS detector (task 05) verifies merchant QRs **offline**
against a bundled public key — so signature trust doesn't depend on a
live API. This task generates the ES256 keypair, lands the public JWK
on the app via a bundled constant + env var, and pins the private PEM
in the server env. Without this task, task 05 has nothing to
`importJWK` against.

## Scope

1. Generate the keypair:
   ```
   openssl ecparam -name prime256v1 -genkey -noout -out qr-key.pem
   openssl ec -in qr-key.pem -pubout -out qr-key.pub.pem
   ```
   Extract the public JWK (`{ kty: "EC", crv: "P-256", x, y, alg: "ES256", kid: "<rotation-date>" }`) using `jose`
   or `node-jose` — keep `kid` set to the generation date
   (`"2026-04-20"`) so OTA rotation can be traced.
2. Create `constants/takumipayKey.ts` exporting
   `publicKeyJwk: JWK` read from the env var
   `EXPO_PUBLIC_TAKUMIPAY_QR_PUBKEY_JWK` at module load:
   ```ts
   import type { JWK } from "jose";
   const raw = process.env.EXPO_PUBLIC_TAKUMIPAY_QR_PUBKEY_JWK;
   if (!raw) throw new Error("EXPO_PUBLIC_TAKUMIPAY_QR_PUBKEY_JWK not set");
   export const publicKeyJwk: JWK = JSON.parse(raw);
   ```
3. Update `.env.example` with the new var. Document its format
   (single-line JSON) and warn operators that mobile builds **fail
   at module load** if missing — deliberate, so a prod build can't
   silently ship without a verifier key.
4. Stash the private PEM in `takumipay-api/.env` as
   `TAKUMIPAY_QR_PRIVATE_KEY_PEM` (the signer code for backend is a
   sibling task on `takumipay-api`). Include the env key in
   `takumipay-api/.env.example`.
5. Document the **OTA rotation path** in
   `docs/umkm-usdc-payout-spec.md` is already described at §4.4
   final paragraph — add a one-liner cross-reference comment at the
   top of `constants/takumipayKey.ts` pointing readers to "rotate
   via EAS OTA — same channel as `EIP7702_ALLOWLIST`."
6. Coordinate with task 05: the detector's test suite generates its
   own throwaway keypair and does **not** depend on this file at
   test time. The production app does depend on it.

## Rules (non-negotiable)

- **Private key never leaves `takumipay-api/.env`.** Not committed,
  not mirrored to `takumi-agent-api`, not in mobile env, not in
  EAS Secrets under any `EXPO_PUBLIC_*` prefix.
- **Public key only as `EXPO_PUBLIC_*`** — it's bundled into the
  build, not fetched from any API (§4.4: "we can't trust an
  API-delivered pubkey to verify a merchant QR the user scanned
  without a connection").
- **Rotation is EAS OTA, not a store release** — document the path
  and keep the `kid` field populated so rotations are auditable.
- **No hardcoded JWK.** Reading from env lets CI inject a test key
  and prod inject the real one without code changes.

## Acceptance

- [ ] `constants/takumipayKey.ts` exports `publicKeyJwk` read from
      env.
- [ ] `.env.example` updated with `EXPO_PUBLIC_TAKUMIPAY_QR_PUBKEY_JWK`.
- [ ] `takumipay-api/.env.example` updated with
      `TAKUMIPAY_QR_PRIVATE_KEY_PEM`.
- [ ] App build fails fast when env var is missing.
- [ ] `pnpm check:syntax` passes.
- [ ] `pnpm biome:check` passes.

## Out of scope

- Backend signing code for `takumipay:v1:<JWS>` — `takumipay-api`
  task.
- Rotation tooling (scripted key gen + EAS OTA script) — ops task
  50.
- `EIP7702_ALLOWLIST` shares the same rotation channel (existing
  plumbing).
