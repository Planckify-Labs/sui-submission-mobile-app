# Task 37 — UserOp Submit Proxy (`POST /v1/userop/submit`)

**Status:** Not taken
**Owner:** Backend (takumipay-api)
**Spec reference:** umkm-usdc-payout-spec.md §6.7 `UserOpSubmitRequest` / `UserOpSubmitResponse`, §10 bundler env vars, milestone M4

## Why this matters

ERC-4337 bundlers (Pimlico / Alchemy / Stackup) are rate-limited and API-keyed. If the mobile app POSTed UserOps to them directly, the key either lives in `EXPO_PUBLIC_*` (leaked on device) or in a per-user OAuth exchange (over-engineered for v1). The proxy keeps the key server-side, matches the same discipline we already hold for the Nanopayments settle proxy (§6.5), and gives us an audit row per-intent. Without it, the deposit adapter (task 35) has no endpoint to POST to.

## Scope

1. New controller `takumipay-api: src/userop/submit.controller.ts`. Route `POST /v1/userop/submit`. SIWE-session auth like every other `/v1/*` endpoint.
2. Request body exactly matches `UserOpSubmitRequest` from §6.7:
   ```ts
   { chainId: number; userOp: object; entryPoint: `0x${string}`; intentId?: `pi_${string}` }
   ```
3. Resolve bundler URL server-side:
   ```ts
   const bundlerUrl = process.env[`BUNDLER_URL_${chainId}`] ?? process.env.BUNDLER_URL_DEFAULT;
   ```
   400 with `PAYMASTER_UNAVAILABLE` if both are unset.
4. Forward as JSON-RPC `eth_sendUserOperation` (per §6.7 pseudocode). Parse the JSON-RPC response, surface `result` as `userOpHash`, map error codes into the same §9.1 matrix the mobile app already switches on.
5. Response body exactly matches `UserOpSubmitResponse`:
   ```ts
   { userOpHash: `0x${string}`; bundler: "pimlico" | "alchemy" | … }
   ```
6. Audit row: if `intentId` is present, write a row keyed on it linking `userOpHash`, `chainId`, `bundler`, timestamps. Shape mirrors the existing `nanopay_submissions` audit pattern (§6.6).

## Rules (non-negotiable)

- `BUNDLER_URL_*` env vars live **only** in `takumipay-api/.env` — never `EXPO_PUBLIC_*`. Bundler API keys must never appear on-device. (§10.)
- Proxy does not re-sign. It validates shape + chain, then forwards bytes. Three-role separation: mobile signs, server relays, bundler executes. Memory: `feedback_role_separation.md`.
- No `if (chainId === X)` special-casing in the controller — resolve via `process.env[\`BUNDLER_URL_\${chainId}\`]`. Chains extend by DB row + env var, not by controller code. Memory: `feedback_chain_extension_discipline.md`.
- Returning error messages: echo the JSON-RPC `error.message` verbatim only into the audit row; mobile gets the mapped §9.1 code, not the raw bundler string.

## Acceptance

- [ ] `POST /v1/userop/submit` returns `UserOpSubmitResponse` on success.
- [ ] Returns mapped §9.1 error code on bundler rejection.
- [ ] `BUNDLER_URL_84532`, `BUNDLER_URL_421614`, `BUNDLER_URL_DEFAULT` are the only env vars touched — no other hardcoded bundler URLs.
- [ ] Audit row written when `intentId` present.
- [ ] E2E test with a Pimlico testnet key verifies happy-path UserOp hash return.
- [ ] `pnpm check:syntax` clean.
- [ ] `pnpm biome:check` clean.

## Out of scope

- Mobile adapter signing — task 35.
- Deposit orchestration service — task 36.
- Deposit-receipt endpoint — task 38.
- Any agent-mode submission path — task 46.
