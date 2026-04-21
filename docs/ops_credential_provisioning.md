# Ops Credential Provisioning — Pre-Launch Checklist

**Status:** Authoritative pre-launch runbook (paired with Task 50)
**Spec:** `docs/umkm-usdc-payout-spec.md` §13 (step-by-step pre-launch),
§10 (env var catalogue), §4.4 (JWS rotation rules)
**Cross-referenced tasks:** 09 (JWS keypair), 24 (settle proxy), 29 (Xendit
PayoutProvider), 32 (push on PAID_OUT), 37 (UserOp submit proxy), 43 (SVM
facilitator), 47 (env var minimization guard), 48 (mainnet migration)

## How to read this file

- Each step is tagged `[ops]`, `[legal]`, or `[engineering]`. Most steps are
  `[ops]` with one-line `[engineering]` hand-offs; legal steps are called out
  so they don't get scheduled off the critical path.
- **Order matters.** Steps are grouped by blocking milestone. Xendit KYB
  (Section 1) must start on day 0 — KYB is the only provisioning item with
  calendar-day latency we can't compress.
- Placeholders only. No real keys, no real URLs beyond public docs. Every
  `<PLACEHOLDER>` is a slot an ops engineer fills in the vault, never in
  this file.
- Secret boundary: **nothing from this runbook (except the public QR JWK in
  step 5) reaches mobile `EXPO_PUBLIC_*`**. Task 47's `check:env` guard
  enforces this in CI.

---

## 1. Xendit — payout provider (M3 blocker — start day 0)

Xendit KYB has multi-day turnaround; every other step can happen inside
hours. Get this moving first.

1. `[ops]` Register the TakumiPay business entity at
   [`dashboard.xendit.co`](https://dashboard.xendit.co). Select Indonesia as
   the operating country.
2. `[legal]` Collect and upload KYB pack:
   - Akta Pendirian / deed of incorporation
   - NIB (Nomor Induk Berusaha)
   - SIUP (Surat Izin Usaha Perdagangan)
   - NPWP
   - Directors' KTP / passport
   - Company bank account statement (for settlement account verification)
3. `[legal]` Sign Xendit's Data Processing Agreement (DPA) and Merchant
   Services Agreement. Keep signed PDFs in the legal vault.
4. `[ops]` Once approved (typically 2–5 business days): *Settings →
   Activation* — enable **Payouts to E-Wallets** (GOPAY, OVO, DANA, LINKAJA,
   SHOPEEPAY_ID) and **Payouts to Bank Accounts** (BCA, Mandiri, BNI, BRI,
   …). Each rail may require a per-channel form — fill in the order shown
   in §6.8 seed data.
5. `[ops]` *Settings → Developers → API Keys* — generate a **Test Secret
   Key** first (`xnd_development_…`) for M3 dev. Generate the Production
   key (`xnd_production_…`) **only** when staging integration passes
   (task 48 step 3 gates this).
6. `[ops]` *Settings → Developers → Callbacks* — register webhook:
   `https://<takumipay-api-host>/webhooks/xendit`. Xendit shows the
   `x-callback-token` once — copy immediately into the vault.
7. `[engineering]` Backend env (placeholder names only):
   ```
   XENDIT_SECRET_KEY=<xnd_development_… | xnd_production_…>
   XENDIT_WEBHOOK_TOKEN=<ops-vault>
   XENDIT_ENV=sandbox   # flip to "production" at task 48 cutover
   ```
   Backend boot asserts all three present (fail-fast). Cross-ref task 29
   for the `PayoutProvider` port and task 30 for the webhook verifier.
8. `[ops]` Configure Xendit failure alerts → PostHog / Slack / Linear
   (Section 8). Xendit exposes `/v2/payouts/{id}` — cron that reconciles
   and alerts on lag > 5 minutes.

**Open question:** confirm with Xendit AM whether sandbox `x-callback-token`
differs from production. Historically they do; plan rotation at cutover.

---

## 2. Circle Gateway + Nanopayments — settle (M2 blocker — minutes)

No KYB for the critical path. Gateway's x402 endpoints are permissionless
(OpenAPI declares `security: []`).

1. `[engineering]` Point `takumipay-api` at the Gateway testnet base:
   `CIRCLE_GATEWAY_API=https://gateway-api-testnet.circle.com`. Task 48
   step 2 flips to `https://gateway-api.circle.com` at mainnet cutover.
2. `[ops]` *(optional)* Sign up at [`app.circle.com`](https://app.circle.com)
   and mint `CIRCLE_API_KEY` — only needed for the Developer Console
   dashboards (transfer history, attestation inspection). Not on the
   critical path; store in vault if minted.
3. `[legal]` Review Circle's User Agreement + DPA. Sign before prod.
4. `[ops]` Decide on Indonesia settlement posture with Circle's compliance
   team — **open question, see below.** This is the one Circle-side item
   that may add calendar days.
5. `[engineering]` Env at the backend:
   ```
   CIRCLE_GATEWAY_API=https://gateway-api-testnet.circle.com
   CIRCLE_API_KEY=<optional — dashboards only>
   CIRCLE_X402_SUPPORTED_URL=${CIRCLE_GATEWAY_API}/gateway/v1/x402/supported
   ```
   Backend boot-cache consumes `/x402/supported` once (task 22); daily
   refresh cron handles key rotation / domain bumps.
6. `[engineering]` Cross-ref task 24 (`POST /gateway/v1/x402/settle` proxy)
   — mobile never talks to Circle directly.

**Open question:** Does Circle auto-approve Indonesia-resident treasury
addresses, or does the compliance team require a KYC/KYB review before
enabling mainnet settle? Ask Circle AM before scheduling task 48 step 2.

---

## 3. Arc Network — source + destination chain (M2 blocker — no account)

1. `[ops]` No account. Verify Arc testnet + (once live) mainnet RPCs in
   `docs.arc.network`. Record RPC + chain ID into the `blockchains` seed
   (task 20) — **not** into env.
2. `[ops]` Fund the platform treasury address (step 6 below) on Arc Testnet
   via `faucet.circle.com`. For mainnet, fund via Circle's bridge /
   exchange ramp per task 48 step 4.
3. `[engineering]` No env var for Arc RPC — it lives on the `blockchains`
   row per chain-extension discipline. Seed script (§6.8) is authoritative.

---

## 4. Bundler — ERC-4337 (M4 blocker)

Pick one provider; use the same account across chains.

1. `[ops]` Pick: Pimlico, Alchemy, or Stackup. Compare pricing on sponsored
   ops + rate limits for Arbitrum + Base. Record decision in the ops log.
2. `[ops]` Sign up, enable Base + Arbitrum + any testnets we run against,
   copy **full bundler URL with key embedded** per chain.
3. `[legal]` Review bundler ToS — specifically, sponsor agreement + uptime
   SLA. Note any rate-limit terms that affect our UserOp volume.
4. `[engineering]` Seed the **full bundler URL with key embedded** into the
   `Blockchain.bundlerUrl` column for each supported chain — NOT into env.
   One SQL UPDATE per chain:
   ```sql
   UPDATE "Blockchain" SET "bundlerUrl" = '<url-with-key>' WHERE "chainId" = 8453;    -- Base mainnet
   UPDATE "Blockchain" SET "bundlerUrl" = '<url-with-key>' WHERE "chainId" = 84532;   -- Base Sepolia
   UPDATE "Blockchain" SET "bundlerUrl" = '<url-with-key>' WHERE "chainId" = 42161;   -- Arbitrum
   UPDATE "Blockchain" SET "bundlerUrl" = '<url-with-key>' WHERE "chainId" = 421614;  -- Arbitrum Sepolia
   ```
   Cross-ref task 37 (`POST /v1/userop/submit` proxy). The column is
   server-only — task 21's `/v1/blockchains` enricher explicitly excludes
   it, so mobile never sees the key. Rotation is an `UPDATE` + a 60s cache
   TTL wait (or restart); no deploy cycle.
5. `[engineering]` Circle Paymaster addresses also live on
   `Blockchain.paymasterAddress` — **DB row, not env.** Pull canonical
   addresses from `developers.circle.com/paymaster` at seed time (task 20).
6. `[engineering]` Planned migration: split the URL from the key and move
   the key to a secrets manager with `Authorization: Bearer` header auth.
   Tracked in `api/docs/security_review_needed.md §4`.

---

## 5. x402 Facilitator (M5 + M6)

Two surfaces: the CDP facilitator for EVM x402, and an SVM facilitator for
Path B-SVM.

1. `[ops]` **EVM (Coinbase CDP):** sign up at
   [`cdp.coinbase.com`](https://cdp.coinbase.com), create a project,
   enable x402 module. First 1k tx/month are free. Copy API key into
   vault.
2. `[engineering]` Env:
   ```
   CDP_X402_API_KEY=<vault>
   CDP_X402_ENV=sandbox   # flip at task 48
   ```
3. `[ops]` **SVM (Solana):** contact Circle for production facilitator
   access — may auto-provision via existing Circle account. Fallback: the
   candidate short-list from §12 Q7 (rapid402, x402-solana.com, or a
   self-hosted `x402-facilitator` reference server).
4. `[engineering]` Env:
   ```
   CIRCLE_X402_SVM_FACILITATOR_URL=<vault>
   ```
   Cross-ref task 43 (SVM facilitator backend).

**Open question:** Does Circle's SVM facilitator auto-provision with the
existing Circle account, or does it need a separate onboarding flow?
Escalate to Circle AM at the same time as the Section 2 Indonesia review.

---

## 6. TakumiPay signing keys + treasury wallets (M1 blocker)

Cross-ref task 09 (JWS keypair bundling), task 47 (env guard), and the
existing `docs/jwk_rotation_runbook.md` for rotation mechanics.

### 6a. QR signing keypair

1. `[ops]` Generate ES256 keypair once per environment (dev / staging /
   mainnet):
   ```
   openssl ecparam -name prime256v1 -genkey -noout -out qr-key.pem
   ```
2. `[ops]` Store **private PEM in backend vault** (HashiCorp Vault, AWS
   Secrets Manager, or Doppler — *never* a raw `.env` file in production).
   Mount into `takumipay-api` as `TAKUMIPAY_QR_PRIVATE_KEY_PEM` at runtime.
3. `[engineering]` Extract public JWK (`jose` CLI or `node-jose`) and
   publish via **EAS Secret** as
   `EXPO_PUBLIC_TAKUMIPAY_QR_PUBKEY_JWK`. This is the *only* credential
   from this runbook that touches mobile.
4. `[ops]` Rotation cadence: yearly on a fixed calendar date + one forced
   rotation at mainnet cutover (task 48 step 1). Follow
   `docs/jwk_rotation_runbook.md` for the dual-publish → mobile OTA →
   retire-old sequence.

### 6b. EVM treasury wallet

1. `[ops]` Mint a fresh EOA for v1. *Preferred path for production:* MPC
   custody (Fireblocks, Turnkey, Copper) or a 2-of-3 Safe multisig with
   hardware-backed signers. v1 dev/staging can run a plain EOA if the
   private key lives in the backend vault.
2. `[engineering]` Env:
   ```
   ARC_SETTLER_PRIVATE_KEY=<vault — never in repo>
   PLATFORM_TREASURY_ADDRESS_EVM=<public address>
   ```
3. `[ops]` Fund with seed USDC on Arc Testnet (via `faucet.circle.com`)
   for dev; bridge real USDC for mainnet per task 48 step 4.
4. `[engineering]` Same key reused by refund flows (task 49).

### 6c. SVM treasury wallet (M6 blocker)

1. `[ops]` Generate a fresh Solana keypair (`solana-keygen new
   --outfile platform-svm.json`).
2. `[engineering]` Env:
   ```
   SVM_SETTLER_PRIVATE_KEY=<vault — base58>
   PLATFORM_TREASURY_ADDRESS_SVM=<vault — base58 pubkey>
   ```
3. `[ops]` Create the USDC Associated Token Account (ATA) on Solana
   devnet (dev/staging) and mainnet-beta (prod). Fund with seed USDC.
4. `[engineering]` Cross-ref task 43 for the SVM settlement path.

---

## 7. Push notifications — FCM / APNs (M3 blocker for task 32)

1. `[ops]` Create / reuse the Firebase project. Register Android + iOS
   app IDs matching the EAS build config.
2. `[ops]` Upload APNs **auth key** (`.p8`) to Firebase — auth key,
   not certificate, so it survives beyond a year.
3. `[engineering]` Copy Firebase server key / service-account JSON into
   backend vault:
   ```
   FCM_SERVICE_ACCOUNT_JSON=<vault>
   ```
   Cross-ref task 32 (push on PAID_OUT).
4. `[ops]` In EAS dashboard: configure iOS provisioning profile + push
   cert. Verify `google-services.json` (Android) + `GoogleService-Info.
   plist` (iOS) are bundled in the managed workflow.
5. `[engineering]` Test deep-link payload shape before enabling for real
   users — payload must match the agent-mode contract in §8.3.

---

## 8. Monitoring + alerting

1. `[engineering]` **PostHog** — already wired into mobile. Add product
   events for intent lifecycle (CREATED / PAID / PAID_OUT / FAILED).
2. `[ops]` **Backend metrics** — Grafana (self-hosted) or Datadog
   (managed). Dashboards: Xendit success rate, Circle settle latency,
   bundler UserOp success rate, webhook handler p95.
3. `[ops]` **Alerts** — Slack channel `#alerts-payments` + Linear
   auto-ticket for any P1 (Xendit failure rate > 2% over 5 min, Circle
   settle 5xx, webhook signature verification failures).
4. `[ops]` **Error tracking** — Sentry (or PostHog error tracking)
   wired to both `takumipay-api` and the mobile app.

---

## 9. Legal + compliance

1. `[legal]` Terms of Service + Privacy Policy drafted with counsel,
   localized ID + EN, published before public launch. Link from mobile
   onboarding + merchant signup (task 11, task 12).
2. `[legal]` Data Processing Agreements signed:
   - Xendit (see Section 1 step 3)
   - Circle (see Section 2 step 3)
   - Bundler provider (see Section 4 step 3)
   - Firebase / Google (see Section 7)
   - PostHog (self-serve DPA available in dashboard)
3. `[legal]` **Payer-facing KYC is deferred** per §12 Q4 — revisit when
   Bank Indonesia guidance on QRIS-crypto routing clarifies. Document
   the deferral decision in the legal log with review date.
4. `[legal]` AML / transaction-monitoring policy — draft before
   mainnet. Even without KYC, Xendit's own AML controls apply to our
   entity as their merchant.

---

## Acceptance (mirrors task 50 acceptance)

- [ ] All seven credential groups provisioned for dev/testnet by end of M2.
- [ ] Backend boot asserts required env present per milestone (fail-fast).
- [ ] Task 47 `check:env` guard green: no `EXPO_PUBLIC_*` contains a
      Xendit / Circle / bundler / private-key value.
- [ ] This runbook updated with current secret owners and rotation dates.
- [ ] Prod equivalents provisioned before the task 48 cutover window
      opens.

---

## Open questions (escalate before mainnet)

- **Circle Indonesia settlement:** auto-approve or compliance review?
  (Section 2 step 4)
- **Circle SVM facilitator:** auto-provisioned on the existing Circle
  account, or separate onboarding? (Section 5 step 3)
- **Xendit sandbox vs prod webhook token:** assume rotation required at
  cutover; confirm with Xendit AM. (Section 1 step 6)
- **Bundler SLA:** which provider wins on sponsored-op rate limits for
  our projected Base + Arbitrum volume? (Section 4 step 1)
- **MPC vs multisig for treasury v1:** decide before mainnet; v1
  dev/staging is fine with vault-held EOA. (Section 6b)
