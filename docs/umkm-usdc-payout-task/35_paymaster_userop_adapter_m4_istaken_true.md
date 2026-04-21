# Task 35 — Paymaster UserOp Adapter (`sendUserOpWithUsdcPaymaster`)

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** umkm-usdc-payout-spec.md §5.4 gasless table, §5.5 adapter surface, §11.1 `permissionless` dep, §12 Q6, milestone M4

## Why this matters

Circle Paymaster (ERC-4337) is the mechanism that makes the one-time Gateway deposit itself gasless on Arbitrum/Base — the user's first and only on-chain action never requires ETH. Without this adapter method, every onboarding deposit falls back to plain `sendTransaction`, which blocks any user that doesn't already hold the source chain's native gas token. Per §12 Q6, Circle Paymaster supports EOAs via EIP-7702 post-Pectra, so the built-in wallet participates without a smart-account migration.

## Scope

1. Implement `sendUserOpWithUsdcPaymaster` on `EvmWalletKit` per `services/walletKit/types.ts:66` (the `WalletKitAdapter` interface; the optional slot is defined in §5.5 and paired with task 15's `signTransferWithAuthorization`).
2. Use the `permissionless` npm package to compose an ERC-4337 v0.7 UserOperation. Pin the exact version in `package.json` (§11.1).
3. Build a single-call UserOp wrapping `GatewayWallet.deposit(amount)` calldata. The `paymaster` address is read from `ChainConfig` (passed in via args, originally sourced from `GET /v1/blockchains` — §6.7) — **not** from env.
4. Construct the EIP-2612 `permit` approving the Paymaster contract to pull USDC for gas. Signed off-device in the adapter via existing `signTypedData` primitive.
5. Adapter **signs only**. Submission goes through `fetch(POST takumipay-api /v1/userop/submit)` — task 37. Return `{ userOpHash }` from the backend response.
6. EOA support: pass an EIP-7702 `authorization_list` entry when the wallet is an EOA and `chain.chainId` is in the `EIP7502_ALLOWLIST` constant (gate per §12 Q6). Smart-account wallets skip the authorization.
7. `SolanaWalletKit.sendUserOpWithUsdcPaymaster` stays `undefined` — consumers presence-check (task 36 does).

## Rules (non-negotiable)

- Adapter signs only; never POSTs to a bundler URL directly. Bundler keys live in server env (`BUNDLER_URL_*`) per §10 — mobile has no access. Memory: `feedback_role_separation.md`.
- No `if (namespace === "eip155")` branches in shared code. Solana kit leaves the method `undefined`; callers presence-check. Memory: `feedback_chain_extension_discipline.md`.
- `paymaster` address is read from the `ChainConfig` arg (sourced from the chain-config endpoint §6.7) — never hardcoded, never from `EXPO_PUBLIC_*`.
- Private key stays in `expo-secure-store`. UserOp signing goes through the existing `signTypedData` / `signMessage` adapter primitives — no raw-key export to `permissionless`.
- `EIP7502_ALLOWLIST` is a client-side gate per our security discipline (§12 Q6); do not enable EIP-7702 on chains that aren't in the list even if the user's source chain supports it upstream.

## Acceptance

- [ ] `sendUserOpWithUsdcPaymaster` implemented on `EvmWalletKit` matching the §5.5 signature.
- [ ] `permissionless` pinned in `package.json`.
- [ ] Returns `{ userOpHash }` after successful bundler accept (via `/v1/userop/submit`).
- [ ] Throws `PAYMASTER_UNAVAILABLE` (§9.1) when the chain-config `paymaster.address` is null or the bundler 4xx's the UserOp.
- [ ] `SolanaWalletKit.sendUserOpWithUsdcPaymaster === undefined`.
- [ ] Unit test covers: UserOp structure (single `deposit` call), permit typed-data shape, EIP-7702 allowlist gating.
- [ ] `pnpm check:syntax` clean.
- [ ] `pnpm biome:check` clean.

## Out of scope

- Gateway deposit orchestration (calldata build, Paymaster-vs-plain fallback) — task 36.
- Backend `/v1/userop/submit` proxy — task 37.
- `/v1/pay/intents/:id/deposit-receipt` endpoint — task 38.
- Onboarding screen wiring — task 34.
- Solana x402 signing — task 42.
