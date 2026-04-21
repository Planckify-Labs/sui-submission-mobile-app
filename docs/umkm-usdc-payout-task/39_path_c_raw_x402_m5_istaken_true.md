# Task 39 — Path C: Raw x402 on Non-Nanopayments Merchants

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** umkm-usdc-payout-spec.md §5.3, §4 x402 detector, §6.7 `x402.facilitatorUrl`, milestone M5

## Why this matters

Path C unlocks every x402 resource on the internet — arbitrary online merchants, agent-initiated purchases — not just the ones registered with our backend. The signing primitive (EIP-3009) is identical to Path B; only the submission target differs. Reusing the M2 signer means Path C is mostly routing + 402 handling, with zero new crypto primitives. Without Path C, we cap addressable merchants to our onboarded set and lose the agent-mode payment story.

## Scope

1. Implement `components/payment/pathC.ts` (or `services/nanopay/pathC.ts` if the service module layout fits better) with one export: `payX402Resource({ resource, intent, kit, wallet })`.
2. Flow per §5.3:
   - `fetch(resource)` → expect `402 Payment Required` with `X-PAYMENT-Requirements` header (or equivalent JSON body).
   - Parse the 402 response. Extract `paymentRequirements` (same shape as §5.2 Path B: scheme / network / asset / amount / payTo / maxTimeoutSeconds / extra.verifyingContract).
   - Call `kit.signTransferWithAuthorization(...)` — identical invocation to Path B (task 15). Zero new crypto primitive.
   - Re-fetch the resource with the signed payload in the `X-PAYMENT` header. The re-fetch either returns 200 (resource + payment success) or 402 again (payment rejected).
3. Facilitator URL resolution:
   - **Prefer** the facilitator URL named in the merchant's 402 response (per §5.3: "When the scanned merchant's 402 response names a specific facilitator URL, we use that").
   - **Fall back** to `blockchains.x402_facilitator_url` from `useBlockchains()` (§6.7 `x402.facilitatorUrl`) — ops-managed default, e.g. Coinbase CDP on Base, our own `x402-facilitator.takumipay.dev` on Arc.
   - Never hardcode; never env.
4. Route from the §4 x402 detector (task 06) — when the scanner classifies `intent.channel.kind === "x402"`, the path selector (task 41) dispatches here.
5. Error mapping: same §9.1 codes as Path B (`SIGNATURE_INVALID`, `QUOTE_EXPIRED`, `INSUFFICIENT_GATEWAY_BALANCE`, `CIRCLE_UPSTREAM_ERROR` remapped to generic `X402_FACILITATOR_ERROR` when the facilitator isn't Circle).

## Rules (non-negotiable)

- Reuse `signTransferWithAuthorization` from task 15 verbatim — identical typed-data shape, identical adapter call. The only difference is the POST destination. Memory: `feedback_role_separation.md` (adapter signs only).
- Facilitator URL comes from per-chain config or from the 402 response — ops kill-switch works by flipping `blockchains.x402_facilitator_url`. No `if (chainId === X) url = …` branching. Memory: `feedback_chain_extension_discipline.md`.
- If the query/hook for `useBlockchains()` exposes a filter param for chains with `x402` configured, thread it through rather than `.filter()`-ing in the component. Memory: `feedback_filter_at_source.md`.
- The facilitator (Circle, CDP, our Arc instance) is the trusted settlement layer. Mobile never broadcasts on-chain; mobile never adds fee-payer signatures.

## Acceptance

- [ ] Path C helper ships at `components/payment/pathC.ts` (or equivalent).
- [ ] Identical `signTransferWithAuthorization` call as Path B — same args shape, same adapter method.
- [ ] 402 → sign → re-fetch flow works against a staging x402 resource in tests.
- [ ] Facilitator URL resolution prefers the 402 response's named URL; falls back to `blockchains.x402_facilitator_url`.
- [ ] Integration test: scanning a Path C resource routes through task 41's selector and completes without touching Path B-specific endpoints.
- [ ] `pnpm check:syntax` clean.
- [ ] `pnpm biome:check` clean.

## Out of scope

- EIP-3009 signer itself — task 15 (M2).
- Ops setup of our Arc facilitator credentials — task 50.
- Agent-mode routing through Path C — task 46.
- Path selector dispatch — task 41.
