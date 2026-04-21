# TakumiPay QR JWK Rotation Runbook

**Scope:** rotating `EXPO_PUBLIC_TAKUMIPAY_QR_PUBKEY_JWK` on mobile and
its paired `TAKUMIPAY_QR_PRIVATE_KEY_PEM` on `takumipay-api`.
**Cadence:** scheduled yearly, emergency rotation on suspected compromise.
**Spec references:** `umkm-usdc-payout-spec.md` §4.4 (QR signing), §10
(mobile env surface), §13 (mainnet migration step 6).

The mobile app verifies merchant QR JWS payloads **offline** against the
bundled public JWK — we cannot trust an API-delivered pubkey to verify
a QR the user just scanned without a connection. Rotation therefore
ships to clients via **EAS OTA update**, not a store release, on the
same channel used for `EXPO_PUBLIC_EIP7702_ALLOWLIST`.

---

## 1. Generate a new P-256 keypair

Ops operator, local machine, never inside `takumipay-api`:

```bash
# Private PEM (stays on the server)
openssl ecparam -name prime256v1 -genkey -noout -out qr_private_new.pem

# Public PEM (discardable — we derive the JWK from the private one)
openssl ec -in qr_private_new.pem -pubout -out qr_public_new.pem

# Derive the JWK (single-line JSON). `kid` is the rotation date.
node -e '
const { importPKCS8, exportJWK } = require("jose");
const fs = require("node:fs");
(async () => {
  const priv = await importPKCS8(fs.readFileSync("qr_private_new.pem", "utf8"), "ES256", { extractable: true });
  const jwk = await exportJWK(priv);
  // exportJWK on a private key returns d; strip it for the PUBLIC JWK.
  const { d, ...pub } = jwk;
  pub.alg = "ES256";
  pub.kid = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  process.stdout.write(JSON.stringify(pub));
})();
' > qr_public_new.jwk.json
```

Confirm the shape — it MUST be:

```json
{"kty":"EC","crv":"P-256","x":"…","y":"…","alg":"ES256","kid":"YYYY-MM-DD"}
```

Never commit `qr_private_new.pem` or `qr_public_new.jwk.json` to git.
Wipe both once they're uploaded to their respective secret stores.

## 2. Update the server (`takumipay-api`) secret

1. Upload the PEM to the server secret store (1Password / Vault /
   whichever `takumipay-api` uses):
   - Key: `TAKUMIPAY_QR_PRIVATE_KEY_PEM`
   - Value: contents of `qr_private_new.pem`
2. Keep the PREVIOUS key available under `TAKUMIPAY_QR_PRIVATE_KEY_PEM_PREVIOUS`
   for the grace period — the signer dual-signs so clients on the old
   bundle can still verify merchant QRs issued during the transition.
3. Deploy `takumipay-api` with the dual-sign configuration **before**
   pushing the new public JWK to mobile.

## 3. Update the mobile env-var locally (dev smoke test)

Developer machine:

```bash
# In mobile-app/.env (YOUR actual dev env, not .env.example)
EXPO_PUBLIC_TAKUMIPAY_QR_PUBKEY_JWK={"kty":"EC","crv":"P-256","x":"…","y":"…","alg":"ES256","kid":"YYYY-MM-DD"}

# Boot the app; scan a QR signed by the new key. The verifier at
# `services/paymentIntent/detectors/takumipayJws.ts` should accept it.
# Scanning a QR signed by the OLD key should ALSO work during grace
# period — backend is still dual-signing.
pnpm start
```

Then `pnpm check:syntax` and `pnpm biome:check` to confirm nothing
downstream broke.

## 4. Upload to EAS Secrets

```bash
# mobile-app/ root, logged-in operator
eas env:create production \
  --name EXPO_PUBLIC_TAKUMIPAY_QR_PUBKEY_JWK \
  --value '{"kty":"EC","crv":"P-256","x":"…","y":"…","alg":"ES256","kid":"YYYY-MM-DD"}' \
  --visibility plaintext --force

# Mirror to preview/staging channels as needed
eas env:create preview --name EXPO_PUBLIC_TAKUMIPAY_QR_PUBKEY_JWK --value '…' --force
```

`--visibility plaintext` is intentional: this is a PUBLIC key, bundled
into the JS build. Never mark it `secret` — the value appears in
`process.env.*` at runtime anyway.

## 5. Ship the OTA update

```bash
# Bump the runtime version only if any native code changed.
# For a pure env-var rotation, the existing runtime is fine.

eas update --channel production \
  --message "Rotate TakumiPay QR verifier key to kid=YYYY-MM-DD"
```

Clients receive the update on next app foreground. The verifier hot-
loads on module init, so a fresh app launch after the OTA download
uses the new key.

## 6. Grace period — 7 days of dual signing

- **Day 0 (rotation day):** new public JWK is live on mobile via OTA;
  backend signs with BOTH old + new private keys. A QR issued in this
  window carries the `kid` of whichever key the backend picked for
  that request (default: new key; fallback: old key under a flag).
- **Day 0 – Day 7:** clients on the pre-rotation bundle (the JWK OTA
  hasn't landed yet, e.g. app hasn't been foregrounded) verify
  successfully against the OLD public key that's still embedded.
- **Day 7+:** backend stops signing with the old private key; the
  verifier on the pre-rotation bundle starts rejecting newly-issued
  QRs with `QR_TAMPERED` (§9.1 error matrix). The in-app update banner
  nudges users to foreground the app and pick up the OTA; no forced
  upgrade.

Seven days is the spec-mandated window (§4.4 final paragraph) —
matches the 7-day nanopay authorization validity.

## 7. Log the rotation

Append a row to `docs/jwk_rotations.md` with:

- Rotation date (`kid` value).
- Operator who executed the rotation.
- EAS Update ID of the release that shipped the new JWK.
- Git SHA of the `takumipay-api` deploy that activated dual signing.
- Grace-period cut-off date (old key retirement).

## 8. Verify

- [ ] New QR issued by `takumipay-api` verifies on a client with the
      new bundle.
- [ ] New QR issued by `takumipay-api` also verifies on a client still
      on the old bundle (during grace period).
- [ ] Old QR (signed with the old key pre-rotation) still verifies on
      a client with the new bundle (new bundle carries old `kid` in its
      trust list for 7 days — handled by the verifier's `kid` allow-set,
      not an env var).
- [ ] After grace cut-off, OLD-key QRs rejected with `QR_TAMPERED` as
      expected; new-bundle users unaffected.

## Emergency rotation (compromise)

Skip the grace period — old key retired immediately at step 6. Every
QR signed by the compromised key becomes untrusted. Merchants with
printed stickers must reprint; telemetry alerts the operator so we can
batch-notify via WhatsApp. Push the OTA on an accelerated timeline;
store-release escalation only if a critical mass of users can't
foreground the app within 24 h.
