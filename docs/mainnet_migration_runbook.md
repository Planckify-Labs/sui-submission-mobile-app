# Testnet → Mainnet Migration Runbook

**Scope:** one-time cutover from testnet to production for the UMKM
USDC payout rail. Covers the `takumipay-api` environment flip, the
`blockchains` + `tokens` DB update, the merchant JWS QR re-issuance,
the mobile EAS OTA that ships the new verifier JWK, and the rollback
per step. **Mobile store release is not required** — §10.1 is
explicit: all chain coordinates live in DB rows served by
`/v1/blockchains`, and only `EXPO_PUBLIC_TAKUMIPAY_QR_PUBKEY_JWK`
rotates (via EAS OTA).

**Spec references:** `umkm-usdc-payout-spec.md` §10.1 (migration
checklist), §13 (credential setup), §4.4 (chain-agnostic JWS), §7
(treasury model), §12 Q5 (refund path).

**Cross-references:**

- **Task 47 (env-var minimization)** — enforces the three-env-var
  rule; this runbook's mobile step (OTA the new JWK) is the only
  `EXPO_PUBLIC_*` rotation the three-env-var policy leaves live.
- **Task 49 (refund runbook)** — must be ready before this runbook
  executes; rollback §4 depends on it for stuck USDC.
- **Task 50 (ops credential provisioning)** — must be **complete**
  for all seven credential groups in production before step 1 of
  this runbook starts. This runbook consumes what task 50 provisions.

**Role tags** used below:

- `[ops]` — credential provisioning, funding, key custody.
- `[backend]` — `takumipay-api` deploys, DB SQL, JWS re-issuance
  script.
- `[mobile]` — EAS OTA, EAS env secrets.
- `[product]` — merchant comms, go/no-go decisions.

---

## 1. Pre-flight checklist

Run through this list **48 hours before** the cutover window. **Do
not proceed** if any item is unchecked — every item blocks a
downstream step.

### Credentials + infra

- [ ] `[ops]` Arc mainnet chain ID confirmed from
      `docs.arc.network/arc/references/contract-addresses`. Recorded in
      the cutover ticket as `<ARC_MAINNET_ID>`. (Referenced below as
      `<ARC_MAINNET_ID>` in every SQL + env block.)
- [ ] `[backend]` All `Blockchain` rows for mainnet seeded or ready
      to `UPSERT`: **Arc**, **Base**, **Arbitrum**, **Ethereum**.
      Each row carries mainnet `rpc_url`, `explorer_url`,
      `gateway_wallet_contract`, `gateway_minter_contract`,
      `paymaster_address` (or `NULL`), `x402_domain_name`,
      `x402_domain_version`, `x402_verifying_contract`, and
      `is_testnet = false`. Values come from task 50 collection and
      `developers.circle.com/paymaster` + Circle `GET /gateway/v1/x402/supported`.
- [ ] `[backend]` `Token` rows per mainnet chain with canonical USDC
      contract addresses (`decimals = 6`, `is_native_currency = true`
      on Arc only). Reference: `developers.circle.com/stablecoins/usdc-on-main-networks`.
- [ ] `[ops]` Xendit production API key available to swap into
      `XENDIT_SECRET_KEY` (placeholder `xnd_production_XXXX-XXXX-XXXX`).
      `XENDIT_ENV=production`. Webhook token rotated to the production
      `x-callback-token` (placeholder `XXXX-XXXX-XXXX`).
- [ ] `[ops]` Circle production API key (optional, Developer Console
      only) available for `CIRCLE_API_KEY` (placeholder
      `LIVE_API_KEY:XXXX-XXXX-XXXX`). Settle endpoints remain
      permissionless; the key is for dashboards, not the critical path.
- [ ] `[ops]` Bundler production URLs available for every mainnet
      chain where Paymaster is live (Base, Arbitrum; Arc when the
      Paymaster row lands). Seeded into `Blockchain.bundlerUrl` per
      chainId via SQL `UPDATE` — **not** env. Placeholder:
      `https://api.pimlico.io/v2/<network>/rpc?apikey=XXXX-XXXX-XXXX`.
- [ ] `[backend]` x402 facilitator production URLs (Coinbase CDP or
      self-hosted Arc facilitator) recorded. For CDP, confirm the
      production project is activated and that the mainnet networks
      we support are enabled.
- [ ] `[ops]` `PLATFORM_TREASURY_ADDRESS_EVM` is a **fresh** prod EOA
      (not the testnet one). Funded with a small mainnet-ETH/USDC
      operating balance — sized for ~1 week of expected settle
      volume + gas. Private key stored only as
      `ARC_SETTLER_PRIVATE_KEY` in the server secret store. (Task 50
      owns the generation; this item confirms receipt.)
- [ ] `[ops]` `PLATFORM_TREASURY_ADDRESS_SVM` provisioned **only if
      M6 has shipped**; otherwise leave blank. USDC ATA created on
      Solana mainnet-beta if live.
- [ ] `[ops]` Mainnet merchant JWS signing keypair generated via the
      yearly-rotation procedure in `docs/jwk_rotation_runbook.md` §1.
      New `kid` **must differ** from the testnet `kid` (format:
      `YYYY-MM-DD`). Private PEM loaded into the server secret store
      as `TAKUMIPAY_QR_PRIVATE_KEY_PEM`; public JWK staged for the
      EAS env update in step 2.2.
- [ ] `[ops]` Testnet private PEM preserved for 30 days under
      `TAKUMIPAY_QR_PRIVATE_KEY_PEM_PREVIOUS` — powers the
      dual-verify grace window (§3 below) and backstops a rollback.

### Go/no-go

- [ ] `[product]` Merchant-comms template drafted (WhatsApp + email)
      for the QR re-issuance notice in §3.
- [ ] `[product]` Staff-only cutover tester identified and briefed
      (§5 smoke tests).
- [ ] `[backend]` Task 49 refund runbook acceptance criteria are all
      checked off — we **must** be able to refund a stuck first
      intent before we flip `XENDIT_ENV=production`.
- [ ] `[ops]` Pager / on-call rota set for the 48-hour window.

---

## 2. Deployment steps

Execute in order. Every step has a rollback pointer to §4.

### 2.1 Mobile OTA (ship 48 h before go-live) `[mobile]`

Rotate `EXPO_PUBLIC_TAKUMIPAY_QR_PUBKEY_JWK` to the production JWK so
clients have the new verifier **before** the backend starts signing
with the new private key. Same OTA channel as `EIP7702_ALLOWLIST`
(task 47).

```bash
# mobile-app/ root, logged-in operator
eas env:create production \
  --name EXPO_PUBLIC_TAKUMIPAY_QR_PUBKEY_JWK \
  --value '{"kty":"EC","crv":"P-256","x":"XXXX-XXXX-XXXX","y":"XXXX-XXXX-XXXX","alg":"ES256","kid":"YYYY-MM-DD"}' \
  --visibility plaintext --force

eas update --channel production \
  --message "Mainnet cutover: rotate TakumiPay QR verifier key kid=YYYY-MM-DD"
```

`--visibility plaintext` is intentional — this is the **public** JWK;
see `docs/jwk_rotation_runbook.md` §4.

- [ ] `[mobile]` EAS Update ID recorded in `docs/jwk_rotations.md`.
- [ ] `[mobile]` Spot-check: launch the production build on a
      foregrounded device; confirm a JWS signed with the **new** prod
      private key verifies. (Rollback: §4.1.)

### 2.2 Backend: deploy mainnet env + run pending migrations `[backend]`

Staged 24 h before go-live so the server runs dual-verify (new key
signing active; old key still accepted for 7 days per §3).

```bash
# takumipay-api/ — load prod secrets into the server secret store
# (Vault / 1Password / AWS SM — never commit). Values in placeholders:
TAKUMIPAY_QR_PRIVATE_KEY_PEM=XXXX-XXXX-XXXX        # prod signing key
TAKUMIPAY_QR_PRIVATE_KEY_PEM_PREVIOUS=XXXX-XXXX-XXXX  # testnet key (30 d)
XENDIT_SECRET_KEY=xnd_production_XXXX-XXXX-XXXX    # do NOT activate yet
XENDIT_ENV=sandbox                                  # still sandbox — flip in 2.4
XENDIT_WEBHOOK_TOKEN=XXXX-XXXX-XXXX
CIRCLE_GATEWAY_API=https://gateway-api.circle.com  # mainnet base URL
CIRCLE_API_KEY=LIVE_API_KEY:XXXX-XXXX-XXXX          # optional
PLATFORM_TREASURY_ADDRESS_EVM=0xXXXX-XXXX-XXXX
ARC_SETTLER_PRIVATE_KEY=0xXXXX-XXXX-XXXX
PLATFORM_TREASURY_ADDRESS_SVM=XXXX-XXXX-XXXX        # blank if pre-M6
SVM_SETTLER_PRIVATE_KEY=XXXX-XXXX-XXXX              # blank if pre-M6
# NOTE: bundler URLs are NOT env — they live in `Blockchain.bundlerUrl`.
# See the SQL seed block below. Leaving them out of env is intentional.
```

Seed bundler URLs into the DB (one `UPDATE` per chain where Paymaster is live):

```sql
UPDATE "Blockchain" SET "bundlerUrl" = 'https://api.pimlico.io/v2/base/rpc?apikey=XXXX-XXXX-XXXX'     WHERE "chainId" = 8453;
UPDATE "Blockchain" SET "bundlerUrl" = 'https://api.pimlico.io/v2/arbitrum/rpc?apikey=XXXX-XXXX-XXXX' WHERE "chainId" = 42161;
-- once Arc mainnet Paymaster lands:
UPDATE "Blockchain" SET "bundlerUrl" = 'XXXX-XXXX-XXXX'                                              WHERE "chainId" = <ARC_MAINNET_ID>;
```

Run pending migrations before the new image boots:

```bash
cd takumipay-api
pnpm prisma migrate deploy
pnpm prisma generate
```

Apply the `blockchains` + `tokens` mainnet data. Use `UPSERT` so the
script is idempotent; per §10.1:

```sql
-- Arc mainnet. Repeat the pattern for Base, Arbitrum, Ethereum.
UPDATE blockchains SET
  chain_id                 = <ARC_MAINNET_ID>,
  name                     = 'Arc',
  rpc_url                  = 'https://rpc.arc.network',
  explorer_url             = 'https://arcscan.app',
  is_testnet               = false,
  gateway_wallet_contract  = '0xXXXX-XXXX-XXXX',
  gateway_minter_contract  = '0xXXXX-XXXX-XXXX',
  paymaster_address        = NULL,        -- Arc USDC-native, no paymaster
  x402_domain_name         = 'GatewayWalletBatched',
  x402_domain_version      = '1',
  x402_verifying_contract  = '0xXXXX-XXXX-XXXX'
WHERE chain_id = 5042002;  -- testnet Arc row

-- USDC token row — repoint to mainnet USDC contract.
UPDATE tokens SET
  contract_address     = '0xXXXX-XXXX-XXXX',
  is_native_currency   = true
WHERE symbol = 'USDC' AND blockchain_id = (SELECT id FROM blockchains WHERE chain_id = <ARC_MAINNET_ID>);
```

- [ ] `[backend]` New image deployed. `/healthz` green.
- [ ] `[backend]` `GET /v1/blockchains` returns the mainnet rows with
      `is_testnet: false` for Arc / Base / Arbitrum / Ethereum.
- [ ] `[backend]` Backend boot log asserts all required env present
      (Xendit, bundler, Circle, treasury). Fail-fast per task 50 rule.
      (Rollback: §4.2.)

### 2.3 Fund prod relayer `[ops]`

Send mainnet USDC on each Gateway source chain we support (Arc, Base,
Arbitrum, Ethereum — per §10.1). Amount sized to cover the first week
of settle volume with a 3× safety margin. Confirm balance on each
chain explorer before proceeding.

- [ ] `[ops]` USDC balance on Arc ≥ initial float.
- [ ] `[ops]` USDC balance on Base ≥ initial float.
- [ ] `[ops]` USDC balance on Arbitrum ≥ initial float.
- [ ] `[ops]` USDC balance on Ethereum ≥ initial float.
- [ ] `[ops]` Mainnet-ETH (or Arc-USDC for gas) on the EOA for
      signing refund txs. (Rollback: §4.3.)

### 2.4 Flip Xendit last `[backend]`

This is what triggers real IDR disbursements. Do **not** run before
§2.3 is complete — an intent that settles in USDC without matching
IDR fallout is the exact failure mode task 49 exists to clean up.

```bash
# takumipay-api secret store — flip one env var:
XENDIT_ENV=production   # was: sandbox
```

Restart workers so the change is picked up (BullMQ payout queue reads
`XENDIT_ENV` at job dispatch time).

- [ ] `[backend]` Production Xendit auth validated: `curl -u
      $XENDIT_SECRET_KEY: https://api.xendit.co/v2/payouts_channels`
      returns 200 with prod channels.
- [ ] `[backend]` Webhook URL registered at
      `https://<prod-host>/webhooks/xendit`; `x-callback-token` set.
      (Rollback: §4.4.)

### 2.5 DNS / EAS-channel cutover `[ops] [mobile]`

Only required if mainnet runs on a different host/channel than staging:

- [ ] `[ops]` DNS `api.takumipay.<domain>` pointed at the mainnet
      `takumipay-api` load balancer (TTL-aware — drop to 60 s a day
      prior, restore to 300+ s after cutover).
- [ ] `[mobile]` `EXPO_PUBLIC_API_URL` confirmed pointing at the
      production host. If a dedicated prod EAS channel exists, run
      `eas update --channel production --message "Mainnet cutover"`
      after the DNS flip settles. (Rollback: §4.5.)

---

## 3. Merchant JWS re-issuance `[backend] [product]`

**Why this is needed.** Testnet-issued JWSes carry the testnet `kid`
and were signed by the testnet private key; they will fail
verification against the mainnet pubkey clients now carry. The JWS
payload itself is chain-agnostic (§4.4) — so merchants **do not
reprint stickers** — but the signature must be reissued from the
mainnet private key.

**Grace period.** 7 days of dual-verify — same pattern as the yearly
JWK rotation (`docs/jwk_rotation_runbook.md` §6) and the same window
as the spec's 7-day nanopay authorization validity (§4.4 final
paragraph). Mobile bundles both the new `kid` and the previous `kid`
in its trust allow-set for 7 days; after day 7, backend retires the
old private key and old-key JWSes reject with `QR_TAMPERED` (§9.1).

### 3.1 Run the re-issuance script `[backend]`

```bash
cd takumipay-api
pnpm run script:reissue-merchant-jws -- --env production
```

The script iterates every active merchant, calls
`qrSigningService.signJws(merchant)` with the mainnet key, and
persists the new `jws_qr` to the row. It is **idempotent** — rerun
against the old key if a rollback (§4) becomes necessary and it re-
signs backward.

- [ ] `[backend]` Script completes; row count matches
      `SELECT COUNT(*) FROM merchants WHERE status = 'ACTIVE'`.
- [ ] `[backend]` Spot-check three merchants across three different
      mainnet chains: decode `jws_qr`, verify against the new JWK,
      confirm `kid` matches the new value.
- [ ] `[backend]` Staging dry-run completed before prod execution
      (task 48 acceptance).

### 3.2 Notify merchants `[product]`

- [ ] `[product]` WhatsApp / email broadcast sent with copy: *"We've
      refreshed your TakumiPay QR. No action required — your existing
      sticker keeps working for 7 days while your app updates
      automatically. If a customer sees a 'QR Tampered' error, ask
      them to force-quit and reopen the app."*
- [ ] `[product]` In-app banner live for merchants who open
      `app/merchant/qr.tsx` during the grace period — points them to
      "Save to Photos" with the re-issued payload (the existing
      merchant QR screen already re-fetches from `/v1/merchants/me`;
      no code change needed — §4.4 chain-agnostic).

### 3.3 Close the grace window `[backend]`

Day 7 after cutover:

- [ ] `[backend]` Remove `TAKUMIPAY_QR_PRIVATE_KEY_PEM_PREVIOUS` from
      the server secret store; deploy. Backend now signs with the
      new key only.
- [ ] `[mobile]` Ship the OTA that drops the old `kid` from the
      verifier's trust allow-set. (Clients auto-update on next
      foreground.)
- [ ] `[ops]` Log the grace-period cutoff in `docs/jwk_rotations.md`
      alongside the rotation entry from step 2.1.

---

## 4. Rollback plan

Rollback is **per-step** — flip the most recent change back before
undoing upstream steps. If mainnet cutover needs full abandonment,
execute §4.4 first (stop real IDR outflow), then §4.2, then §4.1, in
that order. Any refund of a paid-but-failed IDR during rollback
routes through the **task 49 refund runbook**.

### 4.1 Revert mobile OTA `[mobile]`

```bash
eas update --channel production --republish --group <previous-group-id> \
  --message "Rollback mainnet cutover: restore testnet JWK"
```

Clients pick up the previous JWK on next foreground. Pair with §4.2.

### 4.2 Revert backend to testnet `[backend]`

```bash
# takumipay-api secret store — flip back:
CIRCLE_GATEWAY_API=https://gateway-api-testnet.circle.com
TAKUMIPAY_QR_PRIVATE_KEY_PEM=XXXX-XXXX-XXXX        # testnet PEM restored
# Bundler URLs live in `Blockchain.bundlerUrl` — to roll back, SQL the
# testnet URLs back into place (or `SET bundlerUrl = NULL` to disable
# gasless entirely). 60s in-process cache; either restart the API or
# wait one TTL for the change to propagate. Per §10.1 rule 6, retain
# the testnet URL set for 7d after cutover for fast rollback.
```

Redeploy, then re-run the re-issuance script from §3.1 against the
restored testnet key — it re-signs every merchant row backward
(script is idempotent, confirmed in task 48 acceptance).

- [ ] `[backend]` `GET /v1/blockchains` verifies `is_testnet: true`
      for every row (if SQL also rolled back — usually only needed
      if §2.2 migration touched shape, not data).

### 4.3 Drain prod relayer `[ops]`

If cutover aborts, sweep mainnet USDC from
`PLATFORM_TREASURY_ADDRESS_EVM` back to the ops cold wallet on each
chain. Retain `ARC_SETTLER_PRIVATE_KEY` for 30 days per §10.1 step 2
rollback rule — do **not** rotate-delete until reconciliation is
complete.

### 4.4 Revert Xendit to sandbox `[backend]`

```bash
XENDIT_ENV=sandbox
XENDIT_SECRET_KEY=xnd_development_XXXX-XXXX-XXXX
```

In-flight prod payouts complete (Xendit does not cancel on env flip).
If an in-flight intent's IDR fails **after** the flip, that USDC sits
in the treasury — refund via **task 49** (Option A Gateway cross-
chain refund or Option B plain ERC-20 return on Arc).

### 4.5 Revert DNS + EAS channel `[ops] [mobile]`

Point DNS back at the staging LB; re-run `eas update --channel
staging --republish …` if a prod-only channel was live.

### 4.6 Manual refund path for paid-but-failed IDR `[backend] [ops]`

For every payer who saw USDC settle but no IDR arrive during the
rollback window: file `POST /v1/pay/intents/:id/refund-request` per
**task 49** §2 dispute-intake step. Ops reconciles and executes
Option A (Gateway) or Option B (ERC-20 return on Arc).

---

## 5. Post-deploy smoke tests `[product] [ops] [backend]`

Staff-only, before broad rollout. Gate the feature flag on success of
all three.

- [ ] `[product]` Scan a test merchant's re-issued QR on a physical
      device (fresh EAS build), pay **10,000 IDR** (≈ smallest
      meaningful amount that exceeds the channel min-cap per task 50
      channel activation), confirm the paid receipt in-app.
- [ ] `[ops]` Check the Xendit dashboard at
      `dashboard.xendit.co/disbursements` — the disbursement appears
      with status `SUCCEEDED` and the correct merchant `channel_code`
      / `account_number`.
- [ ] `[ops]` Check the Arc explorer (`arcscan.app`) for the Circle
      settle tx referenced by `nanopay_submissions.circle_settle_tx_uuid`.
      Tx is mined on mainnet, `from` = payer's source chain, `to` =
      `PLATFORM_TREASURY_ADDRESS_EVM`, amount matches intent.
- [ ] `[backend]` `GET /v1/pay/intents/:id` returns `status: PAID_OUT`
      with a populated `receipt.xenditDisbursementId`.
- [ ] `[backend]` No errors surface in the `intent_*` telemetry
      stream for the test intent; no refund-request is filed.

Only after all five boxes: `[product]` flip the public feature flag
from staff-only to broad rollout.

---

## 6. Dependencies on other tasks

- **Task 50 — ops credential provisioning.** **Must be complete.**
  Every production credential in §1 is task 50's deliverable; this
  runbook **consumes** and does not generate them. Cross-check task
  50's `docs/ops/credentials.md` against §1 of this document before
  starting.
- **Task 49 — refund runbook.** **Must be ready for rollback
  scenarios.** Both §4.4 (Xendit revert) and §4.6 (manual refund)
  directly invoke task 49's `POST /v1/pay/intents/:id/refund-request`
  + Option A / Option B flow. If task 49 has any open follow-ups
  (e.g. the `status = REFUNDED` schema migration), those land
  **before** this runbook executes.
- **Task 47 — env-var minimization.** Enforces that the only mobile
  env var flipped during this cutover is
  `EXPO_PUBLIC_TAKUMIPAY_QR_PUBKEY_JWK`. Any temptation to add
  `EXPO_PUBLIC_<CHAIN>_*` during migration is a bug; thread through
  `useBlockchains()` instead. `pnpm check:env` must stay green after
  step 2.1.
- **`docs/jwk_rotation_runbook.md`** — not a task, but the yearly
  rotation SOP. Step 2.1 of this runbook is functionally one-shot of
  that procedure, and §3 reuses its 7-day dual-verify pattern.

---

## Open questions (flagged for resolution before cutover)

- **Arc mainnet `chain_id` value.** Tracked as `<ARC_MAINNET_ID>`
  throughout this doc. Resolve via `docs.arc.network` before §1 can
  be checked green.
- **Arc Paymaster availability at mainnet launch.** Spec (§10.1) is
  ambivalent — Arc uses USDC natively for gas so no paymaster is
  strictly needed. If Circle publishes an Arc mainnet Paymaster, seed
  `Blockchain.bundlerUrl` for that chainId via SQL; otherwise leave it
  NULL and the userop proxy will continue rejecting Arc UserOps with
  400 `CHAIN_NOT_SUPPORTED` (which is correct — Arc doesn't need a
  bundler).
- **Ethereum mainnet inclusion.** §10.1 lists Base + Arbitrum
  explicitly; Ethereum is implied via Gateway source-chain support.
  Confirm with `GET /gateway/v1/x402/supported` at prod boot (task
  18) that Ethereum is in the returned chain set before claiming
  "all four chains seeded."
- **Xendit prod channel activation.** Each rail (GOPAY, OVO, DANA,
  LINKAJA, SHOPEEPAY_ID, BCA/Mandiri/BNI/BRI) may require a
  per-channel production activation form distinct from KYB. Verify
  with `[ops]` via a dashboard walk-through before §2.4. Task 50
  item 1 owns this.
