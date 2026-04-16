# DApp Bridge — Task Backlog

This folder contains engineering tasks derived from `../dapp-bridge-spec.md`.
Each file represents one discrete unit of work from the spec's §6 phased
rollout and §10 EVM compliance matrix.

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
| Not started | `01_chain_adapter_types_istaken_false.md` |
| In progress | `01_chain_adapter_types_istaken_true.md` |
| Finished    | `01_chain_adapter_types_istaken_true_isfinish_true.md` |

## Workflow

1. Browse the tasks, pick one that ends with `istaken_false.md`.
2. Claim it by renaming `istaken_false` → `istaken_true`:
   ```
   git mv 01_chain_adapter_types_istaken_false.md 01_chain_adapter_types_istaken_true.md
   ```
3. Work on the task. Read the referenced sections of `../dapp-bridge-spec.md` —
   each task file excerpts only the minimum context needed.
4. When the task is complete and merged, append the `_isfinish_true`
   postfix — do NOT flip `istaken` back to `false`:
   ```
   git mv 01_chain_adapter_types_istaken_true.md 01_chain_adapter_types_istaken_true_isfinish_true.md
   ```
   Finished files stay in the folder as a durable record of what shipped.
5. If you abandon a task mid-flight, rename it back to `istaken_false.md`
   (without the `isfinish_true` postfix) so someone else can pick it up.

## Phase ordering

Tasks are numbered by the phase they belong to in the spec. **Do not start a
later phase before the previous phase's exit criteria are green.**

- **Phase 1a** (tasks 01–11) — extract ports, behavior-identical. No user-visible change.
- **Phase 1b** (tasks 12–24) — EVM compliance for production. Required for GA.
- **Phase 1c** (tasks 25–28) — smart account support. Required for GA.
- **Phase 2** (task 29) — agent-bridged approvals.
- **Phase 3** (task 30) — second chain (Solana).

Phase 4 (Sui) and Phase 5 (AI-powered protection) are intentionally not yet
broken into tasks — they have their own future specs per §6 and §9.

## Task map

### Phase 1a — Ports and behavior-identical refactor

| # | File | Title |
|---|---|---|
| 01 | `01_chain_adapter_types_istaken_false.md` | `ChainAdapter` / `ChainRequest` / `ChainResult` types + registry |
| 02 | `02_approval_types_istaken_false.md` | `ApprovalIntent` / `ApprovalDecision` types + `pendingIntents` store |
| 03 | `03_inspector_pipeline_istaken_false.md` | `IntentInspector` pipeline + `HttpsInspector` built-in |
| 04 | `04_bridge_event_bus_istaken_false.md` | `BridgeEventBus` + `ConsoleSink` + `redact.ts` |
| 05 | `05_dapp_bridge_router_istaken_false.md` | `DappBridge` router — owns pending-intent map, runs inspectors |
| 06 | `06_approval_host_and_shell_istaken_false.md` | `ApprovalHost` + `ApprovalShell` chrome + renderer registry |
| 07 | `07_wallet_namespace_istaken_false.md` | `TWallet.namespace` field + backfill on boot |
| 08 | `08_evm_adapter_extract_istaken_false.md` | Extract `EvmAdapter` from `ethereumProvider.ts`, kill `global as any` |
| 09 | `09_evm_injected_script_eip6963_istaken_false.md` | Move injected script + announce via EIP-6963 |
| 10 | `10_migrate_modals_to_sheets_istaken_false.md` | Rename modals → `EvmTransactionSheet` / `EvmSignMessageSheet` / `ConnectSheet` |
| 11 | `11_rewrite_dapps_browser_screen_istaken_false.md` | Rewrite `app/dapps-browser.tsx` to ≤180 lines |

### Phase 1b — EVM production compliance

| # | File | Title |
|---|---|---|
| 12 | `12_permission_store_eip2255_istaken_false.md` | `PermissionStore` (EIP-2255) + `eth_accounts` privacy fix (EIP-1102) |
| 13 | `13_add_chain_sheet_eip3085_istaken_false.md` | `AddChainSheet` (EIP-3085) + user-editable chain list |
| 14 | `14_switch_chain_sheet_eip3326_istaken_false.md` | `SwitchChainSheet` (EIP-3326) + `4902` contract |
| 15 | `15_watch_asset_sheet_eip747_istaken_false.md` | `WatchAssetSheet` (EIP-747) + ERC-20/721/1155 |
| 16 | `16_batch_calls_sheet_eip5792_istaken_false.md` | `EvmBatchCallsSheet` (EIP-5792) + `wallet_getCapabilities` |
| 17 | `17_transaction_type_coverage_istaken_false.md` | Transaction types 0 / 1 / 2 normalization |
| 18 | `18_gas_reestimation_ux_istaken_false.md` | Gas re-estimation + dApp-vs-wallet side-by-side |
| 19 | `19_nonce_strategy_and_speedup_istaken_false.md` | Pending-nonce tracking + speed up / cancel |
| 20 | `20_sig_validation_erc1271_eip6492_istaken_false.md` | `EvmAdapter.verifySignature()` (ERC-1271 + EIP-6492) |
| 21 | `21_permit_decoders_istaken_false.md` | Permit2 + ERC-2612 decoders + unlimited-approval warn |
| 22 | `22_calldata_4byte_decoder_istaken_false.md` | Calldata selector decoder (local 4byte db) |
| 23 | `23_siwe_structured_render_istaken_false.md` | SIWE (EIP-4361) structured rendering + domain check |
| 24 | `24_error_code_contract_istaken_false.md` | Adapter error-code contract (4001 / 4100 / 4200 / 4900-4902 / -32002 / -32602 / -32603) |

### Phase 1c — Smart account support

| # | File | Title |
|---|---|---|
| 25 | `25_wallet_type_smart_istaken_false.md` | `TWallet.type` adds `Smart4337` / `Smart7702` + `isSmartAccount` |
| 26 | `26_erc4337_execution_path_istaken_false.md` | ERC-4337 UserOperation execution in `EvmAdapter` |
| 27 | `27_eip7702_delegation_istaken_false.md` | EIP-7702 `signAuthorization` intent + delegated batch |
| 28 | `28_paymaster_erc7677_istaken_false.md` | Paymaster selection UI + ERC-7677 wiring |

### Phase 2 — Agent-bridged approvals

| # | File | Title |
|---|---|---|
| 29 | `29_agent_renderer_and_submit_istaken_false.md` | `AgentCardRenderer` + `DappBridge.submitAgentIntent` |

### Phase 3 — Second chain (Solana)

| # | File | Title |
|---|---|---|
| 30 | `30_solana_adapter_istaken_false.md` | `SolanaAdapter` + Wallet Standard + Solana sheets |

## Source of truth

`../dapp-bridge-spec.md` is the canonical spec. These task files are a
projection of it — if anything here disagrees with the spec, the spec wins.
Update the spec first, then update the task.
