# DeFi Strategies — Task Backlog

This folder contains engineering tasks derived from
`../defi-strategies-spec.md`. Each file represents one discrete
unit of work from the spec's §19 rollout plan plus the supporting
type / persistence / CI surfaces called out across §5–§16.

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
| Not started | `01_prisma_models_migration_istaken_false.md` |
| In progress | `01_prisma_models_migration_istaken_true.md` |
| Finished    | `01_prisma_models_migration_istaken_true_isfinish_true.md` |

## Workflow

1. Browse the tasks, pick one that ends with `istaken_false.md`.
2. Claim it by renaming `istaken_false` → `istaken_true`:
   ```bash
   git mv 01_prisma_models_migration_istaken_false.md 01_prisma_models_migration_istaken_true.md
   ```
3. Work on the task. Read the referenced sections of
   `../defi-strategies-spec.md` — each task file excerpts only the
   minimum context needed.
4. When the task is complete and merged, append the `_isfinish_true`
   postfix — do NOT flip `istaken` back to `false`:
   ```bash
   git mv 01_prisma_models_migration_istaken_true.md 01_prisma_models_migration_istaken_true_isfinish_true.md
   ```
   Finished files stay in the folder as a durable record of what shipped.
5. If you abandon a task mid-flight, rename it back to `istaken_false.md`
   (without the `isfinish_true` postfix) so someone else can pick it up.

## Phase ordering

Tasks are numbered by the phase they belong to in the spec. **Do not start
a later phase before the previous phase's exit criteria are green.** 

- **Phase 1 (MVP)** (tasks 01–11) — The smallest end-to-end Conservative-tier flow.
- **Phase 2 (Solana + cross-chain)** (tasks 12–15) — Solana adapters, Morpho Vaults, cross-chain routing, DeBank integration.
- **Phase 3 (Full tier coverage)** (tasks 16–19) — Balanced and Aggressive tier coverage, tier-caps on auto-approvals, reward claiming.

## Task map

### Phase 1 — MVP

| # | File | Title |
|---|---|---|
| 01 | `01_prisma_models_migration_istaken_false.md` | Prisma models and migration (`UserStrategy`, `StrategyPosition`, `OpportunityCache`, `ProtocolScoreCache`) |
| 02 | `02_api_strategies_endpoints_istaken_false.md` | `api/` strategies module and `/strategies/*` endpoints |
| 03 | `03_api_defillama_scoring_workers_istaken_false.md` | `api/` DeFiLlama poller, scoring service, and BullMQ workers |
| 04 | `04_api_zerion_client_istaken_false.md` | `api/` Zerion free-tier client with daily budget circuit breaker |
| 05 | `05_mobile_defi_skeleton_adapters_istaken_false.md` | Mobile `services/defi/` skeleton, executor registrations, and Phase 1 adapters |
| 06 | `06_mobile_strategies_screens_ui_istaken_false.md` | Mobile `app/strategies/` screens and three new structured-UI cards |
| 07 | `07_agent_api_tool_registry_istaken_false.md` | `agent-api/` tool-registry update + system-prompt fragment |
| 08 | `08_threshold_store_env_vars_ff_istaken_false.md` | Threshold-store extension, Env Vars, and entry point feature flag |
| 09 | `09_ci_guard_pnpm_check_defi_istaken_false.md` | CI Guard: `pnpm check:defi` script and `package.json` entry |
| 10 | `10_phase_1_verification_testnet_e2e_istaken_false.md` | Phase 1 verification and End-to-end test on Base testnet |
| 11 | `11_multi_agent_stub_to_real_flip_istaken_false.md` | Multi-agent "Stub-to-Real" Flip |

### Phase 2 — Solana + cross-chain

| # | File | Title |
|---|---|---|
| 12 | `12_solana_adapters_jito_maple_istaken_false.md` | Solana adapters: Jito, Maple syrupUSDC |
| 13 | `13_evm_morpho_vaults_adapter_istaken_false.md` | EVM Morpho Vaults adapter (Conservative) |
| 14 | `14_lifi_cross_chain_routing_istaken_false.md` | LI.FI cross-chain routing proxy + `defi_cross_chain_deposit` executor |
| 15 | `15_debank_paid_client_istaken_false.md` | DeBank paid client for richer EVM history + approvals audit |

### Phase 3 — Full tier coverage

| # | File | Title |
|---|---|---|
| 16 | `16_balanced_tier_adapters_istaken_false.md` | Balanced adapters: Yearn v3, EigenLayer, Ethena sUSDe |
| 17 | `17_aggressive_tier_adapters_istaken_false.md` | Aggressive adapters: GMX v2 GLP, Hyperliquid LP |
| 18 | `18_tier_cap_auto_approvals_istaken_false.md` | Tier-cap on auto-approval thresholds (`defi_per_action_usd`) |
| 19 | `19_reward_claiming_surface_istaken_false.md` | Extra surface for reward claiming (`buildClaim?`) |

## Source of truth

`../defi-strategies-spec.md` is the canonical spec. These task
files are a projection of it — if anything here disagrees with the spec,
the spec wins.
