# Task 31 — Feature flag + gradual rollout

**Status:** Not taken
**Owner:** Shared / Ops
**Spec reference:** `solana-contract-integration-spec.md` §9 Phase 5.

## Why this matters

Solana onchain settlement is a new payment rail touching real money.
A gradual rollout with feature flag control allows monitoring for
issues, quick disable if problems arise, and controlled expansion
from internal testing to full production.

## Scope

### Feature flag

Add `solana_onchain_settlement` feature flag in the blockchain
configuration (Blockchain model or feature flag service):

- **Default: disabled.** Even after mainnet deployment (Task 29),
  the flag must be explicitly enabled.
- **Granularity:** Per-blockchain row. The Solana mainnet blockchain
  row has this flag; EVM rows are unaffected.

### API-side gating

- Intent creation (`POST /v1/pay/intents`): when resolving `path`,
  check if the blockchain's Solana onchain settlement is enabled.
  If disabled, skip `"direct_arc"` path for Solana chains — fall
  through to other available paths (nanopay B-SVM, etc.).
- The mobile app path selector doesn't need changes — if the API
  doesn't return `path: "direct_arc"`, the mobile never enters the
  onchain path.

### Rollout stages

1. **Internal only:** Enable for internal test accounts. Monitor
   logs, verify on-chain state.
2. **Beta users:** Enable for a small cohort (e.g., specific
   merchant IDs or user segments).
3. **Regional rollout:** Enable for specific regions/markets.
4. **General availability:** Enable for all users. Remove the
   feature flag check (or leave as a permanent kill switch).

### Monitoring

- Alert on: `SolanaVerificationService` errors, `waitForConfirmation`
  timeouts, PDA verification mismatches.
- Dashboard: Solana settlement volume, success rate, average
  confirmation time.
- Unpause the on-chain program (`Config.paused = false`) only when
  the flag is enabled for the first rollout stage.

## Rules (non-negotiable)

- **Flag disabled by default.** Explicit opt-in required at each
  rollout stage.
- **API-side gate only.** The mobile app should work regardless of
  flag state — it just won't receive `path: "direct_arc"` from the
  API when the flag is off.
- **Kill switch.** Disabling the flag must immediately stop new
  Solana onchain settlements. In-flight settlements (already
  broadcasted) should still be verified.

## Acceptance

- [ ] Feature flag exists and defaults to disabled.
- [ ] API intent creation respects the flag for Solana chains.
- [ ] EVM onchain settlement unaffected by the flag.
- [ ] Flag can be toggled without API restart (if using external
      flag service) or with restart (if DB-backed).
- [ ] Monitoring alerts configured.
- [ ] Rollout stages documented.

## Out of scope

- Mainnet deployment (Task 29).
- Keypair provisioning (Task 30).
- Automated rollout (manual progression through stages).
