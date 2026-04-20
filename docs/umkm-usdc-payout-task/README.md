# UMKM USDC → SEA Fiat Payout — Task Backlog

This folder contains engineering tasks derived from
`../umkm-usdc-payout-spec.md`. Each file represents one discrete unit of
work, scheduled into the milestone ordering defined in §11 of the spec
(`M1 → M6`). Together the task set **fully covers** every §1–§13 section
of the spec — if an engineer implements every task the product ships.

## Filename convention

```
{NN}_{task_name}_istaken_{true|false}[_isfinish_true].md
```

- `NN` — two-digit sequential task number (phase-ordered)
- `task_name` — short snake_case label, usually ends with the milestone
  tag (`m1`…`m6`) or a `§`-section shorthand
- `istaken_true` / `istaken_false` — whether an engineer is actively
  working on it
- `_isfinish_true` — appended as a **postfix** once the task is complete.
  A file without this postfix is not yet finished.

Three possible states:

| State | Filename pattern |
|---|---|
| Not started | `01_payment_intent_scaffold_m1_istaken_false.md` |
| In progress | `01_payment_intent_scaffold_m1_istaken_true.md` |
| Finished    | `01_payment_intent_scaffold_m1_istaken_true_isfinish_true.md` |

## Workflow

1. Browse the tasks, pick one that ends with `istaken_false.md`.
2. Claim it by renaming `istaken_false` → `istaken_true`:
   ```
   git mv 01_payment_intent_scaffold_m1_istaken_false.md 01_payment_intent_scaffold_m1_istaken_true.md
   ```
3. Work on the task. Read the referenced `§N.N` sections of
   `../umkm-usdc-payout-spec.md` — each task file excerpts only the
   minimum context needed.
4. When the task is complete and merged, append the `_isfinish_true`
   postfix — do NOT flip `istaken` back to `false`:
   ```
   git mv 01_payment_intent_scaffold_m1_istaken_true.md 01_payment_intent_scaffold_m1_istaken_true_isfinish_true.md
   ```
   Finished files stay in the folder as a durable record of what shipped.
5. If you abandon a task mid-flight, rename it back to `istaken_false.md`
   (without the `isfinish_true` postfix) so someone else can pick it up.

## Milestone ordering

Tasks are numbered by milestone from §11 of the spec. **Do not start a
later milestone before the previous milestone's exit criteria are met.**

- **M1 — Normalization + Merchant Onboarding Shell** (tasks 01–14).
  `services/paymentIntent/*`, scan-to-pay router, `app/merchant/*` shell.
  No networking to Circle, no Xendit. Shippable as flag-gated demo.
- **M2 — Nanopayments Core (EVM)** (tasks 15–23). EIP-3009 signer, Circle
  settle proxy, Arc Testnet onboarding, enriched `/v1/blockchains`.
  Shippable: scan → sign → merchant sees "PAID" in <500 ms, no IDR yet.
- **M3 — Xendit Payout** (tasks 24–33). FX snapshot, payout provider
  abstraction, real IDR disbursement, receipt + push. Now a Nanopayments
  attestation actually credits the merchant's GoPay/OVO/bank.
- **M4 — Gateway Onboarding + Paymaster Deposit** (tasks 34–38). One-time
  `GatewayWallet.deposit` wrapped via Circle Paymaster on Base/Arbitrum
  so onboarding itself is gasless.
- **M5 — Path C (raw x402) + Path A (direct-on-Arc)** (tasks 39–41).
  Re-uses M2 EIP-3009 signer against arbitrary merchant resources;
  direct-on-Arc fallback for large transfers.
- **M6 — Solana x402 scheme (Path B-SVM)** (tasks 42–43). Slot was
  defined in M2; now implemented. Unlocks Solana-native payers.

Cross-cutting tasks (44–50) land alongside the milestone that needs them
— error matrix & dispute ops land with M3 UX polish, env-var hygiene and
mainnet migration land before production cutover, credential provisioning
is ops work that precedes the milestone that consumes it.

## Non-regression contract

Every task here MUST preserve the **three-role separation** invariant
(memory `feedback_role_separation.md`):

- **User** approves the local-fiat amount and enters PIN/biometric.
- **Server (`takumipay-api`)** decides amounts (FX, fees), mints payment
  intents, proxies signed authorizations to Circle, fires Xendit on
  settle 200 OK. **Never** signs USDC transfers on behalf of a payer.
- **Wallet (mobile-app)** only signs payloads the server pre-shaped.
  Never sends fiat credentials or bank data.

Every task MUST preserve **chain-extension discipline** (memory
`feedback_chain_extension_discipline.md`): new chain logic lives on
`WalletKitAdapter` and `detectorRegistry` — never as `if (ns === "X")`
branches in shared code. `WalletKitAdapter` presence-of-method drives
namespace behavior, not string comparisons.

Acceptance sign-off on every task:

- [ ] Existing test suite green (`pnpm run test`).
- [ ] `pnpm check:syntax` and `pnpm biome:check` pass.
- [ ] Manual regression path (scan → pay → receipt) exercised on the
      features the task touches.
- [ ] Feature-flag default and rollback plan documented where applicable.

## Task map

### M1 — Normalization + Merchant Onboarding Shell

| # | §Spec | File | Title |
|---|---|---|---|
| 01 | §4.1–§4.2 | `01_payment_intent_scaffold_m1_istaken_false.md` | `services/paymentIntent` module scaffold (types, classify, detectorRegistry) |
| 02 | §4.3 #4,#5 | `02_wallet_address_detector_m1_istaken_false.md` | Wallet-address + namespace detector (EVM `0x…`, Solana base58) |
| 03 | §4.3 #4 | `03_wallet_uri_detector_m1_istaken_false.md` | Wallet-URI detector (EIP-681 `ethereum:`, `solana:`) |
| 04 | §4.3 #3 | `04_emvco_qris_decoder_m1_istaken_false.md` | EMVCo QRIS TLV decoder + CRC-16 validator |
| 05 | §4.4, §4.6 | `05_takumipay_jws_detector_m1_istaken_false.md` | TakumiPay signed-QR detector (ES256 JWS verify) |
| 06 | §4.3 #2 | `06_x402_detector_m1_istaken_false.md` | `x402://` + explicit-paste URL detector |
| 07 | §4.6 | `07_scan_to_pay_router_m1_istaken_false.md` | `scan-to-pay.tsx` router + `switchToScannedTarget` helper |
| 08 | §6.2, §8.5 | `08_pay_merchant_stub_m1_istaken_false.md` | `/pay-merchant` stub screen — intentId-first contract |
| 09 | §13 #6, §4.4 | `09_takumipay_qr_keypair_m1_istaken_false.md` | ES256 keypair provisioning + bundled JWK + OTA rotation |
| 10 | §1.1.1 step 1 | `10_merchant_register_cta_m1_istaken_false.md` | Login "Register as Merchant" second primary button |
| 11 | §1.1.1 step 2 | `11_merchant_signup_intro_m1_istaken_false.md` | `merchant/signup-intro.tsx` scan-or-manual fork |
| 12 | §1.1.1 step 3 | `12_merchant_signup_form_m1_istaken_false.md` | `merchant/signup-form.tsx` polymorphic channel/account input |
| 13 | §1.1.1 step 4 | `13_merchant_qr_home_m1_istaken_false.md` | `merchant/qr.tsx` home screen + Save/Share |
| 14 | §1.1.1, §12 Q9 | `14_qris_sticker_photo_m1_istaken_false.md` | QRIS sticker photo capture + compression upload |

### M2 — Nanopayments Core (EVM)

| # | §Spec | File | Title |
|---|---|---|---|
| 15 | §5.5 | `15_eip3009_signer_adapter_m2_istaken_false.md` | `WalletKitAdapter.signTransferWithAuthorization` (EIP-3009) |
| 16 | §7, §7.1 ChainConfig | `16_arc_chain_config_m2_istaken_false.md` | Arc Testnet `ChainConfig` + USDC-as-native handling |
| 17 | §5.5 services/nanopay | `17_nanopay_services_module_m2_istaken_false.md` | `services/nanopay` module (buildAuthorization / submit / polling hook) |
| 18 | §2 step 6–7, §5.5 | `18_pay_merchant_path_b_wire_m2_istaken_false.md` | `/pay-merchant` full Path B-EVM wiring (quote → sign → submit) |
| 19 | §6.6 schema, §7.1 | `19_payout_db_schema_m2_istaken_false.md` | Backend: 6 new tables + `blockchains` column extension + indexes |
| 20 | §6.8 #1–#2, §7.1 | `20_arc_seed_blockchains_tokens_m2_istaken_false.md` | Backend seed — Arc Testnet `blockchains` + USDC `tokens` rows |
| 21 | §6.7, §10 | `21_chain_config_endpoint_m2_istaken_false.md` | Backend: enriched `GET /v1/blockchains` payload |
| 22 | §6.5, §6.7 | `22_x402_supported_boot_cache_m2_istaken_false.md` | Backend: boot-time `/gateway/v1/x402/supported` cache + slow cron |
| 23 | §6.2 create, §6.5, §8.5 #3 | `23_create_intent_endpoint_m2_istaken_false.md` | Backend: `POST /v1/pay/intents` (FX snapshot + idempotency + Nanopay payload build) |

### M3 — Xendit Payout

| # | §Spec | File | Title |
|---|---|---|---|
| 24 | §6.2 submit, §6.5 | `24_nanopay_submit_proxy_m3_istaken_false.md` | Backend: `POST /v1/pay/intents/:id/nanopay` Circle settle proxy |
| 25 | §6.2 polling, §6.3 | `25_intent_polling_endpoint_m3_istaken_false.md` | Backend: `GET /v1/pay/intents/:id` + status transitions |
| 26 | §6.8 #3–#4, §6.6 | `26_fx_channels_seed_m3_istaken_false.md` | Backend seed — `exchange_rates` USDC→IDR + `channels` rows |
| 27 | §6.1, §6.6 | `27_merchant_lifecycle_endpoints_m3_istaken_false.md` | Backend: `/v1/merchants/*` endpoints + JWS QR signing |
| 28 | §6.1 channels, §1.1.1 | `28_channels_endpoint_m3_istaken_false.md` | Backend: `GET /v1/merchants/channels?country=ID` |
| 29 | §6.4 | `29_payout_provider_xendit_m3_istaken_false.md` | Backend: `PayoutProvider` port + `XenditPayoutProvider` adapter |
| 30 | §6.4, §9 security, §13 #1 | `30_xendit_webhook_handler_m3_istaken_false.md` | Backend: Xendit `x-callback-token` webhook handler |
| 31 | §2 step 9, §6.3 | `31_receipt_and_status_live_m3_istaken_false.md` | Mobile: receipt screen + TanStack Query invalidation on settle |
| 32 | §6.3 FCM/APNs | `32_push_on_paid_out_m3_istaken_false.md` | Mobile: FCM/APNs push on `PAID_OUT` |
| 33 | §7.1 audit | `33_eth_assumption_audit_m3_istaken_false.md` | Backend audit: grep hardcoded `ETH`/`18-decimals` assumptions |

### M4 — Gateway Onboarding + Paymaster-Wrapped Deposit

| # | §Spec | File | Title |
|---|---|---|---|
| 34 | §5.2 step 1, §5.4 | `34_onboarding_deposit_screen_m4_istaken_false.md` | `onboarding/nanopay-deposit.tsx` — one-time `GatewayWallet.deposit` UX |
| 35 | §5.5 paymaster, §12 Q6 | `35_paymaster_userop_adapter_m4_istaken_false.md` | `WalletKitAdapter.sendUserOpWithUsdcPaymaster` (ERC-4337 via EIP-7702) |
| 36 | §5.5 services/nanopay | `36_gateway_deposit_service_m4_istaken_false.md` | `services/nanopay/gatewayDeposit.ts` (permit + UserOp build) |
| 37 | §6.7 UserOp proxy | `37_userop_submit_proxy_m4_istaken_false.md` | Backend: `POST /v1/userop/submit` bundler proxy |
| 38 | §6.2 deposit-receipt, §6.6 `gateway_deposits` | `38_deposit_receipt_endpoint_m4_istaken_false.md` | Backend: `POST /v1/pay/intents/:id/deposit-receipt` + `gateway_deposits` flow |

### M5 — Path C (raw x402) + Path A (direct-on-Arc)

| # | §Spec | File | Title |
|---|---|---|---|
| 39 | §5.3 | `39_path_c_raw_x402_m5_istaken_false.md` | Path C — raw x402 against arbitrary merchant resource |
| 40 | §5.1 | `40_path_a_direct_arc_m5_istaken_false.md` | Path A — direct-on-Arc ERC-20 `transfer` + on-chain event watcher |
| 41 | §5.6 | `41_path_selector_m5_istaken_false.md` | Unified path selector (presence-of-method dispatch) |

### M6 — Solana x402 (Path B-SVM)

| # | §Spec | File | Title |
|---|---|---|---|
| 42 | §5.2.1, §5.5 `signX402SvmPayment` | `42_svm_x402_signer_m6_istaken_false.md` | `SolanaWalletKit.signX402SvmPayment` adapter method |
| 43 | §5.2.1, §10 env | `43_svm_facilitator_backend_m6_istaken_false.md` | Backend: Solana x402 facilitator + `PLATFORM_TREASURY_ADDRESS_SVM` |

### Cross-cutting (land alongside the milestone that needs them)

| # | §Spec | File | Title |
|---|---|---|---|
| 44 | §9.1 | `44_error_matrix_component_istaken_false.md` | Error-states matrix UI (`PaymentError` component + `paymentErrors.ts` + telemetry) |
| 45 | §6.6 `merchant_qris_claims`, §12 Q9 | `45_qris_claim_dispute_istaken_false.md` | `merchant_qris_claims` audit table + dispute resolution ops tool |
| 46 | §8 (all) | `46_agent_mode_integration_slot_istaken_false.md` | Agent-mode integration slot — intent idempotency + `/pay-merchant?intentId=…` deep-link |
| 47 | §10 | `47_env_var_minimization_istaken_false.md` | Mobile env-var minimization (three vars only) + bundled JWK rotation process |
| 48 | §10.1, §13 | `48_mainnet_migration_runbook_istaken_false.md` | Testnet→mainnet migration runbook + re-issue merchant JWSes |
| 49 | §12 Q5 | `49_refund_runbook_istaken_false.md` | Refund path — Circle settle OK but Xendit payout failure |
| 50 | §13 | `50_ops_credential_provisioning_istaken_false.md` | Ops credential provisioning — Xendit KYB, Circle, Bundler, x402 facilitator |

## Source of truth

`../umkm-usdc-payout-spec.md` is the canonical spec. These task files
are a projection of it — if anything here disagrees with the spec,
**the spec wins**. Update the spec first, then update the task.

Open questions in §12 of the spec that are deferred (Q4 KYC limits, Q8
closed-vs-open merchant network, deep refund policy) are noted inline on
the relevant tasks but are not standalone tasks — they're product
decisions that gate rollout, not engineering work.
