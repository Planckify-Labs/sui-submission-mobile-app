# Threshold-store extension, Env Vars, and Feature Flag

**Phase 1 — MVP**

Refer to `../defi-strategies-spec.md` §2, §15, §19, and §22.
Implement the following:
- Extend `services/transferThresholdStore.ts` to include `defi_per_action_usd` and `defi_per_day_usd`.
- Provision the required `api/.env` variables for MVP (§22.3):
  - `ZERION_API_KEY` (secret)
  - `DEFILLAMA_API_KEY` (optional)
  - `DEFI_WORKERS_ENABLED` (default true)
  - `DEFI_STABLECOIN_DEPEG_THRESHOLD_BPS` (default 50)
  - `DEFI_ZERION_DAILY_BUDGET_REQUESTS` (default 1000)
- Add a feature flag to mobile and gate the `/strategies` entry point to allow for a dark-launch.
- Widen `ToolCapability` at `services/permissionGrantStore.ts:23` to include `defi_read` and `defi_write`.
- Ensure `bootDefi()` is guarded with a runtime check that `walletKitRegistry` is not empty.
