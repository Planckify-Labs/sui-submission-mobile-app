# Task 47 — Enforce the three-env-var rule on mobile

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** umkm-usdc-payout-spec.md §10, §4.4, cross-cutting
(lands with M2 — depends on task 21 shipping `/v1/blockchains`)

## Why this matters

§10 reduces mobile env to three values:
`EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_AI_API_URL`,
`EXPO_PUBLIC_TAKUMIPAY_QR_PUBKEY_JWK`. Everything else —
chain IDs, RPC URLs, USDC token addresses, Gateway contracts,
Paymaster, x402 domain, bundler URLs — rides on `blockchains` /
`tokens` rows via `/v1/blockchains` (task 21). Letting a single
chain coordinate leak back into `.env` breaks the zero-release chain-
addition story. This task sweeps the repo for leaks and installs a
guard so new ones can't land.

## Scope

1. Grep `EXPO_PUBLIC_` across `mobile-app/` source (code + `.env*` +
   `eas.json`). Any hit outside the three survivors is either (a)
   migrated to `/v1/blockchains` consumption via `useBlockchains()`,
   or (b) deleted.
2. Update `.env.example` to contain exactly the three survivors —
   with the §10 comments explaining why each can't come from the API.
3. Move the bundled JWK into `constants/takumipayKey.ts` that reads
   `process.env.EXPO_PUBLIC_TAKUMIPAY_QR_PUBKEY_JWK` at module load
   and exports a parsed `JsonWebKey`. Verifier (task 09) imports from
   here — not from `process.env` directly.
4. Rotation procedure doc in the same file's jsdoc: new key ships via
   EAS OTA on the same channel as `EIP7702_ALLOWLIST`. Pre-rotation
   clients reject new-key JWSes correctly (failed signature →
   `QR_TAMPERED` per §9.1). Nudge via the existing in-app update
   banner; no forced upgrade.
5. Add a `check:env` script (shell or node) that fails CI if any
   `EXPO_PUBLIC_*` name outside the allow-list appears in source.
   Hook into `pnpm check:syntax`'s lane.

## Rules (non-negotiable)

- **Three-role separation** — server secrets
  (`XENDIT_*`, `CIRCLE_*`, `BUNDLER_URL_*`, `ARC_SETTLER_PRIVATE_KEY`,
  `TAKUMIPAY_QR_PRIVATE_KEY_PEM`) never appear under `EXPO_PUBLIC_`.
  They live in `takumipay-api/.env` only.
- **Chain-extension discipline** — chain coordinates live in
  `blockchains` rows. Any temptation to add `EXPO_PUBLIC_<CHAIN>_*` is
  a bug; thread it through `useBlockchains()` instead.
- **Filter at source** — pubkey verification uses the bundled JWK; do
  not fetch the pubkey from `/v1/*` (chicken-and-egg per §10 comment).

## Acceptance

- [ ] `.env.example` contains exactly the three allow-listed vars.
- [ ] Grep finds no other `EXPO_PUBLIC_*` in `mobile-app/` source.
- [ ] `constants/takumipayKey.ts` exports the parsed JWK; task 09
      imports from here.
- [ ] `pnpm check:env` fails on a planted bad var in a test fixture.
- [ ] `pnpm check:syntax` + `pnpm biome:check` pass.

## Out of scope

- `/v1/blockchains` endpoint itself (task 21).
- JWS verifier logic (task 09).
- Server-side env cleanup in `takumipay-api` (tracked separately).
- Mainnet rotation of the JWK (task 48).
