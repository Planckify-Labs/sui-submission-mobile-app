# Task 43 — SVM Facilitator Backend (Path B-SVM settlement)

**Status:** Not taken
**Owner:** Backend + Ops
**Spec reference:** umkm-usdc-payout-spec.md §5.2.1 Path B-SVM flow, §10.1 `PLATFORM_TREASURY_ADDRESS_SVM` / `SVM_SETTLER_PRIVATE_KEY`, §12 Q7 facilitator short-list, milestone M6

## Why this matters

The `/pay-merchant` wiring stays identical across Path B-EVM and Path B-SVM — only the settle POST target differs. This task provisions the platform's Solana treasury, creates its USDC Associated Token Account (ATA) on mainnet-beta, and wires the backend to either (a) Circle's `/gateway/v1/x402/settle` if Circle lists `solana:*` at boot, or (b) a Solana-compatible x402 facilitator if Circle doesn't yet support SVM natively. Without this, the task 42 signer has no endpoint to submit to and Path B-SVM is a dead branch.

## Scope

**Ops provisioning:**

1. Generate a fresh Solana keypair for the platform treasury. Pubkey → `PLATFORM_TREASURY_ADDRESS_SVM` env var (§10.1). Private key → `SVM_SETTLER_PRIVATE_KEY` (never committed).
2. Create the USDC ATA on Solana mainnet-beta cluster: `(owner = PLATFORM_TREASURY_ADDRESS_SVM, mint = EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v)` per §5.2.1. Fund it with a dust balance (~0.01 SOL for rent-exempt) from a cold wallet.
3. Document the generation + ATA-creation runbook under `docs/umkm-usdc-payout-task/50_ops_credentials_*` (task 50).

**Backend discovery + routing:**

4. At boot, call Circle's `GET /gateway/v1/x402/supported`. If the response lists any `solana:*` network → proxy SVM intents through Circle's `POST /gateway/v1/x402/settle` (same handler as EVM, just different CAIP-2 network string).
5. If Circle does **not** list `solana:*` → integrate a Solana-compatible x402 facilitator. Short-list per §12 Q7: Coinbase CDP, rapid402, self-hosted. Decide at M6 kickoff based on Circle discovery + facilitator reliability testing.
6. The `POST /v1/pay/intents/:id/nanopay` endpoint (M2) handles both schemes — backend switches on `intent.nanopay.kind` ("evm_eip3009" vs "svm_partial_tx", §6.2) to pick the settle target. Mobile posts the same shape regardless.
7. Intent-building side: when the payer's source chain is Solana, `POST /v1/pay/intents` emits a `SvmNanopayPayload` (§6.2) — the pre-built base64 transaction with ComputeBudget + TransferChecked + optional Memo, `extra.feePayer` = facilitator's pubkey.

**Env + discipline:**

8. New server env vars per §10.1: `PLATFORM_TREASURY_ADDRESS_SVM`, `SVM_SETTLER_PRIVATE_KEY`. Bundler envs from task 37 are not shared — Solana has no ERC-4337 bundler equivalent.
9. Track `github.com/coinbase/x402/issues/646` (SVM scheme stability, §12 Q7). If the RFC breaks before M6, re-spec.

## Rules (non-negotiable)

- `SVM_SETTLER_PRIVATE_KEY` lives **only** in `takumipay-api/.env`. Never `EXPO_PUBLIC_*`. Never in git.
- Path selector (task 41) and mobile submit flow are untouched — backend routing is transparent to mobile. Memory: `feedback_role_separation.md` (server chooses the rail; mobile stays dumb).
- No `if (namespace === "solana") doX() else doY()` branching in the `POST /v1/pay/intents/:id/nanopay` controller. Switch on `intent.nanopay.kind` (the shape the intent was minted with) — that's chain-extension discipline applied server-side. Memory: `feedback_chain_extension_discipline.md`.
- Boot-time Circle discovery is cached; re-check on a slow cron (daily). Do not re-query per request.
- `PLATFORM_TREASURY_ADDRESS_SVM` may remain blank until M6 (§10.1) — code paths gated on it must tolerate absence without crashing pre-M6.

## Acceptance

- [ ] Platform Solana keypair provisioned; USDC ATA created on mainnet-beta; env vars set.
- [ ] Boot-time `GET /gateway/v1/x402/supported` discovery + cache lands.
- [ ] `/v1/pay/intents/:id/nanopay` routes to Circle or the chosen facilitator based on discovery.
- [ ] `POST /v1/pay/intents` emits `SvmNanopayPayload` when source is Solana.
- [ ] E2E test: Solana payer scans UMKM QR → task 42 signs → backend settles via chosen facilitator → intent `SETTLED` → Xendit payout fires.
- [ ] RFC `github.com/coinbase/x402/issues/646` linked in backend code comments for future review.
- [ ] `pnpm check:syntax` clean.
- [ ] `pnpm biome:check` clean.

## Out of scope

- Mobile SVM signer — task 42.
- EVM Path B — task 17 (M2).
- Ops credentials runbook consolidation — task 50.
- Agent-mode SVM support — task 46.
