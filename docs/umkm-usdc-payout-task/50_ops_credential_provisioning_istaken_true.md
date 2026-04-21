# Task 50 — Ops credential provisioning checklist

**Status:** Not taken
**Owner:** Ops (with backend eng for secret storage)
**Spec reference:** umkm-usdc-payout-spec.md §13, §10, cross-cutting
(sub-steps blocking each milestone — start with Xendit during M1)

## Why this matters

§13 lists every third-party credential the backend needs. KYB for
Xendit takes days; skip it early and M3 stalls. Circle Gateway and
Nanopayments endpoints are permissionless, so that side is fast.
Paymaster and x402 have chain-specific nuances. This checklist
orders the steps by blocking milestone so ops can parallelize KYB
while engineering lands M1–M2, and so no secret ever leaks into
mobile `EXPO_PUBLIC_*` (task 47 enforces this).

## Scope

1. **Xendit (M3 blocker — start first, days)** — KYB at
   `dashboard.xendit.co`, activate "Payouts to E-Wallets" +
   "Payouts to Bank Accounts", generate `xnd_development_…` (M3
   dev), then `xnd_production_…` (prod cutover — task 48). Register
   webhook at `https://<host>/webhooks/xendit`; copy the
   `x-callback-token` immediately. Stash:
   `XENDIT_SECRET_KEY`, `XENDIT_WEBHOOK_TOKEN`, `XENDIT_ENV` in
   `takumipay-api/.env`.
2. **Circle Gateway + Nanopayments (M2 blocker — minutes)** — no
   sign-up required; `/gateway/v1/x402/*` endpoints are
   permissionless. Optional `CIRCLE_API_KEY` from `app.circle.com`
   for Developer Console dashboards only. Generate platform EOA →
   private key `ARC_SETTLER_PRIVATE_KEY`, public address
   `PLATFORM_TREASURY_ADDRESS_EVM`. Fund via `faucet.circle.com`.
   Point backend at `CIRCLE_GATEWAY_API=https://gateway-api-testnet.
   circle.com` (flip for mainnet per task 48).
3. **Arc Network (M2 blocker)** — no account; fund relayer with
   testnet USDC via Arc's Circle Faucet. No contract deploy in v1
   per §7.
4. **Circle Paymaster (M4 blocker)** — pull paymaster addresses per
   chain from `developers.circle.com/paymaster` and insert into
   `blockchains.paymaster_address` (DB row, not env). Provision one
   Pimlico or Alchemy bundler account; store full URL with key
   embedded as `BUNDLER_URL_<chainId>` in server env only. Arbitrum
   + Base supported at time of writing; Arc natively uses USDC for
   gas so no paymaster row needed for Arc.
5. **x402 facilitator (M5)** — either sign up at `cdp.coinbase.com`
   (CDP for Base / Polygon / Arbitrum / World / Solana; first 1k
   tx/month free) or deploy the `x402-facilitator` reference server
   pointed at Arc RPC + relayer wallet.
6. **TakumiPay QR signing key (M1 blocker)** — generate ES256
   keypair: `openssl ecparam -name prime256v1 -genkey -noout -out
   qr-key.pem`. PEM stays server-side as
   `TAKUMIPAY_QR_PRIVATE_KEY_PEM`; extract public JWK and paste into
   `EXPO_PUBLIC_TAKUMIPAY_QR_PUBKEY_JWK` for mobile (task 09
   consumes). Rotate yearly; rotate once for mainnet cutover (task
   48 step 1).
7. **Solana keypair (M6 blocker)** — fresh Solana keypair; private
   as `SVM_SETTLER_PRIVATE_KEY`, public (base58) as
   `PLATFORM_TREASURY_ADDRESS_SVM`. Create the USDC ATA for the
   public key on Solana devnet (M6 dev) and mainnet-beta (prod).

## Rules (non-negotiable)

- **Three-role separation** — every secret in this task lives in
  `takumipay-api/.env` only. Nothing except the public QR JWK ever
  reaches mobile. `BUNDLER_URL_*`, Xendit keys, and Circle API keys
  are hard-rejected from `EXPO_PUBLIC_*` (task 47 guard).
- **Chain-extension discipline** — paymaster addresses, x402 domain
  values, and RPC URLs land as `blockchains` rows, never env.
  Adding a new chain is "insert row + fund relayer," not "ship a
  new env var."
- **Filter at source** — credential existence is asserted at
  backend boot (fail-fast if `XENDIT_SECRET_KEY` missing when
  `XENDIT_ENV=production`). Mobile never probes for secret
  presence.

## Acceptance

- [ ] All seven credential groups provisioned for dev/testnet by
      end of M2.
- [ ] Backend boot asserts required env present per milestone.
- [ ] No `EXPO_PUBLIC_*` contains a Xendit/Circle/bundler/private-
      key value (verified by task 47's `check:env`).
- [ ] Ops runbook `docs/ops/credentials.md` mirrors this list with
      current secret owners and rotation schedule.
- [ ] Prod equivalents provisioned before task 48 cutover.

## Out of scope

- The JWS verifier itself (task 09).
- `blockchains` / `tokens` seed data (task 21 + §6.8 seed script).
- Mainnet rotation execution (task 48).
- Refund credentials — same `ARC_SETTLER_PRIVATE_KEY` reused by
  task 49.
