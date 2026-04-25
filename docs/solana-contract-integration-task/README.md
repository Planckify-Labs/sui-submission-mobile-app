# Solana TakumiPay Contract Integration — Task Backlog

This folder contains engineering tasks derived from
`../solana-contract-integration-spec.md`. Each file represents one
discrete unit of work from the spec's §3 type safety pipeline, §4 mobile
changes, §5 API changes, §6 end-to-end flows, and §9 migration plan.

**Context:** the `solana-adapter-task/` folder (all 34 tasks complete)
delivered the dApp-bridge adapter with Wallet Standard compliance, full
signing surface, simulation UX, and broadcast state machine. The
`solana-chain-support-task/` folder (all 27 tasks complete) delivered
first-party Solana primitives — wallet creation, SOL transfer, and
`SolanaWalletKit`. This backlog extends onchain settlement to Solana by
integrating the `takumi_pay` Anchor program across Mobile App, API, and
Agent — enabling product purchases, merchant QRIS payments, and point
deposits on-chain via the TakumiPay Solana program.

## Filename convention

```
{NN}_{task_name}_istaken_{true|false}[_isfinish_true].md
```

- `NN` — two-digit sequential task number
- `task_name` — short snake_case label
- `istaken_true` / `istaken_false` — whether an engineer is actively working on it
- `_isfinish_true` — appended as a **postfix** once the task is complete.
  A file without this postfix is not yet finished.

Three possible states:

| State | Filename pattern |
|---|---|
| Not started | `01_contract_token2022_migration_istaken_false.md` |
| In progress | `01_contract_token2022_migration_istaken_true.md` |
| Finished    | `01_contract_token2022_migration_istaken_true_isfinish_true.md` |

## Workflow

1. Browse the tasks, pick one that ends with `istaken_false.md`.
2. Claim it by renaming `istaken_false` → `istaken_true`:
   ```
   git mv 01_contract_token2022_migration_istaken_false.md 01_contract_token2022_migration_istaken_true.md
   ```
3. Work on the task. Read the referenced sections of
   `../solana-contract-integration-spec.md` — each task file excerpts
   only the minimum context needed.
4. When the task is complete and merged, append the `_isfinish_true`
   postfix — do NOT flip `istaken` back to `false`:
   ```
   git mv 01_contract_token2022_migration_istaken_true.md 01_contract_token2022_migration_istaken_true_isfinish_true.md
   ```
   Finished files stay in the folder as a durable record of what shipped.
5. If you abandon a task mid-flight, rename it back to `istaken_false.md`
   (without the `isfinish_true` postfix) so someone else can pick it up.

## Phase ordering

Tasks are numbered by the phase they belong to in the spec's §9
migration plan. **Do not start a later phase before the previous
phase's exit criteria are green.**

- **Phase 1** (tasks 01–05) — Contract update (Token-2022 migration) +
  per-project types files (IDL, types, PDA helpers, errors, refIdHash)
  for both mobile-app and API. CI IDL sync check. PDA derivation tests.
- **Phase 2** (tasks 06–14) — API verification service
  (`SolanaVerificationService`), Prisma schema updates, intent creation
  with Solana quote signing, onchain settlement endpoint extension.
- **Phase 3** (tasks 15–24) — Mobile instruction builders
  (`buildCreateTransaction`, `buildDepositPoints`,
  `pathOnchainSettlementSvm`), `sendAnchorInstruction` space docking on
  `WalletKitAdapter`, path selector + orchestrators update, agent
  executors (`execute_booking_sol`, `deposit_points_sol`), agent-API
  tool definitions.
- **Phase 4** (tasks 25–28) — E2E integration: devnet deployment, full
  flow testing for product purchase, merchant payment, and point deposit.
- **Phase 5** (tasks 29–31) — Production rollout: mainnet deployment,
  signer provisioning, feature flag + gradual rollout.

## Cross-project ownership

| Owner | Tasks |
|---|---|
| Contract (Anchor) | 01 |
| Mobile (mobile-app) | 02, 05, 15–24, 26–28 |
| API (takumipay-api) | 03, 06–14 |
| Agent API (takumi-agent-api) | 24 (co-owned with mobile) |
| Shared / CI | 04, 25, 29–31 |

## Task map

### Phase 1 — Contract Update + Per-Project Types

| # | File | Title |
|---|---|---|
| 01 | `01_contract_token2022_migration_istaken_false.md` | Anchor program: `anchor_spl::token` → `token_interface` across all instruction files |
| 02 | `02_mobile_takumipay_types_module_istaken_false.md` | Mobile `services/chains/solana/takumiPay/` — IDL, types, PDA helpers, errors, refIdHash |
| 03 | `03_api_takumipay_types_module_istaken_false.md` | API `src/blockchain-verification/solana/takumi-pay/` — IDL, types, PDA helpers, errors, ref-id-hash |
| 04 | `04_ci_idl_sync_check_istaken_false.md` | CI step: hash-compare IDL copies against canonical `target/idl/takumi_pay.json` |
| 05 | `05_pda_derivation_unit_tests_istaken_false.md` | Unit tests for PDA derivation in both mobile and API projects |

### Phase 2 — API Verification Service

| # | File | Title |
|---|---|---|
| 06 | `06_solana_verification_service_core_istaken_false.md` | `SolanaVerificationService` scaffold + `waitForConfirmation` |
| 07 | `07_verify_transaction_record_istaken_false.md` | `verifyTransactionRecord` — PDA fetch + field-by-field verification |
| 08 | `08_verify_merchant_payment_istaken_false.md` | `verifyMerchantPayment` — MerchantPayment PDA fetch + verification |
| 09 | `09_verify_point_deposit_istaken_false.md` | `verifyPointDeposit` — PointDepositRecord PDA fetch + verification |
| 10 | `10_sign_merchant_quote_ed25519_istaken_false.md` | `signMerchantQuote` — Ed25519 signing of borsh-serialized MerchantQuoteParams |
| 11 | `11_blockchain_verification_dispatch_istaken_false.md` | `BlockchainVerificationService` — Solana dispatch layer in verify methods |
| 12 | `12_prisma_schema_solana_fields_istaken_false.md` | Prisma schema: Blockchain + OnchainSettlement Solana fields + migration |
| 13 | `13_intent_creation_solana_quote_istaken_false.md` | Intent creation: populate `quoteCommitmentSvm` + `quoteSignatureSvm` for Solana chains |
| 14 | `14_onchain_endpoint_solana_support_istaken_false.md` | `POST /intents/:id/onchain` — Solana tx signature + verification worker extension |

### Phase 3 — Mobile Instruction Builders + Agent Executors

| # | File | Title |
|---|---|---|
| 15 | `15_walletkit_send_anchor_instruction_dock_istaken_false.md` | `WalletKitAdapter` + `SolanaWalletKit`: dock `sendAnchorInstruction` optional method |
| 16 | `16_quote_commitment_svm_types_istaken_false.md` | `QuoteCommitmentSvm` type + `PaymentIntentResponse` extension in `services/nanopay/types.ts` |
| 17 | `17_build_create_transaction_istaken_false.md` | `buildCreateTransaction.ts` — Sol/Token instruction builder for product purchases |
| 18 | `18_build_deposit_points_istaken_false.md` | `buildDepositPoints.ts` — depositPoints instruction builder |
| 19 | `19_path_onchain_settlement_svm_istaken_false.md` | `pathOnchainSettlementSvm.ts` — merchant payment flow with Ed25519 + processMerchantPayment |
| 20 | `20_path_selector_orchestrators_update_istaken_false.md` | pathSelector + orchestrators wiring: `sendAnchorInstruction` presence-check for onchain path |
| 21 | `21_solana_takumipay_agent_executors_istaken_false.md` | `solanaTakumiPay.ts` — `executeBookingSol` + `depositPointsSol` mobile executors |
| 22 | `22_agent_executor_registry_update_istaken_false.md` | Register Solana TakumiPay executors in `EXECUTORS` + `EXPECTED_MOBILE_TOOLS` |
| 23 | `23_agent_api_tool_definitions_istaken_false.md` | Agent-API tool registry: `execute_booking_sol` + `deposit_points_sol` tool definitions |
| 24 | `24_instruction_builder_unit_tests_istaken_false.md` | Unit tests: instruction encoding, Ed25519 IX ordering, Sol/Token variant selection |

### Phase 4 — E2E Integration

| # | File | Title |
|---|---|---|
| 25 | `25_devnet_deployment_seed_data_istaken_false.md` | Devnet deployment of `takumi_pay` program + Solana blockchain seed row |
| 26 | `26_e2e_product_purchase_flow_istaken_false.md` | E2E: mobile → createTransactionSol/Token → API verifyTransactionRecord |
| 27 | `27_e2e_merchant_payment_flow_istaken_false.md` | E2E: intent → Ed25519 quote → processMerchantPaymentSol/Token → API verify |
| 28 | `28_e2e_point_deposit_flow_istaken_false.md` | E2E: mobile → depositPoints → API verifyPointDeposit |

### Phase 5 — Production Rollout

| # | File | Title |
|---|---|---|
| 29 | `29_mainnet_deployment_istaken_false.md` | Mainnet deployment + blockchain seed row + program ID config |
| 30 | `30_signer_keypair_provisioning_istaken_false.md` | Backend Ed25519 signer keypair provisioning via secrets manager |
| 31 | `31_feature_flag_gradual_rollout_istaken_false.md` | Feature flag `solana_onchain_settlement` + region/user segmentation rollout |

## Source of truth

`../solana-contract-integration-spec.md` is the canonical spec. These
task files are a projection of it — if anything here disagrees with the
spec, the spec wins. Update the spec first, then update the task.

## Companion docs

- `../solana-adapter-spec.md` — dApp-bridge adapter (complete).
- `../solana-chain-support-spec.md` — first-party Solana primitives
  this integration consumes (`SolanaWalletKit`, wallet creation, SOL
  transfer).
- `../solana-contract-integration-spec.md` — the canonical spec for
  this backlog.

## Architecture invariants (from spec §2)

1. **Three-role separation**: Mobile signs and broadcasts. API verifies
   after-the-fact. Backend never holds user keys, mobile never
   blind-executes.
2. **Space docking / chain-extension discipline**: Chain-specific
   capability docks onto `WalletKitAdapter` as optional methods.
   Shared code dispatches via presence-of-method — never via
   `if (namespace === "X")`.
3. **IDL-driven type safety**: Anchor IDL is single source of truth.
   Each project keeps its own copy and derives TS types from it.
4. **No `@solana/web3.js` restriction relaxed for API**: The API now
   imports `@coral-xyz/anchor` (which pulls `@solana/web3.js`) for
   account deserialization. This is necessary for TakumiPay verification.
