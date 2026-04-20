# Task 16 — Arc Testnet `ChainConfig` Entry

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** umkm-usdc-payout-spec.md §7, §7.1 `ChainConfig`, milestone M2

## Why this matters

Arc Testnet is the source and destination chain for v1. Without a `ChainConfig` entry, `EvmWalletKit` can't build a viem client, and the pay-merchant screen has no RPC to talk to. Arc's defining quirk — `nativeCurrency` is USDC, not ETH — means any code path that assumes `"ETH"` string equality silently misbehaves here. The DB row lives in `takumipay-api` (task 20); this task handles the mobile-side static config.

## Scope

1. Append new `ChainConfig` entry to `constants/configs/chainConfig.ts:68`:
   - `namespace: "eip155"`
   - `chain.id: 5042002`
   - `chain.name: "Arc Testnet"`
   - `chain.nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }` (native-gas view)
   - `chain.rpcUrls.default.http: ["https://rpc.testnet.arc.network"]`
   - `chain.blockExplorers.default: { name: "Arcscan", url: "https://testnet.arcscan.app" }`
   - `iconUrl`: TODO placeholder until `docs.arc.network` publishes one
   - `isTestnet: true`
2. Audit `EvmWalletKit.parseNativeAmount` — for ERC-20 USDC transfers (`transfer`, `transferWithAuthorization`, `balanceOf`) it MUST stay on the 6-decimal ERC-20 interface view. The 18-decimal native-gas view only applies to `estimateGas` / native value fields.
3. Grep for `"ETH"` string-equal assumptions in mobile code that branch on `nativeCurrency.symbol`; update any that would misbehave on Arc.

## Rules (non-negotiable)

- Chain metadata is config, not if-branches. No `if (chainId === 5042002)` anywhere. Memory: `feedback_chain_extension_discipline.md`.
- Prefer the backend-served `useBlockchains()` field over the static config wherever the row is available — static config is only the bootstrap seed for viem client creation. Memory: `feedback_filter_at_source.md`.
- Gateway / Paymaster / x402 contract addresses belong in the backend `blockchains` row (task 19 + 20), not here. This file only holds chain identity + RPC.

## Acceptance

- [ ] Arc Testnet entry in `constants/configs/chainConfig.ts` with the exact values above.
- [ ] `EvmWalletKit.parseNativeAmount` documented / tested to stay on 6-decimal ERC-20 view for transfers.
- [ ] Grep audit of `"ETH"` equality in mobile code completed; any offenders fixed.
- [ ] App boots with Arc Testnet selectable in chain picker; `useWallet` can switch to Arc and fetch a USDC balance.
- [ ] `pnpm check:syntax` clean.
- [ ] `pnpm biome:check` clean.

## Out of scope

- Backend `blockchains` row + Circle columns — task 19 (schema) + task 20 (seed).
- Enriched `GET /v1/blockchains` response fields — task 21.
- Arc mainnet cut-over — task 48.
- Tokenized write path on `WalletKitAdapter` (replacing inline `erc20Abi` calls in `app/send.tsx:414-421`) — separate follow-up (§11).
