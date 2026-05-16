# DeFi Strategies — Engineering Spec

> **Status:** Draft v0.3 · Owner: Agent / Wallet · Last updated: 2026-05-15
> **Scope:** Add autonomous yield strategies to Takumi Agent, deeply
> integrated with the *existing* TakumiPay codebase (mobile + `api/` +
> `agent-api/`). The original research document
> (`external-files/takumipay-defi-strategies-research.md`, May 2026) is
> the **intent reference**; this spec rebases that intent onto what we
> already have so we don't rebuild primitives we already own.
>
> **Prerequisite — multi-agent architecture lands first.** This spec
> ships *into* the topology defined by
> [`docs/multi-agent-architecture-spec.md`](./multi-agent-architecture-spec.md),
> which introduces a Core/Wallet/DeFi specialist split and registers
> the DeFi agent as a **stub** (status `"stub"`, canned tool responses,
> friendly "coming soon" copy via Core). When that redesign is merged,
> the DeFi specialist slot exists and is wired to the orchestrator —
> implementing this spec is then **flipping the DeFi card from `stub`
> → `ready` and replacing the stub executors with the real ones**. The
> topology, conversation persistence, prefix routing, peer-message
> bus, and Core narration all stay byte-identical across the flip.
> See §25 for the precise flip checklist.
>
> **Architectural discipline:** TakumiPay extends chain support through
> a **space-docking pattern** — capabilities sit behind a small,
> presence-checked adapter interface, registered with a registry, and
> shared code dispatches through the registry rather than branching on
> namespace strings. We already have two docking ports —
> `ChainAdapter` (dApp bridge) and `WalletKitAdapter` (first-party
> wallet operations). This spec introduces a **third** docking port,
> `DefiProtocolAdapter`, with the same discipline. See §7.
>
> **Sources:** every concrete address, SDK package, and endpoint cited
> below is doc-sourced. Citation list lives in Appendix C.

## Table of Contents

1. [Goal & non-goals](#1-goal--non-goals)
2. [Build-vs-buy decisions (TL;DR)](#2-build-vs-buy-decisions-tldr)
3. [What we already have (inventory)](#3-what-we-already-have-inventory)
4. [Gap analysis](#4-gap-analysis)
5. [Architecture overview](#5-architecture-overview)
6. [New module layout](#6-new-module-layout)
7. [DeFi protocol adapter — the third docking port](#7-defi-protocol-adapter--the-third-docking-port)
8. [Risk scoring model — implementation](#8-risk-scoring-model--implementation)
9. [Data API integration — DeFiLlama / DeBank / Zerion](#9-data-api-integration--defillama--debank--zerion)
10. [Cross-chain handling — LI.FI (deferred to Phase 2)](#10-cross-chain-handling--lifi-deferred-to-phase-2)
11. [Agent executor tools](#11-agent-executor-tools)
12. [`agent-api/` changes](#12-agent-api-changes)
13. [`api/` (backend) changes](#13-api-backend-changes)
14. [UI flows](#14-ui-flows)
15. [Permission, threshold, JWT, isolation rules](#15-permission-threshold-jwt-isolation-rules)
16. [User-facing error rule application](#16-user-facing-error-rule-application)
17. [Multi-chain phasing](#17-multi-chain-phasing)
18. [Rebalance & monitoring](#18-rebalance--monitoring)
19. [Phased rollout](#19-phased-rollout)
20. [Risk register](#20-risk-register)
21. [Resolved decisions](#21-resolved-decisions)
22. [Environment variables — all repos](#22-environment-variables--all-repos)
23. [Testing strategy — testnet, no real money](#23-testing-strategy--testnet-no-real-money)
24. [Compatibility audit — what we touch, what stays untouched](#24-compatibility-audit--what-we-touch-what-stays-untouched)
25. [Multi-agent architecture integration — stub-to-real flip](#25-multi-agent-architecture-integration--stub-to-real-flip)
26. [Appendix A — Worked example: Conservative USDC deposit](#appendix-a--worked-example-conservative-usdc-deposit)
27. [Appendix B — Protocol coordinates](#appendix-b--protocol-coordinates)
28. [Appendix C — Source citations](#appendix-c--source-citations)

---

## 1. Goal & non-goals

### Goal

Ship a **DeFi Strategies** capability inside Takumi Agent that lets the
user delegate "earn yield within these constraints" to the agent, while
the user's device remains the sole signer.

Three deliverables:

1. **Strategy configuration:** risk tier, asset preference, allocation
   %, chain preference, liquidity preference, protocol whitelist,
   rebalance trigger, notifications.
2. **Opportunity discovery:** scored ranking of yield opportunities
   pulled from DeFiLlama, filtered by the user's tier.
3. **Autonomous execution:** the agent proposes deposits / withdrawals
   / rebalances; the user approves once-per-action (or pre-approves via
   the existing grant + threshold system); the device signs.

### Non-goals

- **Hosted wallets / off-device key custody.** The fundamental promise
  remains self-custody.
- **A new smart-account / ERC-4337 stack.** We are NOT integrating
  Safe / Biconomy / ZeroDev session keys (see §2). The existing
  permission-grant + transfer-threshold stores already cover what
  session keys would give us.
- **Building protocol contracts.** We integrate Aave, Lido, Curve,
  Morpho, etc. as they exist — no novel on-chain code from us in v1.
- **Auto-execution without user approval.** Every signed step in
  every tier remains human-in-the-loop. The agent proposes; the user
  signs. (Auto-approval *thresholds* are a separate, narrower
  primitive — see §15.)
- **A new bridge protocol.** Cross-chain rebalances are deferred to
  Phase 2 and will go through LI.FI (or its equivalent) via a backend
  proxy — see §10.

---

## 2. Build-vs-buy decisions (TL;DR)

The research doc lists Safe / Biconomy / ZeroDev as the "session keys
+ spending limits + gas sponsorship + social recovery" option. **We
already have equivalents for the first two and partial equivalents
for the last two; we do not need account abstraction to ship DeFi
Strategies.**

| Capability research recommends ERC-4337 for | Status in TakumiPay | Decision |
|---|---|---|
| **Session keys** (time-limited agent signing authority) | `services/permissionGrantStore.ts` already encodes per-wallet grants with `{ once \| session \| timed (expires_at) \| permanent }` lifetimes, scoped to `tool` / `capability` / `global`. See `permissionGrantStore.ts:25-42`. | **Reuse.** A "Conservative DeFi Strategy" grant with `lifetime: { type: "timed", expires_at: now+30d }` and `scope: { kind: "capability", key: "write" }` IS a session key. |
| **Spending limits** (per-tx / per-day caps enforced at SC level) | `services/transferThresholdStore.ts` — per-wallet, per-`(chainId, token)` USD thresholds with `default_native_usd`, `default_token_usd`, and an `overrides` map. See `transferThresholdStore.ts:60-91`. | **Reuse + extend.** Add a `defi_per_action_usd` knob and a `defi_per_day_usd` rolling window (still client-side, still per-wallet). No on-chain enforcement needed because the device is the sole signer. |
| **Gas sponsorship** (paymaster pays gas in USDC) | Already integrated for payments: `walletKit` exposes `sendUserOpWithUsdcPaymaster()` (Circle Paymaster, Base / Arbitrum). See `services/walletKit/types.ts:189-218`. | **Reuse where available.** Wrap DeFi deposit calldata in the same UserOp path on chains where Circle Paymaster is live; fall back to EOA `sendContractTransaction` elsewhere. |
| **Social recovery** | Spec exists: `docs/social-recovery-spec.md`. Orthogonal to DeFi Strategies. | **Out of scope** for this feature; pulled in separately if/when the social-recovery spec ships. |

**Bottom line:** we don't need Safe / Biconomy / ZeroDev to ship this.
The agent-permission + transfer-threshold + grant system is
functionally equivalent for the agent-mode use case because the
policy is enforced *before* the device signs, not on-chain. Every
strategy operation in this spec is human-in-the-loop: the agent
proposes, the user approves (per-action or via a pre-set grant), the
device signs. Account abstraction is **out of scope** for this spec
and not on the roadmap.

---

## 3. What we already have (inventory)

File paths verified during scoping. This list is the substrate the
feature builds on.

### Wallet & signing

- `hooks/useWallet.ts` + `useWallet.helpers.ts` — multi-namespace
  wallet state (EVM / Solana / Sui). Lazy signer derivation; signers
  cached post-derivation; signing happens on-device.
- `services/walletKit/{registry,bootstrap,chainInfo}.ts` — the
  `WalletKitAdapter` registry (`services/walletKit/types.ts:310-508`).
  Key methods we'll lean on:
  - `sendContractTransaction()` (EVM) — already used by the onchain
    settlement rail; will carry every Aave/Lido/Curve deposit call.
  - `sendAnchorInstruction()` (Solana) — for Jito / Kamino / Marinade.
  - `sendUserOpWithUsdcPaymaster()` — gas in USDC on Base / Arbitrum.
- `services/walletService.ts` — derives `viem.Account`s and Solana
  signers from secure-store-encrypted seeds.

### Agent infrastructure

- `services/agent-executors/` — mobile executor registry; the SSE
  dispatcher routes `tool_pending` events to functions in
  `EXECUTORS` (`services/agent-executors/index.ts:50-59`). Executor
  signature in `types.ts:104-107`.
- `services/agentSession/` — chat session lifecycle + UI fan-out.
- `services/agent-messages/` — message + tool part state machine.
- `components/home/TakumiAgent/AgentMode.tsx` — chat UI, voice, history.
- `components/home/TakumiAgent/PendingTxCard/` — optimistic tx status
  card.
- `components/home/TakumiAgent/PreviewCard/` — tool-call preview / approve.
- `components/agent/approvalSheetLogic.ts` — five-option grant picker
  (`once`, `session`, timed presets, timed absolute, permanent).
- `services/permissionGrantStore.ts` — per-wallet grant store
  (SecureStore-backed). Types at `permissionGrantStore.ts:25-42`.
- `services/transferThresholdStore.ts` — per-wallet USD thresholds
  with per-token overrides.
- `services/agentPermissionsHelpers.ts` — resolves grants for a tool
  call.
- `app/agent-permissions.tsx` — settings UI.

### Chain integration

- `services/chains/{evm,solana,sui}/` — per-namespace adapters.
  `EvmAdapter.ts` (~57 KB) covers `eth_call`, `eth_sendTransaction`,
  signing, bundler integration, EIP-7702.
- `services/staking/lstDetector.ts` — read-only detection of stETH /
  wstETH / rETH / cbETH on EVM mainnet (allowlist + exchange-rate
  helpers).
- `services/staking/vaultDetector.ts` — dynamic ERC-4626 vault
  detection (`asset()`, `convertToAssets()`).
- `services/swap/aggregator.ts` — same-chain swap routing, backend-
  proxied. No bridging.
- `services/rpc/MultiProvider.ts` — multi-provider RPC with failover
  and per-RPM rate limits.
- `services/indexer/registry.ts` — provider-agnostic indexer
  (balances, history, approvals, token prices, NFTs).
- `services/tokens/tokenList.ts` — default per-chain token registry +
  user-added tokens in SQLite + spam flags.

### Auth & backend integration

- `hooks/queries/useAuth.ts` — SIWE per-wallet JWT (access + refresh,
  silent refresh on 401, tokens keyed by lowercased address).
- `api/endpoints/blockchains.ts` — `/v1/blockchains` chain metadata
  feed (RPC, USDC address, paymaster, gateway, explorer). This is the
  single source of truth for per-chain coordinates — no
  `EXPO_PUBLIC_<CHAIN>_*` env vars.

### Backends

- `api/` — NestJS, Prisma (Postgres + TimescaleDB), Valkey, BullMQ.
  Existing modules: products, booking, transactions, blockchains,
  tokens, points, redemption, merchants, dapps, payment intents,
  NFTs, admin, exchange-rate. **No DeFi / yield / strategy / portfolio
  module yet.** The `dapps` module catalogs Aave/Curve/Yearn as
  *external* dapps; that's it.
- `agent-api/` — NestJS + Fastify, Prisma (Conversation + Message
  only), Valkey, Kimi K2 LLM via `@ai-sdk/openai` adapter.
  SSE-streamed bidirectional tool protocol with mobile
  (`AGENT_PROTOCOL.md`). No persistent state beyond chat history; no
  blockchain access; no third-party API keys for DeFi data.

### What is *not* there

Grep results for `lifi`, `li.fi`, `defillama`, `debank`, `zerion`,
`morpho`, `eigenlayer`, `yearn` (lending integration), `aave`
(integration, beyond the token in the tokenlist), `curve` (router),
`jito` (staking integration): **zero hits**. Nothing to clean up
or migrate from.

---

## 4. Gap analysis

| Component | Reusable | Build new |
|---|---|---|
| Wallet signing (EVM / Solana / Sui) | ✅ `walletKit.sendContractTransaction` / `sendAnchorInstruction` | — |
| Agent tool-call protocol | ✅ `agent-executors` registry + `tool_pending` SSE | New tool *registrations* (§11) on both server and mobile |
| Agent approval UX | ✅ `PreviewCard` + `ApprovalSheet` | — |
| Per-wallet JWT | ✅ `useAuth` (SIWE) | — |
| Per-wallet grants (session keys equivalent) | ✅ `permissionGrantStore` | New scope keys: `capability: "defi_write"`, `tool: "defi_<verb>_<protocol>"` |
| Spending limits | ✅ `transferThresholdStore` | New knobs: `defi_per_action_usd`, `defi_per_day_usd` rolling window |
| Same-chain swaps | ✅ `services/swap` | — for v1 (only needed when user holds the wrong token for the strategy; defer) |
| Cross-chain routing | ❌ | **Deferred to Phase 2** (LI.FI proxy via backend) |
| DeFi protocol adapters (Aave/Lido/Curve/Morpho) | ❌ | **New: `services/defi/adapters/`** |
| Position reads | ❌ | **New: `services/defi/positions/`** — direct contract reads via adapter `readPosition()` (authoritative); **Zerion free tier** (1k req/day) for portfolio summary card. DeBank paid usage deferred to Phase 2. |
| Risk scoring | ❌ | **New: server-side in `api/`** (`StrategyScoringService`) |
| Yield discovery | ❌ | **New: server-side polling of DeFiLlama → cache in `api/`** |
| Strategy CRUD (user config) | ❌ | **New: `UserStrategy` model + `/v1/strategies` controller in `api/`** |
| Rebalance trigger | ❌ | **New: BullMQ job in `api/`** + agent tool to actually act |
| Position tracking (P&L) | ❌ | **New: `StrategyPosition` model in `api/`** + on-screen reads |
| Strategy UI screens | ❌ | **New: `app/strategies/`** |
| Notification fanout | ✅ existing push (`services/push/`) | New notification types |

---

## 5. Architecture overview

This section maps every communication edge between TakumiPay's
systems for the DeFi-Strategies feature. The same patterns govern the
rest of the app (payments, points, dApp browser) — DeFi is just one
more set of tool calls + REST endpoints + workers riding on the
existing rails.

### 5.1 Actor map

Five logical actors and what they own:

| Actor | Trust boundary | Owns |
|---|---|---|
| **mobile-app** | User device | UI, signers (SecureStore-encrypted), permission/threshold stores, agent-executor registry, per-wallet JWTs |
| **api/** | TakumiPay servers | Payments, points, blockchains feed, **strategies module (NEW)**, Postgres, Valkey, BullMQ workers |
| **agent-api/** | TakumiPay servers (separate process) | Chat sessions, tool registry, LLM (Kimi K2), Postgres (Conversation + Message only). **No blockchain access, no per-user secrets.** |
| **Chain RPC providers** | 3rd party | EVM/Solana/Sui JSON-RPC endpoints (Alchemy, Infura, Helius, custom — config in `Blockchain` table) |
| **External data + payment providers** | 3rd party | DeFiLlama, Zerion, DeBank, LI.FI (Phase 2), Circle Gateway, Xendit/Duitku/Flip, Google OAuth |

### 5.2 System topology — the full picture

```
┌─────────────────────────────── User Device (mobile-app, RN/Expo) ────────────────────────────────┐
│                                                                                                  │
│  ┌────────────────────┐    ┌──────────────────────┐    ┌────────────────────────────────────┐    │
│  │  /strategies UI    │    │  Takumi Agent UI     │    │ Existing wallet UI                 │    │
│  │  (NEW — §14)       │    │  (chat + preview)    │    │  (/send, /pay, /deposit, /dapps…) │    │
│  └─────────┬──────────┘    └──────────┬───────────┘    └──────────────────┬─────────────────┘    │
│            │ TanStack Query           │ useChat (SSE)                     │                      │
│  ┌─────────▼──────────────────────────▼────────────────────────────────────▼─────────────────┐   │
│  │           Hook + service layer (useWallet, useStrategies, useAgentSession, …)            │   │
│  └────┬────────────────────────┬───────────────────────────────────┬────────────────────┬───┘   │
│       │                        │                                   │                    │       │
│  ┌────▼──────────────┐ ┌───────▼──────────────────┐ ┌──────────────▼───────────┐ ┌──────▼─────┐ │
│  │ walletKit         │ │ agent-executors registry │ │ defi adapters (NEW §7)   │ │ bridge     │ │
│  │ (3 kits — docking │ │  EXECUTORS map           │ │  AaveV3 · Lido · Curve   │ │ (EIP-1193) │ │
│  │  port #2)         │ │  reads/writes/sim/points │ │  (third docking port)    │ │ approvals  │ │
│  │  EvmWalletKit     │ │  + NEW defi_*            │ │                          │ │            │ │
│  │  SolanaWalletKit  │ │                          │ │ buildDeposit/Withdraw    │ │ (existing) │ │
│  │  SuiWalletKit     │ │                          │ │  → UnsignedCall          │ │            │ │
│  └────┬──────────────┘ └──────────────────────────┘ └──────────────────────────┘ └────────────┘ │
│       │ signs locally — private key NEVER leaves device                                          │
│  ┌────▼──────────────┐  ┌─────────────────────────────────┐                                       │
│  │ SecureStore       │  │ SQLite (custom tokens, …)        │                                      │
│  │ - wallet seeds    │  │                                  │                                      │
│  │ - per-wallet JWTs │  │                                  │                                      │
│  │ - permissionGrants│  │                                  │                                      │
│  │ - transferThresholds                                                                            │
│  └───────────────────┘  └──────────────────────────────────┘                                      │
│                                                                                                   │
└──────┬──────────────────────────┬───────────────────────────────┬─────────────────────────────────┘
       │                          │                               │
       │ ➊ HTTPS + Bearer JWT     │ ➋ SSE bi-directional          │ ➌ HTTPS RPC (read +
       │   (per-wallet, SIWE)     │   POST /chat (open stream)    │    sign-and-broadcast)
       │   /v1/strategies/*       │   POST /chat/:id/respond      │   eth_call, eth_sendRawTx,
       │   /v1/blockchains, etc.  │   GET /chat/:id/stream         │   Solana getAccountInfo,
       │   Authorization: Bearer  │   Bearer SECRET_AI_KEY        │   sendTransaction, etc.
       │                          │                               │
┌──────▼──────────────────────────┴────────────────┐  ┌───────────▼───────────────┐
│  api/  (NestJS + Fastify)                        │  │  agent-api/ (NestJS+Fasti)│  │  Chain RPC providers
│                                                  │  │                           │  │  Alchemy / Infura /
│  REST /v1/* — JwtAuthGuard global                │  │  POST /chat   (SSE in)   │  │  Helius / custom
│  /auth/* (SIWE — issues per-wallet JWT)          │  │  POST /chat/:id/respond  │  │  (per chain via
│                                                  │  │  GET  /chat/:id/stream   │  │   `Blockchain` row)
│  Existing modules:                               │  │  POST /transcribe (STT)  │  │
│   pay · points · blockchains · tokens · dapps    │  │                           │  │  Only mobile talks to
│   merchants · transactions · userOp · auth · …   │  │  TOOL_REGISTRY:           │  │  these directly —
│                                                  │  │   all defi_*             │  │  the backends never
│  NEW strategies module (this spec):              │  │   `executor: "mobile"`   │  │  hold a user key.
│   /v1/strategies                                 │  │  ─→ server emits         │  │
│   /v1/strategies/opportunities                   │  │     `tool_pending`,      │  │
│   /v1/strategies/positions                       │  │     mobile executes      │  │
│                                                  │  │     locally, posts back  │  │
│  Prisma / Postgres                               │  │     via /respond.        │  │
│   + UserStrategy / StrategyPosition              │  │                           │  │
│   + OpportunityCache / ProtocolScoreCache        │  │  Prisma / Postgres:       │  │
│  Valkey (cache, depeg flags, JWT denylist)       │  │   Conversation, Message   │  │
│  BullMQ (workers — §5.5)                         │  │  Valkey (rate limit)      │  │
│  NATS (cross-pod cache invalidation)             │  │  LLM: Kimi K2 via         │  │
│                                                  │  │       @ai-sdk/openai       │  │
└─────┬──────────────────────┬─────────────────────┘  └───────────────────────────┘
      │ ➍ HTTPS              │ ➎ Postgres / Valkey / NATS
      │   (server → external)│
      ▼                      ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│  External providers — ONLY api/ talks to these; mobile NEVER does              │
│                                                                                 │
│  DeFi data:                                                                     │
│   ▸ DeFiLlama  https://api.llama.fi / yields.llama.fi   (free, no auth)        │
│   ▸ Zerion     https://api.zerion.io/v1                 (Bearer; free 1k/day)  │
│   ▸ DeBank     https://pro-openapi.debank.com/v1        (AccessKey; Phase 2)   │
│   ▸ LI.FI SDK  @lifi/sdk                                (Phase 2)              │
│                                                                                 │
│  Payment / settlement (existing):                                               │
│   ▸ Circle Gateway (x402 / Paymaster)                                           │
│   ▸ Xendit · Duitku · Flip (IDR payouts)                                        │
│                                                                                 │
│  Identity (existing):                                                            │
│   ▸ Google OAuth                                                                 │
└────────────────────────────────────────────────────────────────────────────────┘

Legend  ➊ = REST + per-wallet JWT (the "paying wallet's JWT" rule from CLAUDE.md)
        ➋ = Server-Sent-Events; the agent NEVER asks the wallet for a JWT
        ➌ = Mobile-only outbound RPC; api/ uses its own RPC layer separately for indexing
        ➍ = Server-to-server HTTPS with server-side API keys (never in mobile binary)
        ➎ = Intra-VPC traffic
```

**Three non-edges worth calling out** (things that look like they
might communicate, but don't):

- **agent-api/ ↔ api/.** There is currently no edge here. Strategy
  reads (opportunities, positions, user config) round-trip through
  mobile because mobile holds the per-wallet JWT. The agent emits
  a `tool_pending` for `defi_list_opportunities`; mobile calls
  `/v1/strategies/opportunities` with its JWT; mobile posts the
  list back through `/chat/:id/respond`. This preserves the
  "paying-wallet JWT" rule and keeps agent-api stateless w.r.t.
  user data.
- **mobile-app ↔ external DeFi providers.** Mobile never calls
  DeFiLlama / Zerion / DeBank / LI.FI. Keeps API keys out of the
  binary and gives the backend one place to cache + rate-limit.
- **agent-api/ ↔ Chain RPC providers.** Zero. The agent server has
  no signers, no chain clients, and no RPC URLs — by design.

### 5.3 Boot order — the three docking ports in sequence

```
app/_layout.tsx
  │
  ├─→ pollyfills.ts                    CSPRNG + react-native-quick-crypto
  │
  ├─→ bootWalletKits()                 register EvmWalletKit, SolanaWalletKit, SuiWalletKit
  │                                    (docking port #2 — first-party wallet ops)
  │
  ├─→ bootDefi()                       NEW. register AaveV3Ethereum/Base/Arbitrum,
  │                                    LidoMainnet, Curve3pool (docking port #3 —
  │                                    DeFi protocols). MUST run after bootWalletKits
  │                                    because adapters resolve walletKit at build time.
  │
  └─→ first screen mount
       │
       └─→ bootBridge()                register EvmAdapter, SolanaAdapter, SuiAdapter
                                        + installSolanaSigner (docking port #1 —
                                        EIP-1193 dApp bridge).
```

### 5.4 Tool-call sequence — Conservative USDC deposit (canonical)

```
mobile-app              agent-api               api/                Chain RPC
    │                       │                     │                      │
    │ POST /chat (SSE open) │                     │                      │
    │  wallet_context: {addr: 0xBBB, namespace, chain_id, …}              │
    │ "Find safe USDC yield"│                     │                      │
    │ ─────────────────────▶│                     │                      │
    │                       │ LLM reasoning       │                      │
    │ ◀──── tool_pending ───│ (defi_list_opportunities {tier})           │
    │                                                                    │
    │ GET /v1/strategies/opportunities?tier=conservative                  │
    │  Authorization: Bearer <JWT for 0xBBB>                              │
    │ ──────────────────────────────────────────▶                        │
    │                                             │ read OpportunityCache │
    │                                             │ (worker-pre-scored)  │
    │ ◀───── 200 [{slug,apy,score, …}] ───────────│                      │
    │                                                                    │
    │ POST /chat/:id/respond { output: [opps] }   │                      │
    │ ─────────────────────▶│                                            │
    │                       │ LLM proposes a deposit                     │
    │ ◀──── tool_pending ───│ (defi_deposit {slug, chain, asset, amount})│
    │                                                                    │
    │ ─── DEFI EXECUTOR (mobile):                                         │
    │     1. resolve grant   (defi_write, 30d-timed → allowed)            │
    │     2. resolve threshold (defi_per_action_usd ≥ $500 → allowed)    │
    │     3. revalidate APY  (drift < 5% vs OpportunityCache → ok)       │
    │     4. defiRegistry.get("aave-v3-base") → buildDeposit()           │
    │     5. UnsignedCall { approve(USDC, Pool, amt) + Pool.supply(...) }│
    │     6. walletKit.sendUserOpWithUsdcPaymaster(call)                  │
    │        signs locally with 0xBBB's signer (NEVER activeWallet)       │
    │                                                                    │
    │ ──── UserOp via bundler proxy ─────────────────────────────▶       │
    │                                                                  ok │
    │ ◀──────────────────────────────────────────────────────────────────│
    │                                                                    │
    │ POST /v1/strategies/positions  (record open position)              │
    │ ──────────────────────────────────────────▶                        │
    │ ◀──────────────────── 201 ──────────────────                       │
    │                                                                    │
    │ POST /chat/:id/respond                                             │
    │  { tool_call_id, output: {status:"ok", tx_hash} }                  │
    │ ─────────────────────▶│                                            │
    │                       │ LLM composes receipt                       │
    │ ◀── SSE text: "Deposit confirmed in block 21,…"                    │
```

### 5.5 Backend worker pipeline (BullMQ in `api/`)

```
                    ┌───────────────────────────────────────┐
                    │       BullMQ scheduler (Valkey)        │
                    └─────────────────┬─────────────────────┘
                                      │
        ┌─────────────────────────────┼─────────────────────────────┐
        │ every 4h                     │ every 5 min       per active │
        │                              │                   UserStrategy │
        ▼                              ▼                      ▼
┌────────────────────┐   ┌────────────────────────┐  ┌────────────────────────┐
│ defillama-poll     │   │ stablecoin-depeg-watcher│ │ rebalance-trigger      │
│ ↦ GET /pools       │   │ ↦ GET /stablecoins      │ │ ↦ read OpportunityCache │
│ ↦ GET /protocol/x  │   │   if deviation>50bps:   │ │   compare vs current   │
│ ↦ GET /overview/fees   │     emit NATS depeg     │ │   StrategyPosition.apy │
│ ↦ upsert            │   │     pause UserStrategy │ │   write RebalanceCand  │
│   OpportunityCache  │   │     push notif          │ │   notify per policy    │
└──────────┬──────────┘   └────────────────────────┘  └────────────────────────┘
           │
           ▼
┌────────────────────────────────────┐
│ score-opportunities  (fan-out)      │
│  5-dimension model (§8)             │
│  upsert OpportunityCache.score      │
│  upsert ProtocolScoreCache          │
└────────────────────────────────────┘
           │
           ▼
    Postgres / Valkey  ◀── read by  /v1/strategies/opportunities (mobile)
                       ◀── read by  /v1/strategies/positions     (mobile)
```

### 5.6 Per-wallet JWT binding (CLAUDE.md rule, applied here)

```
A user typically holds three wallets at once (one BIP-39 seed →
one EVM + one Solana + one Sui, per useWallet.helpers.ts):

    wallet A   namespace eip155     0xAAA…
    wallet B   namespace eip155     0xBBB…
    wallet C   namespace solana     SOLxxx

SecureStore — one JWT pair per wallet:

    access_token_<lowercased addr>     access TTL ~90 days
    refresh_token_<lowercased addr>    refresh TTL ~200 days

The "paying-wallet JWT" rule generalises to DeFi Strategies:
    /v1/strategies/* for wallet B uses wallet B's JWT — never the
    active wallet's, never wallet A's. Same as payment intents.

Mobile flow:
    hooks/useStrategyJwtBinder(walletB)
      → ky instance with `Authorization: Bearer <wallet B JWT>`
      → all /v1/strategies/* reads/writes bind to wallet B server-side.

Silent refresh on 401: POST /auth/refresh with refresh_token_<B>.
```

### 5.7 dApp-bridge isolation, applied to strategy operations

```
Home screen displays activeWallet = A. User opens Takumi Agent and
explicitly switches the agent's context to wallet B. Agent proposes
a deposit. WHICH wallet signs?

WRONG (the bug class fixed in commit 4828e91 for dApp signing):
    defi_deposit handler  →  reads useWallet().activeWallet (= A)
                          →  signs with A's key
                          →  position lands under A
                          →  user looks at /strategies on B and sees nothing

RIGHT (this spec, §15.5):
    tool_pending payload carries intent.wallet = walletB
    defi_deposit handler  →  reads intent.wallet
                          →  walletKit.sendContractTransaction({ wallet: B, … })
                          →  signs with B's key
                          →  position lands under B

Same rule applies to every preview-card render, every approval-sheet
prompt, every signer derivation, every /v1/strategies/* call. The
agent's wallet_context is the source of truth — NOT useWallet's
activeWallet.
```

### 5.8 Free-tier data routing (MVP cost = $0/month)

```
                    api/  defillama.client.ts
                      │
       ┌──────────────┼──────────────┐
       │ no auth      │              │ optional Pro key
       ▼              │              ▼
 api.llama.fi       (default)   pro-api.llama.fi/<KEY>
 yields.llama.fi                 (only if DEFILLAMA_API_KEY set)


                    api/  zerion.client.ts
                      │  Authorization: Bearer base64(<ZERION_API_KEY>)
                      │  rate guard: DEFI_ZERION_DAILY_BUDGET_REQUESTS
                      ▼
              api.zerion.io/v1
              wss://api.zerion.io/v1/wallets/:addr/subscribe   (push)


                    api/  debank.client.ts   (Phase 2 / dev only)
                      │  AccessKey: <DEBANK_ACCESS_KEY>
                      │  cost guard: DEFI_DEBANK_DAILY_BUDGET_CENTS
                      ▼
              pro-openapi.debank.com/v1


                    api/  lifi.client.ts     (Phase 2)
                      │  createConfig({ integrator: LIFI_INTEGRATOR })
                      │  optional LIFI_API_KEY at volume
                      ▼
              @lifi/sdk → li.fi APIs
```

### 5.9 What this whole picture buys us

- **Mobile is the only signer.** Every signed action originates on
  the device. Neither backend ever holds key material.
- **agent-api stays thin.** It speaks SSE, runs the LLM, persists
  chat. It has no blockchain access, no user JWTs, no DeFi business
  logic. Adding DeFi means adding *tool names* to its registry plus
  a system-prompt fragment — nothing more.
- **api/ stays the system of record.** UserStrategy, positions,
  scoring, worker pipelines, external-data caching — all centralised
  with cache + rate-limit + circuit breakers.
- **No new SaaS dependency for MVP.** DeFiLlama free + Zerion free
  tier; everything else either deferred or already paid for by
  another feature (Circle Paymaster, Xendit, etc.).
- **The three docking ports stay independent.** A new chain is one
  new `WalletKitAdapter` + one new `ChainAdapter` (existing
  pattern). A new protocol is one new `DefiProtocolAdapter`
  (new pattern, §7). Neither touches the other.

---

## 6. New module layout

### Mobile

```
mobile-app/
├ app/
│  └ strategies/
│     ├ index.tsx                      # Strategies tab (positions + opportunities)
│     ├ onboarding.tsx                 # First-time risk tier + asset prefs
│     ├ opportunity-detail.tsx         # Per-opportunity drill-down
│     ├ position-detail.tsx            # Per-position drill-down + exit CTA
│     └ settings.tsx                   # Tier, allocation %, whitelist, notifs
│
├ components/strategies/                 # Full-screen / standalone UI (the /strategies tab)
│  ├ StrategyCard.tsx
│  ├ RiskTierPicker.tsx
│  ├ OpportunityRow.tsx
│  ├ PositionRow.tsx
│  ├ RiskBadge.tsx
│  ├ ApyDisplay.tsx
│  └ DefiErrorBoundary.tsx              # mirrors PaymentError pattern
│
├ components/home/TakumiAgent/StructuredUI/cards/   # In-chat structured-UI cards (§14.5)
│  ├ OpportunityListCard.tsx            # NEW — defi_list_opportunities
│  ├ PositionListCard.tsx               # NEW — defi_list_positions
│  └ RebalancePreviewCard.tsx           # NEW — defi_rebalance preview step
│                                       # (defi_deposit / defi_withdraw reuse the
│                                       #  existing unified PendingTxCard.tsx)
│
├ hooks/queries/
│  ├ useStrategies.ts                  # GET /v1/strategies
│  ├ useStrategyOpportunities.ts       # GET /v1/strategies/opportunities
│  ├ useStrategyPositions.ts           # GET /v1/strategies/positions
│  ├ useStrategyConfig.ts              # CRUD on user config
│  └ useStrategyMutations.ts           # deposit/withdraw/exit
│
├ services/defi/
│  ├ types.ts                          # DefiProtocolAdapter, RiskTier, etc.
│  ├ registry.ts                       # `defiRegistry` (parallel to walletKit)
│  ├ bootstrap.ts                      # Wires adapters at app boot
│  ├ adapters/
│  │  ├ aaveV3.ts                      # EVM lending
│  │  ├ morpho.ts                      # EVM optimised lending
│  │  ├ lido.ts                        # EVM liquid staking
│  │  ├ curve3pool.ts                  # EVM stable LP
│  │  ├ jito.ts                        # Solana liquid staking (Phase 2)
│  │  └ maple.ts                       # RWA (Phase 2)
│  ├ positions/
│  │  ├ reader.ts                      # Per-adapter readPosition() dispatch
│  │  └ pnl.ts                         # Deposit value vs current value math
│  ├ errors/
│  │  └ defiErrors.ts                  # classifyDefiError → DefiErrorCode (per §16)
│  └ tools/
│     ├ schemas.ts                     # Zod schemas (§11)
│     ├ defi_list_opportunities.ts     # Mobile executor; calls api/
│     ├ defi_list_positions.ts
│     ├ defi_get_config.ts
│     ├ defi_simulate_deposit.ts
│     ├ defi_deposit.ts
│     ├ defi_withdraw.ts
│     ├ defi_claim.ts
│     └ defi_rebalance.ts
│
└ services/agent-executors/defi/        # Per multi-agent §7.2 layout
   ├ reads.ts                           # defi_list_opportunities, defi_list_positions, defi_get_config
   ├ simulate.ts                        # defi_simulate_deposit
   └ writes.ts                          # defi_deposit, defi_withdraw, defi_claim, defi_rebalance
                                        # (registered into the flat EXECUTORS map by services/agent-executors/index.ts)
```

### `api/` (backend)

```
api/src/
└ strategies/
   ├ strategies.module.ts
   ├ strategies.controller.ts          # /v1/strategies routes
   ├ strategies.service.ts             # User config CRUD
   ├ opportunities.service.ts          # Reads OpportunityCache, returns filtered list
   ├ positions.service.ts              # Reads StrategyPosition + on-chain values
   ├ scoring/
   │  ├ scoring.service.ts             # 5-dimension model (§8)
   │  ├ protocolSafety.ts
   │  ├ yieldSustainability.ts
   │  ├ liquidityAndExit.ts
   │  ├ marketExposure.ts
   │  └ chainAndBridge.ts
   ├ external/
   │  ├ defillama.client.ts
   │  ├ debank.client.ts               # Phase 2
   │  └ lifi.client.ts                 # Phase 2
   ├ workers/
   │  ├ goal-deadline-watcher.processor.ts  # §14.6 — daily nudge near targetDate
   │  ├ defillama-poll.processor.ts    # Every 4h
   │  ├ score-opportunities.processor.ts
   │  ├ stablecoin-depeg-watcher.processor.ts
   │  └ rebalance-trigger.processor.ts # Per user; honours rebalance-frequency
   └ events.ts                         # NATS / EventEmitter contracts
```

### `agent-api/`

```
agent-api/src/
└ tools/
   └ defi/                             # NEW
      ├ defiToolRegistry.ts            # Adds defi_* to the server TOOL_REGISTRY
      └ defiToolPrompts.ts             # System prompt fragments
```

### Prisma additions (`api/prisma/schema.prisma`)

```prisma
model UserStrategy {
  id                 String   @id @default(cuid())
  userId             String
  walletAddress      String   // lowercased
  namespace          String   // "eip155" | "solana" | "sui"
  tier               String   // "conservative" | "balanced" | "aggressive"
  assetPreference    String   // "stable" | "eth_lst" | "multi"
  liquidityPref      String   // "instant" | "7d" | "30d"
  chainPref          Json     // ["any"] or [1, 8453, 42161]
  allocationPct      Int      // 10/25/50/custom
  rebalanceTrigger   Json     // { kind: "interval", value: "weekly" } | { kind: "yield_drop", thresholdBps: 150 }
  protocolWhitelist  String[] // ["aave-v3","lido","curve-3pool"] — empty MEANS "use curated default" (see §21.2), NOT "any protocol in tier"
  allowAllInTier     Boolean  @default(false)  // §21.2 — opt-out of curation; when true an empty protocolWhitelist means "any protocol in tier"
  notificationLevel  String   // "every" | "daily" | "alerts"
  activatedAt        DateTime?
  pausedAt           DateTime?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
  positions          StrategyPosition[]
  @@index([userId])
  @@index([walletAddress])
}

model StrategyPosition {
  id                 String   @id @default(cuid())
  userStrategyId     String
  walletAddress      String   // lowercased
  chainId            Int      // 0 for non-EVM; carry namespace + slug below
  namespace          String
  protocolSlug       String   // "aave-v3" | "lido" | "morpho" | ...
  assetSymbol        String   // "USDC" | "ETH" | ...
  assetContract      String?  // lowercased, null for native
  amountAtDeposit    String   // raw units (decimal string for bigint)
  amountAtDepositUsd Decimal  // snapshotted USD value at deposit
  currentAmountRaw   String?  // last observed
  currentAmountUsd   Decimal? // last observed
  status             String   // "active" | "withdrawn" | "failed"
  openTxHash         String?
  closeTxHash        String?
  openedAt           DateTime
  closedAt           DateTime?

  // §14.6 — goal tracking. Both optional; set when the LLM extracts a
  // goal+horizon from the user's natural-language request
  // ("I want to use it later to buy a laptop after 3 months" → goal:
  // "Laptop purchase", targetDate: now+90d). Surfaced in the
  // PositionListCard countdown. Drives the goal-deadline-watcher
  // worker (§18) that nudges the user when targetDate is near or past.
  goal               String?
  targetDate         DateTime?

  userStrategy       UserStrategy @relation(fields: [userStrategyId], references: [id])
  @@index([walletAddress, status])
  @@index([targetDate])  // goal-deadline-watcher scans by date
}

model OpportunityCache {
  id                String   @id @default(cuid())
  protocolSlug      String
  chainId           Int      // 0 for non-EVM (carry namespace below)
  namespace         String
  assetSymbol       String
  poolId            String   // DeFiLlama pool id
  apy               Decimal
  apy7dAvg          Decimal
  apyStddev30d      Decimal
  tvlUsd            Decimal
  tvl7dDelta        Decimal
  emissionsToFeesRatio Decimal?
  ilExposure        Boolean  // true if pool can experience IL
  score             Int      // 0–100 composite
  tier              String   // "conservative" | "balanced" | "aggressive"
  raw               Json     // upstream payload for debugging
  scoredAt          DateTime
  @@unique([poolId])
  @@index([tier, score])
}

model ProtocolScoreCache {
  protocolSlug      String   @id
  safetyScore       Int      // 0–100 protocol-safety dimension (slow-moving)
  auditCount        Int
  protocolAgeDays   Int
  exploitHistoryFlag Boolean
  tvlTrendBps       Int      // signed; 7d trend in bps
  computedAt        DateTime
}
```

> Note: `Decimal` (Prisma) for USD; raw token amounts as `String` to
> avoid `Number` precision loss; mirrors the existing
> `TransactionHistory.amount` pattern in the schema.

---

## 7. DeFi protocol adapter — the third docking port

### 7.1 What the space-docking pattern is and why we use it

From `docs/sui-chain-support-spec.md` §2 and
`docs/solana-chain-support-spec.md` §4.5: the codebase already extends
chain support through a **space-docking architecture** — two registries
flank a tagged-union `TWallet`, and shared code resolves an adapter by
namespace then calls a uniform method. The two existing ports:

- **`ChainAdapter`** (`services/chains/types.ts`) — dApp-bridge surface.
  `EvmAdapter`, `SolanaAdapter`, `SuiAdapter` implement it.
- **`WalletKitAdapter`** (`services/walletKit/types.ts:310-508`) —
  first-party wallet operations surface (creation, signing, sends).
  `EvmWalletKit`, `SolanaWalletKit`, `SuiWalletKit` implement it.

Three rules the pattern enforces — all of which we inherit verbatim:

1. **No namespace branching in shared code.** `components/`, `hooks/`,
   `app/` MUST NOT contain `namespace === "eip155" | "solana" | "sui"`.
   Enforced by `scripts/check-chain-agnostic.sh` (`pnpm check:chains`).
2. **Optional capabilities are presence-checked, not namespace-checked.**
   Example: `signX402SvmPayment?` is optional on the `WalletKitAdapter`
   interface; consumers do `if (kit.signX402SvmPayment) {...}`, never
   `if (namespace === "solana") {...}`. This is the
   `feedback_chain_extension_discipline.md` memory in action.
3. **New chains are additive.** A new namespace ships as one new
   adapter file + one register call in `bootstrap.ts`. Zero edits to
   `app/`.

### 7.2 `DefiProtocolAdapter` — the third docking port

This spec introduces a parallel registry-and-adapter pair for DeFi
protocols, following the same shape:

```
                  ┌──────────────────────────────────────┐
                  │        TWallet (tagged)              │
                  │  namespace: 'eip155'|'solana'|'sui'  │
                  └──────┬───────────────────────────────┘
                         │
        ┌────────────────┼─────────────────────┐
        ▼                ▼                     ▼
┌──────────────────┐  ┌──────────────────┐  ┌─────────────────────┐
│ ChainAdapter     │  │ WalletKitAdapter │  │ DefiProtocolAdapter │
│ Registry         │  │ Registry         │  │ Registry (NEW)      │
│ (dApp-bridge)    │  │ (first-party)    │  │ (yield strategies)  │
│   EvmAdapter     │  │   EvmWalletKit   │  │   AaveV3EthAdapter  │
│   SolanaAdapter  │  │   SolanaWalletKit│  │   AaveV3BaseAdapter │
│   SuiAdapter     │  │   SuiWalletKit   │  │   LidoMainnetAdapter│
└──────────────────┘  └──────────────────┘  │   Curve3poolAdapter │
                                            │   MorphoVaultAdapter│
                                            │   JitoSolAdapter    │
                                            │   …                 │
                                            └─────────────────────┘
```

Critical differences from a chain adapter (so the analogy doesn't
mislead):

- A `DefiProtocolAdapter` is keyed by **`(protocol, chain)` tuple**,
  not by namespace. Aave-v3 on Ethereum and Aave-v3 on Base are two
  *separate* adapters that share a SuperClass — same calldata shape
  per Aave v3 ABI, different `POOL` address per deployment.
- It **does not own a signer or a transport**. It produces
  `UnsignedCall`s; submission goes through the existing
  `WalletKitAdapter` methods (`sendContractTransaction`,
  `sendAnchorInstruction`, etc.). The wallet kit is the only thing
  that touches private keys.
- The interface includes **presence-checked optional capabilities**
  in the same way the wallet kit does. Example: `buildClaim?` for
  protocols that have a separate reward-claim flow (Curve, Yearn),
  `buildWrap?` for protocols where wstETH wrapping is a step the user
  may want (Lido). Shared code does
  `if (adapter.buildClaim) { ... }`, never branches on protocol slug.

### 7.3 Interface (`services/defi/types.ts`)

```ts
import type { Namespace } from "@/services/chains/types";
import type { ChainConfig } from "@/constants/configs/chainConfig";
import type { TWallet } from "@/constants/types/walletTypes";

export type RiskTier = "conservative" | "balanced" | "aggressive";
export type StrategyKind =
  | "stablecoin_lending"
  | "liquid_staking"
  | "rwa_yield"
  | "yield_vault"
  | "lp_stable"
  | "lp_volatile"
  | "restaking"
  | "delta_neutral";

export interface DefiOpportunity {
  protocolSlug: string;
  namespace: Namespace;
  chainId: number | string;          // EVM number or Solana cluster string
  assetSymbol: string;
  assetContract?: string;            // null for native
  apy: number;
  apy7dAvg: number;
  tvlUsd: number;
  score: number;                     // 0–100
  tier: RiskTier;
  kind: StrategyKind;
  liquidityProfile: "instant" | "queued_short" | "queued_long";
  source: "defillama" | "manual";
}

export interface DefiPosition {
  protocolSlug: string;
  namespace: Namespace;
  chainId: number | string;
  assetSymbol: string;
  amountAtDeposit: bigint;
  amountAtDepositUsd: number;
  currentAmount: bigint;
  currentAmountUsd: number;
  pnlUsd: number;
  openTxHash?: string;
}

export interface BuildDepositArgs {
  wallet: TWallet;
  chain: ChainConfig;
  asset: { symbol: string; contract?: string; decimals: number };
  amount: bigint;                    // raw units
}

export interface BuildWithdrawArgs extends BuildDepositArgs {
  /** raw units; pass `"MAX"` to exit fully. */
  amount: bigint | "MAX";
}

/**
 * One adapter per (protocol, chain) deployment. AaveV3 on Ethereum is
 * one, AaveV3 on Base is another. Solana / Sui protocols implement
 * the same interface; chain-specific submission lives in the
 * `UnsignedCall` discriminant and the WalletKitAdapter method the
 * caller picks. Shared code never branches on protocolSlug.
 */
export interface DefiProtocolAdapter {
  readonly slug: string;                     // e.g. "aave-v3-base"
  readonly namespace: Namespace;             // discriminator for UnsignedCall
  readonly kind: StrategyKind;
  readonly chainId: number | string;
  readonly displayName: string;

  /** Pure builds — no signer required. Caller submits via WalletKit. */
  buildDeposit(args: BuildDepositArgs): Promise<UnsignedCall>;
  buildWithdraw(args: BuildWithdrawArgs): Promise<UnsignedCall>;

  /** Pure read — no signer required. */
  readPosition(walletAddress: string): Promise<DefiPosition | null>;

  // ── Optional capabilities (presence-checked, never namespace-checked) ──
  /** Rewards claim where the protocol has a separate accrual primitive. */
  buildClaim?(args: BuildDepositArgs): Promise<UnsignedCall>;
  /** wstETH wrap / unwrap, jitoSOL stake-account merge, etc. */
  buildWrap?(args: BuildDepositArgs): Promise<UnsignedCall>;
  /** Adapter-level safety override; falls back to server-computed score. */
  staticSafetyScore?: number;                // 0–100
  /** Per-deployment minimum deposit in raw asset units. */
  minDepositRaw?: bigint;
}

/**
 * `UnsignedCall` carries everything submission needs *except* a
 * signer. The discriminant maps 1:1 to the `WalletKitAdapter` write
 * method the caller will pick:
 *
 *   "evm-call"   → walletKit.sendContractTransaction()
 *                  (or sendUserOpWithUsdcPaymaster() on Base/Arb)
 *   "solana-ix"  → walletKit.sendAnchorInstruction()
 *   "sui-ptb"    → walletKit.<sui send method>      (when a Sui DeFi adapter ships)
 *
 * The `needsApproval` field on the EVM variant tells the caller it
 * must inject an ERC-20 approve preamble before the target call.
 * Same shape the gasless paymaster path already consumes
 * (`services/walletKit/types.ts:189-218`), so we can route either
 * branch through it.
 */
export type UnsignedCall =
  | {
      kind: "evm-call";
      to: `0x${string}`;
      data: `0x${string}`;
      value?: bigint;
      needsApproval?: {
        token: `0x${string}`;
        spender: `0x${string}`;
        amount: bigint;
      };
    }
  | {
      kind: "solana-ix";
      instructions: import("@solana/web3.js").TransactionInstruction[];
      additionalSigners?: import("@solana/web3.js").Signer[];
    }
  | {
      kind: "sui-ptb";
      transactionBlockBase64: string;
    };
```

### 7.4 Registry (`services/defi/registry.ts`)

Same shape as `walletKitRegistry`. Strict map, no fuzzy matching:

```ts
const adapters = new Map<string, DefiProtocolAdapter>();
export function registerDefiAdapter(a: DefiProtocolAdapter): void {
  adapters.set(a.slug, a);
}
export function getDefiAdapter(slug: string): DefiProtocolAdapter | null {
  return adapters.get(slug) ?? null;
}
export function listDefiAdapters(): DefiProtocolAdapter[] {
  return [...adapters.values()];
}
export function listDefiAdaptersForChain(
  namespace: Namespace,
  chainId: number | string,
): DefiProtocolAdapter[] {
  return [...adapters.values()].filter(
    (a) => a.namespace === namespace && a.chainId === chainId,
  );
}
```

### 7.5 Bootstrap (`services/defi/bootstrap.ts`)

Matches `services/walletKit/bootstrap.ts` exactly — one register call
per shipped adapter. Idempotent so the entry hook fires safely on
multiple mounts.

```ts
import { registerDefiAdapter } from "./registry";
import { AaveV3EthereumAdapter, AaveV3BaseAdapter, AaveV3ArbitrumAdapter } from "./adapters/aaveV3";
import { LidoMainnetAdapter } from "./adapters/lido";
import { Curve3poolAdapter }   from "./adapters/curve3pool";
// Phase 2+:
// import { MorphoVaultsAdapter } from "./adapters/morpho";
// import { JitoSolAdapter }       from "./adapters/jito";
// import { MapleSyrupUsdcAdapter } from "./adapters/maple";

let booted = false;
export function bootDefi(): void {
  if (booted) return;
  registerDefiAdapter(AaveV3EthereumAdapter);
  registerDefiAdapter(AaveV3BaseAdapter);
  registerDefiAdapter(AaveV3ArbitrumAdapter);
  registerDefiAdapter(LidoMainnetAdapter);
  registerDefiAdapter(Curve3poolAdapter);
  booted = true;
}
```

Wiring point: call `bootDefi()` from `app/_layout.tsx` *after*
`bootWalletKits()` — DeFi adapters use the wallet-kit registry at
build time, so we need wallets registered first.

### 7.6 CI enforcement — `pnpm check:defi`

Add a sibling guardrail to `pnpm check:chains`. New script
`scripts/check-defi-agnostic.sh` greps `components/`, `hooks/`,
`app/` for `protocolSlug === "<known>"` / `slug === "aave-v3-…"`
branches and fails the build if any are found outside an allowlist.
The allowlist starts empty.

Adding the script to `package.json`:

```json
"check:defi": "bash scripts/check-defi-agnostic.sh",
"test": "pnpm test:vitest && pnpm test:node",
"prepush": "pnpm lint && pnpm check:syntax && pnpm check:chains && pnpm check:defi && pnpm test"
```

### 7.7 Reference adapter — Aave v3 on Base

A grounded sketch so the pattern is concrete. Coordinates are
doc-sourced (Appendix B):

```ts
// services/defi/adapters/aaveV3.ts
import { AaveV3Base } from "@bgd-labs/aave-address-book";
import { encodeFunctionData, erc20Abi } from "viem";

const POOL_ABI = [
  {
    name: "supply",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "onBehalfOf", type: "address" },
      { name: "referralCode", type: "uint16" },
    ],
    outputs: [],
  },
  {
    name: "withdraw",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "to", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const AaveV3BaseAdapter: DefiProtocolAdapter = {
  slug: "aave-v3-base",
  namespace: "eip155",
  chainId: 8453,
  kind: "stablecoin_lending",
  displayName: "Aave v3 (Base)",

  async buildDeposit({ wallet, asset, amount }) {
    if (!asset.contract) throw new Error("aave-v3 requires ERC-20 asset");
    return {
      kind: "evm-call",
      to: AaveV3Base.POOL as `0x${string}`,
      data: encodeFunctionData({
        abi: POOL_ABI,
        functionName: "supply",
        args: [
          asset.contract as `0x${string}`,
          amount,
          wallet.address as `0x${string}`,
          0,                          // referralCode — inactive on v3
        ],
      }),
      needsApproval: {
        token: asset.contract as `0x${string}`,
        spender: AaveV3Base.POOL as `0x${string}`,
        amount,
      },
    };
  },

  async buildWithdraw({ wallet, asset, amount }) {
    if (!asset.contract) throw new Error("aave-v3 requires ERC-20 asset");
    const rawAmount =
      amount === "MAX" ? (2n ** 256n - 1n) : amount;   // Aave sentinel for full exit
    return {
      kind: "evm-call",
      to: AaveV3Base.POOL as `0x${string}`,
      data: encodeFunctionData({
        abi: POOL_ABI,
        functionName: "withdraw",
        args: [
          asset.contract as `0x${string}`,
          rawAmount,
          wallet.address as `0x${string}`,
        ],
      }),
    };
  },

  async readPosition(walletAddress) {
    // aTokens are 1:1 rebasing — read aUSDC balanceOf, treat as USDC value.
    // Implementation hits public client via walletKit; omitted for brevity.
    return null;
  },
};
```

The Aave Ethereum / Arbitrum adapters reuse the same closure with
different `AaveV3Ethereum.POOL` / `AaveV3Arbitrum.POOL` from the
[`@bgd-labs/aave-address-book`][src-aave-addr-book] package.

[src-aave-addr-book]: https://www.npmjs.com/package/@bgd-labs/aave-address-book

### 7.8 Why this pattern earns its keep

- **Discipline already proven** for the dApp-bridge port and the
  wallet-kit port. Reviewers know the shape; new adapters are reviewed
  in one sitting.
- **Guardrails extend naturally.** `pnpm check:chains` becomes
  `pnpm check:chains && pnpm check:defi`; reviewers don't have to
  remember a new rule.
- **Future-proof for Solana / Sui DeFi.** Adding Jito, Marinade,
  Scallop, or any other protocol is one new adapter file each. Zero
  edits to `app/`.
- **Backend can leverage the same slug.** `OpportunityCache.protocolSlug`
  matches `DefiProtocolAdapter.slug`, so the agent's tool call can
  carry the slug it received from `/v1/strategies/opportunities`
  unchanged.

---

## 8. Risk scoring model — implementation

Implement the 5-dimension model from the research doc (§5) **on the
server**, not the device. Reasons:

- Scores depend on rolling 7d / 30d windows of off-chain data; mobile
  shouldn't poll DeFiLlama directly.
- Scores need to be consistent across users so the agent's reasoning
  ("score 87 = Conservative") matches across sessions.
- Cache invalidation lives next to the data sources.

### Service contract (`api/src/strategies/scoring/scoring.service.ts`)

```ts
interface DimensionResult {
  score: number;       // 0–100
  inputs: Record<string, number | string | boolean>;
  notes?: string;      // human-readable for debug; not user-facing
}

interface CompositeScore {
  score: number;       // 0–100, rounded
  tier: RiskTier;      // 80–100 conservative, 50–79 balanced, <50 aggressive
  dimensions: {
    protocolSafety:       DimensionResult; // weight 0.30
    yieldSustainability:  DimensionResult; // weight 0.25
    liquidityAndExit:     DimensionResult; // weight 0.20
    marketExposure:       DimensionResult; // weight 0.15
    chainAndBridge:       DimensionResult; // weight 0.10
  };
  computedAt: Date;
}

class StrategyScoringService {
  scoreOpportunity(input: ScoringInput): Promise<CompositeScore>;
}
```

### Inputs (all observable)

- DeFiLlama `/protocol/{slug}` — TVL, TVL trend, audits links, age.
- DeFiLlama `/pool/{poolId}` — apy mean / std-dev (30d window).
- DeFiLlama `/overview/fees/{slug}` — daily revenue vs emissions.
- DeFiLlama `/stablecoins` — peg deviation (depeg watch).
- Static config: known exploit history, audit firm tier ranking
  (curated in `protocolSafetyConfig.ts`).
- `chainConfig` (already known to the backend) — chain uptime tier,
  sequencer decentralisation flag.

### Worker schedule

| Job | Cadence | Source |
|---|---|---|
| `goal-deadline-watcher` | daily 00:30 UTC | `StrategyPosition.targetDate` |
| `defillama-poll` | every 4h | `/pools`, `/protocol/{slug}` |
| `score-opportunities` | after each poll | derived |
| `stablecoin-depeg-watcher` | every 5 min | `/stablecoins` |
| `rebalance-trigger` (per active user-strategy) | per user's interval setting, default daily 00:15 UTC | reads `UserStrategy` |

### Score persistence

`OpportunityCache` is the index served to the agent and to the
`/strategies/opportunities` endpoint. `ProtocolScoreCache` carries
slow-moving inputs (audit count, age) so the per-opportunity worker
doesn't re-hit DeFiLlama for every pool.

### Reference scores (calibration target)

From research §5 table — used as a smoke test the day we light up
scoring (live numbers will drift; treat as ±5 acceptance):

| Protocol | Strategy | Expected score | Tier |
|---|---|---|---|
| Aave v3 USDC | lending | 92 | conservative |
| Lido stETH | LST | 87 | conservative |
| Curve 3pool | LP | 82 | conservative |
| Yearn v3 USDC | vault | 74 | balanced |
| EigenLayer | restaking | 65 | balanced |
| Ethena sUSDe | delta-neutral | 52 | balanced |
| GMX v2 GLP | perp DEX LP | 41 | aggressive |

---

## 9. Data API integration — DeFiLlama / DeBank / Zerion

**MVP runs at $0/month using free tiers**, per the original research
doc's recommended combination (`takumipay-defi-strategies-research.md`
§9.4): "*DeFiLlama free + Zerion free tier covers live APY data and
basic position tracking to validate the feature at zero cost.*"

Three providers, each with a usable free allowance:

| Provider | Free allowance | Use in MVP |
|---|---|---|
| **DeFiLlama** | All public endpoints, unauthenticated | ✅ Opportunity discovery + scoring (worker-side polling) |
| **Zerion** | 1,000 requests/day | ✅ Portfolio summary card + cross-chain position rollup; WebSocket subscribe still works on free tier |
| **DeBank Cloud** | 1,000-credit free trial (one-time) | ✅ Dev / staging only; defer paid usage to Phase 2 |

For MVP **production load**, we layer three sources cheaply:

- **DeFiLlama (free, unauthenticated):** opportunity feed + scoring.
  Worker-side, fully cached. No per-user cost.
- **Zerion (free, 1k/day):** the "Your portfolio" summary card and
  a single-page DeFi position rollup. We aggressively cache (60 s
  TTL in Valkey) and use the WebSocket subscribe for push updates —
  the research notes this "reduces DeBank costs," and on the free
  tier it also keeps us under 1k req/day per active screen. For a
  user-base of a few thousand wallets that's plenty during MVP.
- **Direct contract reads via per-adapter `readPosition()`:** the
  authoritative source for *our own* DeFi positions (Aave aToken
  balance, Curve LP token balance, etc.). We never rely on Zerion's
  computed numbers for the deposit/withdraw flow itself — Zerion is
  the *summary* layer; the *trade-decision* layer reads on-chain
  through our walletKit `publicClient`.
- **DeBank (free trial credits):** dev/staging only. Burn the 1,000
  credits to pressure-test the integration before Phase 2 pays for
  it.

Every external HTTP call lives in `api/src/strategies/external/`. The
mobile app never talks to DeFiLlama / DeBank / Zerion directly. Two
reasons:

1. Keeps API keys out of the binary (CLAUDE.md,
   distribution-discipline). Mobile reads through `/v1/strategies/*`.
2. Lets the backend cache, rate-limit, and circuit-break one place.

Routing summary per provider — values cited from official docs, see
Appendix C for sources:

### 9.1 DeFiLlama (MVP)

- **Free base URL:** `https://api.llama.fi`
- **Yields base URL:** `https://yields.llama.fi`
- **Auth:** none on the free tier.
- **Pro tier (optional):** `https://pro-api.llama.fi/{API_KEY}` for
  higher rate limits. **NOT** required for MVP.

Endpoints we hit and our usage pattern (worker schedule in §8):

| Method · Path | Purpose | Cadence |
|---|---|---|
| `GET https://yields.llama.fi/pools` | List all yield pools (pool id, apy, tvl, chain, project, stablecoin flag). Primary opportunity discovery feed. | every 4h |
| `GET https://yields.llama.fi/chart/{poolId}` | Historical APY for a pool. Used for `apy7dAvg` + `apyStddev30d` in scoring. | on demand after a pool enters the candidate set |
| `GET https://api.llama.fi/protocol/{slug}` | Protocol-level TVL, history, audit links. Feeds `ProtocolScoreCache.safetyScore`. | every 4h for in-use protocols |
| `GET https://api.llama.fi/overview/fees/{slug}` | Daily revenue vs incentives. Drives yield-sustainability dimension. | every 4h |
| `GET https://api.llama.fi/stablecoins` | Per-stablecoin peg deviation. Depeg watcher input. | every 5 min |
| `GET https://api.llama.fi/v2/chains` | Per-chain TVL, deltas. Chain-risk dimension. | every 4h |

> **Critical reminder from the DeFiLlama docs:** "Do NOT use
> `pro-api.llama.fi` without an API key. Do NOT put API keys in
> `api.llama.fi` URLs." We enforce this in `defillama.client.ts` by
> hardcoding the base URL based on whether `DEFILLAMA_API_KEY` is
> present.

Cost: **$0/month** for MVP; **$300/month** Pro tier only if we ever
need historical depth beyond the free window.

### 9.2 Zerion (MVP — free tier)

- **Base URL:** `https://api.zerion.io/v1`
- **Auth:** `Authorization: Bearer <base64(API_KEY)>` per the
  developers.zerion.io reference.
- **Free tier:** 1,000 requests/day. **This is what we use for MVP.**
- **Growth tier:** $99/month, when MVP usage outgrows 1k/day.
- **Distinguishing feature:** WebSocket subscribe at
  `wss://api.zerion.io/v1/wallets/{addr}/subscribe` for push-based
  position updates — reduces our polling cost on the free tier.

Endpoints we use in MVP:

| Path | Purpose | MVP cadence |
|---|---|---|
| `GET /wallets/{addr}/portfolio` | Net worth breakdown by type (wallet, DeFi, staking, locked) | on screen open + 60 s in-Valkey cache |
| `GET /wallets/{addr}/positions` | Cross-chain DeFi positions (EVM + Solana) | on screen open + 60 s cache |
| `WS /wallets/{addr}/subscribe` | Push updates for the open screen | open while user is on `/strategies` |

> **Free-tier budget guard.** With aggressive caching (60 s TTL,
> screen-open trigger only), each user's day-1 cost is roughly 1
> `/portfolio` + 1 `/positions` per fresh screen + WS push (free).
> At 1k req/day the free tier supports ~500 daily-active users.
> When we cross that, flip on **Growth ($99/month)** — no code change
> beyond updating the rate limit in the cost-circuit-breaker.

Cross-checks against on-chain truth: every deposit / withdraw confirms
on-chain through `walletKit.publicClient` + per-adapter
`readPosition()` — we never rely on Zerion's computed numbers for
the *trade decision* itself. Zerion is the summary layer; the
adapter is the source-of-truth layer.

### 9.3 DeBank Cloud (dev free trial → Phase 2 paid)

- **Base URL:** `https://pro-openapi.debank.com/v1`
- **Auth:** `AccessKey: <key>` HTTP header. Key issued via
  `cloud.debank.com` after sign-up.
- **Rate limit:** 100 req/s on the Pro plan.
- **Pricing model:** "Units" — DeBank's per-call billing currency.
  Exact unit cost varies by endpoint; cost-tip from research § still
  applies (prefer `all_complex_protocol_list` over per-protocol
  calls).
- **Free trial:** 1,000 credits, one-time. **Use this in dev /
  staging** to pressure-test the integration before paying.

Endpoints we'll add when Phase 2 budget is approved:

| Path | Purpose |
|---|---|
| `GET /user/total_balance?id={addr}` | Top-of-screen total net worth (richer than Zerion for EVM) |
| `GET /user/all_token_list?id={addr}` | Token balances across all EVM chains |
| `GET /user/all_complex_protocol_list?id={addr}` | All DeFi positions; powers the Positions screen at scale |
| `GET /user/protocol?id={addr}&protocol_id={id}` | One-protocol position refresh after a deposit |
| `GET /user/history_list?id={addr}` | Parsed tx history with USD values — P&L grounding |
| `GET /user/token_authorized_list?id={addr}` | Approval audit (joins our existing approvals UI) |

Backend module: `api/src/strategies/external/debank.client.ts`. Wraps
each call with caching (Valkey, 60 s TTL — matches the research's
"~1 min refresh" guidance) and a per-day-per-strategy circuit
breaker (env `DEFI_DEBANK_DAILY_BUDGET_CENTS`, §22) because the
pricing model rewards keeping bills predictable.

### 9.4 Phasing & monthly cost — mirrors the research doc's table

| Phase | APIs used | Monthly cost |
|---|---|---|
| **MVP / validation** | DeFiLlama (free) + Zerion (free, 1k/day) + direct on-chain reads via adapters | **$0** |
| **Beta with real users** | DeFiLlama (free) + Zerion (free or Growth $99) + DeBank (credit bundle) | ~$50–200 |
| **Production** | DeFiLlama (free or Pro) + Zerion (Growth) + DeBank (credits) | ~$300–500 |

This matches the research doc's §9.4 "Recommended combination by
build phase" verbatim. No paid commitment is required to ship MVP.

---

## 10. Cross-chain handling — LI.FI (deferred to Phase 2)

The research positions LI.FI as the "asset movement layer." TakumiPay
itself is **chain-agnostic** by design (space-docking, §7) — the user
already holds wallets on EVM (Ethereum / Base / Arbitrum / …), Solana,
and Sui simultaneously. The question is **not** whether the app is
multi-chain (it is), it's whether *MVP DeFi flows need to **move
assets between chains*** before depositing.

We argue they don't, for MVP. Reasoning:

- The MVP adapter set is itself multi-chain (Aave v3 on Ethereum /
  Base / Arbitrum, Lido on Ethereum, Curve 3pool on Ethereum, plus
  Phase 2 additions on Solana). For any given user, the agent picks
  an opportunity *on a chain where the user already holds the right
  asset*, not the abstract "best yield anywhere" that would require a
  bridge step. The opportunity ranker (§8) takes the wallet's
  per-chain holdings as a filter input, so cross-chain candidates are
  excluded at MVP scope.
- The user's existing deposit flow (`app/deposit.tsx`) and Circle
  Gateway integration already let them land USDC on whichever
  supported chain they prefer — bridging-in is solved outside this
  feature.
- LI.FI integration meaningfully increases surface area (route
  caching, status polling, failure-fallback UI, slippage controls,
  per-bridge allowlisting). It's the right tool for a Phase-2
  problem, not an MVP problem.
- The walletKit's `sendUserOpWithUsdcPaymaster()` is already wired
  for the "approve + target call" batched UserOp on Base / Arbitrum —
  that's the gas-and-UX win that justifies LI.FI Composer in the
  research document, and we already have it via Circle Paymaster.

**When LI.FI becomes load-bearing (Phase 2 triggers):**

- User-strategy says "Any chain, best yield" and the best yield is on
  a chain different from where the user holds the asset.
- Emergency rebalance away from a depegged stablecoin that's only
  available on chain X to a safe asset on chain Y.
- Aggressive-tier opportunities concentrated on Arbitrum or other
  L2s a user mostly doesn't sit on.

### 10.1 Phase 2 plan (doc-grounded)

When we ship cross-chain rebalances:

- **Backend integration**, not mobile. New module
  `api/src/strategies/external/lifi.client.ts` wraps the LI.FI SDK
  ([`@lifi/sdk`][src-lifi-sdk]) on the server side. Mobile gets back
  a normalised `UnsignedCall[]` sequence, not a raw LI.FI route.
- **SDK init.** Single `createConfig({ integrator: "takumipay" })`
  call at app startup. The `integrator` string is the only mandatory
  config; LI.FI uses it for attribution and fee routing. An API key
  becomes useful at production volume — we'll add `LIFI_API_KEY` to
  `api/.env` when we have it (see §22), but it's not required to
  start.
- **Quote → route normalisation.** Use `getQuote({ fromChain, toChain,
  fromToken, toToken, fromAmount, fromAddress })`. Translate the
  returned route steps into our `UnsignedCall` discriminated union so
  the mobile executor pipeline doesn't have to learn LI.FI's tx
  shape.
- **Status tracking.** LI.FI exposes a `/status` endpoint per route
  step. The backend polls it; mobile reads progress via existing
  TanStack Query patterns rather than a new push channel.
- **New mobile executor:** `defi_cross_chain_deposit`. Receives the
  pre-built sequence and submits each step through
  `walletKit.sendContractTransaction()` (or the paymaster path on
  Base / Arbitrum). Each step gets its own `PendingTxCard` so a
  partial failure is observable.
- **Hard rule.** LI.FI is *strictly* a router from our perspective —
  it never sees a private key, never picks the protocol, never makes
  the deposit step itself. The deposit is always our adapter's
  `buildDeposit()`. The risk-scoring "chain & bridge" dimension (§8)
  penalises routes that go through unaudited bridges; we keep an
  allowlist of LI.FI's bridge providers we accept.

[src-lifi-sdk]: https://docs.li.fi/integrate-li.fi-js-sdk/install-li.fi-sdk

---

## 11. Agent executor tools

### Mobile-side registrations (`services/agent-executors/defi.ts`)

Add a new `DEFI_EXECUTORS` map and spread into `EXECUTORS` in
`services/agent-executors/index.ts:50`. Tool names must round-trip
exactly with the server registry (`EXPECTED_MOBILE_TOOLS` parity test,
`agent-executors/index.ts:70+`).

Tools (initial set). **"UI" column** is the structured-UI treatment
per §14.5 — either a custom card name (with-UI tool, registered in
`StructuredUI/registry.ts`) or "fallback" (no-UI tool, renders via
`ToolCallDisplay.tsx`).

| Tool name | Category | UI | Description | Approval gate |
|---|---|---|---|---|
| `defi_list_opportunities` | read | `OpportunityListCard` (NEW, interactive) | Calls `/v1/strategies/opportunities`. Returns scored, tier-filtered list. Accepts **transient parameters** (`tier`, `asset_symbol`, `chain_id`, `liquidity_profile`, `amount_usd`) so the agent can call it for first-touch users who have no `UserStrategy` yet (§14.6). | none (read) |
| `defi_list_positions` | read | `PositionListCard` (NEW, interactive) | Calls `/v1/strategies/positions` for the active wallet. | none (read) |
| `defi_get_config` | read | fallback | Returns the user's current `UserStrategy` config. | none |
| `defi_simulate_deposit` | simulate | fallback | Builds tx via adapter, runs `estimate_gas`. Returns gas + slippage + safety summary. | none (simulate) |
| `defi_deposit` | write | unified `PendingTxCard` (reused) | Executes a single-step deposit into the adapter selected by `{protocolSlug, chainId, asset, amount}`. | grant + threshold |
| `defi_withdraw` | write | unified `PendingTxCard` (reused) | Withdraws (partial or full) from a position. | grant + threshold |
| `defi_claim` | write | unified `PendingTxCard` (reused) | Claims accrued rewards on protocols whose adapter implements the optional `buildClaim?` capability (Curve, Yearn, GMX). See §21.3. | grant + threshold |
| `defi_rebalance` | write | `RebalancePreviewCard` (NEW) + two threaded `PendingTxCard`s | Two-step orchestration: withdraw from A + deposit to B (sequential, each requires its own write gate). | grant + threshold (per-step) |

> **Scoping decision:** `defi_rebalance` is one *logical* agent
> operation but two *signed* user actions. We do NOT introduce a
> single multi-step signing primitive in v1 — keeping the two writes
> separate means each gets its own threshold check and its own
> `PendingTxCard`. If the second tx fails, the first tx still settled
> as a regular withdraw, no recovery code needed.

### Server-side registration (`agent-api/src/tools/defi/defiToolRegistry.ts`)

Each tool added to the `TOOL_REGISTRY` with `executor: "mobile"`,
`category: "defi"`, and a Zod input schema. Server provides the
permissive `properties: {}` stub for the LLM (per existing
agent-protocol convention) but enforces the schema on the way back
through `executorResult` validation.

### Tool input schemas (Zod, mobile-shipped, server-aware)

```ts
// services/defi/tools/schemas.ts

export const defiListOpportunitiesInputSchema = z.object({
  // All optional. Missing fields default to the JWT-bound wallet's
  // UserStrategy values if it exists, otherwise to safe defaults
  // (tier: "conservative", liquidity_profile: "instant").
  tier: z.enum(["conservative","balanced","aggressive"]).optional(),
  asset_symbol: z.string().optional(),
  chain_id: z.union([z.number(), z.string()]).optional(),
  liquidity_profile: z.enum(["instant","queued_short","queued_long"]).optional(),
  amount_usd: z.number().optional(),        // filters opportunities by min deposit
});

export const defiDepositInputSchema = z.object({
  protocol_slug: z.string(),                // "aave-v3-base"
  chain_id: z.union([z.number(), z.string()]),
  asset_symbol: z.string(),                 // "USDC"
  asset_contract: z.string().optional(),    // lowercased
  amount_raw: z.string(),                   // decimal string for bigint
  // Optional override hints from the agent's reasoning:
  expected_apy: z.number().optional(),
  expected_tier: z.enum(["conservative","balanced","aggressive"]).optional(),
  // §14.6 — goal tracking. The LLM extracts these from the user's
  // natural-language prompt and passes them through; the mobile
  // executor stores them on the resulting StrategyPosition row.
  goal: z.string().max(120).optional(),       // free-text label, e.g. "Laptop purchase"
  target_date: z.string().datetime().optional(), // ISO-8601 UTC, e.g. "2026-08-15T00:00:00Z"
});
```

The executor verifies the agent's claimed `expected_apy` against the
backend's `OpportunityCache` (±5% drift) — if mismatched, prompt the
user with the *real* values before signing. This is a guardrail
against an LLM hallucinating a bogus APY into a deposit.

---

## 12. `agent-api/` changes

Small, surgical: add tool registrations, no protocol-aware logic on
the server (the LLM does the reasoning, the mobile executor does the
work).

1. **Tool registry:** add `defi_*` entries to
   `agent-api/src/tools/registry.ts` (or wherever current registry
   lives) with `executor: "mobile"`. Update the parity hardcoded list
   on the mobile side (`services/agent-executors/index.ts:70`).
2. **System prompt fragment:** add a section that:
   - Explains the tier system in 5 lines.
   - Tells the LLM to always call `defi_list_opportunities` before
     proposing a deposit, and to read back the *exact* APY and score
     from the response rather than estimating.
   - Forbids the LLM from proposing protocols outside the user's
     whitelist or above the user's tier.
3. **No new persistence in `agent-api/`** — `UserStrategy` lives in
   `api/`'s database. **All strategy reads/writes are
   `executor: "mobile"`** (consistent with the existing protocol):
   the agent emits `tool_pending`, mobile calls `/v1/strategies/*`
   with its per-wallet JWT, mobile posts the result back via
   `POST /chat/:id/respond`. We deliberately do **not** introduce an
   `agent-api/ ↔ api/` edge — see §5.2 "three non-edges worth
   calling out" for the reasoning (it would force the agent to
   forge a per-wallet JWT or break the JWT-binding rule).

**Note on `wallet_context`:** the agent must propose strategies on
the same `wallet_context.wallet_address` it received with the chat
session. The `mobile-app/CLAUDE.md` rule "payment intent reads must
use the paying wallet's JWT" generalises here: **strategy operations
must use the strategy-owning wallet's JWT.** Audit `useStrategies`
hooks to make sure they bind to the wallet's per-wallet token, not
the active wallet's.

---

## 13. `api/` (backend) changes

### Module surface

`api/src/strategies/strategies.controller.ts` — JWT-guarded
endpoints, all keyed by the JWT's wallet address (no walletAddress
in the path):

```
GET    /v1/strategies                       # current user strategy or null
POST   /v1/strategies                       # create / overwrite config
PATCH  /v1/strategies                       # partial update (pause/resume, tier change, …)
DELETE /v1/strategies                       # disable

GET    /v1/strategies/opportunities         # ?tier=…&chainId=…&assetSymbol=…
GET    /v1/strategies/opportunities/:slug   # one opportunity + full score breakdown

GET    /v1/strategies/positions             # all active + closed positions for the JWT's wallet
GET    /v1/strategies/positions/:id

POST   /v1/strategies/positions/:id/refresh # force on-chain re-read (rate-limited)
```

### Worker wiring (BullMQ — already in use for payouts)

- `defillama-poll` queue, every 4h: pulls `/pools`, upserts
  `OpportunityCache` rows.
- `score-opportunities` queue, fan-out after each poll: scores
  pending rows.
- `stablecoin-depeg-watcher`, every 5 min: emits a depeg event
  (NATS) → mobile push notification + rebalance trigger.
- `rebalance-trigger`, per `UserStrategy`, scheduled per user's
  `rebalanceTrigger`: writes a `RebalanceCandidate` row and
  optionally pushes a notification "Tap to review."
- `goal-deadline-watcher`, daily at 00:30 UTC: scans
  `StrategyPosition` rows where `targetDate IS NOT NULL` and
  `status = "active"`. Three branches per row:
  - `targetDate - now ≤ 7 days` and no `defi.goal.approaching`
    event emitted in the last 24h → emit it; push notification
    *"Your {goal} target is in N days — review your position?"*
  - `targetDate ≤ now` and no `defi.goal.reached` event yet →
    emit it; push notification *"Your {goal} fund is ready —
    withdraw now?"* with a deeplink to `/strategies` that opens
    the position card with the Withdraw CTA pre-focused.
  - All other rows: no-op.
  **Never** triggers a write tx — the worker only *nudges*. Every
  withdrawal still goes through `defi_withdraw` with a user
  signature.

### External-client modules (free-tier-aware)

- `external/defillama.client.ts` — unauthenticated by default
  (`api.llama.fi` + `yields.llama.fi`); switches to
  `pro-api.llama.fi/<KEY>` only when `DEFILLAMA_API_KEY` is set.
- `external/zerion.client.ts` — Bearer-auth client for the portfolio
  summary card and cross-chain position rollup. Tracks request count
  in Valkey under a 24h sliding window keyed by date; short-circuits
  to cached data when `DEFI_ZERION_DAILY_BUDGET_REQUESTS` is hit so
  we never exceed the 1k/day free-tier limit.
- `external/debank.client.ts` (Phase 2 / dev) — `AccessKey`-auth
  client gated by `DEFI_DEBANK_DAILY_BUDGET_CENTS`. Off by default
  in MVP production; on in staging using the 1k-credit free trial.
- `external/lifi.client.ts` (Phase 2) — server-side `@lifi/sdk`
  wrapper; never reached from mobile.

### Authorisation

All `/strategies/*` routes use the **existing** `JwtAuthGuard`. JWT
already carries the user's primary wallet (SIWE). For multi-wallet
users (per `useWallet.helpers.ts`), the JWT must be the *target
wallet's* JWT — the mobile client already has a per-wallet token
map; route helpers (e.g. `paymentIntentInvalidator` pattern) show how
to look it up.

### Event hooks

Reuse the existing `TransactionHistory` pipeline to discover the
deposit landing on-chain (it watches the wallet's outgoing tx
already). When the txHash from a `defi_deposit` matches a recorded
hash, the strategies service backfills `StrategyPosition.openTxHash`
and `currentAmountUsd`. No new indexer needed for MVP.

---

## 14. UI flows

### Entry point

Add a tile to the home screen under Takumi Agent's quick-prompts and
a dedicated tab `/strategies` accessible from the agent menu.

### First-run onboarding (`app/strategies/onboarding.tsx`)

The full onboarding sheet exists for users who enter via the
`/strategies` tab (browse opportunities first, then deposit). For
users who start in the **Takumi Agent chat** ("I have 800 USDC,
I want to use it later to buy a laptop after 3 months"), §14.6
covers a zero-friction one-tap path that creates the `UserStrategy`
*at deposit time*.

1. **Tier picker** (RiskTierPicker) — Conservative / Balanced /
   Aggressive, with the research doc's tier descriptions and
   target-APY ranges. Default: Conservative.
2. **Asset preference** — Stablecoins only / ETH + LST / Multi-asset.
3. **Liquidity preference** — Instant / 7 days / 30+ days.
4. **Chain preference** — Any (recommended) / Specific chains
   (multi-select against `useBlockchains` data).
5. **Allocation %** — 10 / 25 / 50 / Custom slider (default 10%).
6. **Rebalance trigger** — Weekly (default) / Monthly / Yield-drop
   threshold (advanced).
7. **Protocol whitelist** (optional, advanced) — pick from the tier's
   adapter list; empty means "use the curated default" (§21.2).
8. **Notifications** — Every action / Daily digest / Alerts only.
9. **Approval grant** — show the existing `ApprovalSheet` with one
   tailored option: "Allow Takumi Agent to operate DeFi strategies
   for 30 days" → emits a `scope: { kind: "capability", key: "defi_write" }`
   grant with `lifetime: { type: "timed", expires_at: now+30d }`.

### Main `/strategies` screen

Two stacked sections, both query-backed:

- **Your positions** — `useStrategyPositions()`. Card per position:
  protocol + chain + asset + amount + current value + 24h delta +
  exit CTA.
- **Recommended opportunities** — `useStrategyOpportunities()`,
  filtered by the user's tier + whitelist. Shown with a `RiskBadge`
  (Conservative / Balanced / Aggressive) and the live score. Tapping
  opens `opportunity-detail.tsx` with the full 5-dimension breakdown.

### Per-action UX (write path)

- All deposits / withdrawals go through the existing
  `PreviewCard` → `ApprovalSheet` → unified `PendingTxCard` pipeline
  (`StructuredUI/cards/PendingTxCard.tsx` — the registry-aware one,
  not the legacy single-purpose `PendingTxCard/PendingTxCard.tsx`).
- The capability grant we issue at onboarding skips the approval
  sheet for below-threshold operations and shows it for
  over-threshold ones (existing behaviour from `permissionGrantStore`
  + `transferThresholdStore`).
- The agent's strategy *write* proposal in chat renders the same
  `PendingTxCard` it does for any other write tool — we just
  register the new tool names into `toolComponents` (§14.5). The
  *read* tools (`defi_list_opportunities`, `defi_list_positions`)
  need new cards — see §14.5.

### 14.5 Tool UI in chat — `toolComponents` registrations

Two flavors of tool already coexist in the Takumi Agent today
(`components/home/TakumiAgent/StructuredUI/registry.ts:33`):

| Flavor | Selection rule | What renders | Examples |
|---|---|---|---|
| **With UI (structured-UI card)** | tool name is a key in `toolComponents` | A custom React component receiving `ToolComponentProps<Input, Output>` (`StructuredUI/types.ts`). Has live + historical branches. Can optionally call `addToolResult` to feed user choices back to the LLM. | `send_native_token` → `PendingTxCard`; `get_wallet_tokens` → `BalancesCard`; `swap_quote` → `SwapQuoteCard`; `approve_spending` → `SpendingApprovalCard` |
| **Without UI (fallback)** | tool name is NOT in `toolComponents` | The generic `ToolCallDisplay.tsx` — a wrench-icon row with status pill and the tool name. The LLM still sees the tool's `output` and can compose a natural-language reply. | `get_supported_chains`, `read_contract`, `estimate_gas`, `get_redemption_catalog` (when bypassing the card), … |

Both render paths obey the rules from `docs/generative-ui-spec.md`
(§2): rendering is a pure function of `message.parts`; live and
historical render branches are gated by a `mode: "live" | "historical"`
prop; interactive decisions made in live mode persist into the
tool's `output` so reload-from-history shows the receipt.

#### 14.5.1 DeFi tool → UI map

| Tool | Flavor | Card / fallback | Why |
|---|---|---|---|
| `defi_list_opportunities` | **WITH UI** | **`OpportunityListCard`** (NEW) | Read with structured payload + actionable rows; "tap to deposit" is the natural next step |
| `defi_list_positions` | **WITH UI** | **`PositionListCard`** (NEW) | Same: structured rows with current value, 24h delta, exit CTA |
| `defi_get_config` | no UI | `ToolCallDisplay` fallback | Pure-read used for LLM reasoning; result is a small JSON. The LLM tells the user about it in text. |
| `defi_simulate_deposit` | no UI | `ToolCallDisplay` fallback | Returns gas / slippage / safety summary as JSON. The LLM composes the human-readable preview text. Avoids a second card for what is effectively a dry-run. |
| `defi_deposit` | **WITH UI** | Reuse **unified `PendingTxCard`** | Same lifecycle as every other write: input-available preview + countdown + approval, output-available receipt + explorer link. Zero new code — just add the tool name to the map. |
| `defi_withdraw` | **WITH UI** | Reuse **unified `PendingTxCard`** | Same as `defi_deposit`. |
| `defi_rebalance` | **WITH UI** | **`RebalancePreviewCard`** (NEW) for the proposal step, then **`PendingTxCard`** for each of the two writes | Rebalance is two sequential writes (withdraw + deposit). The preview card shows the from→to diff, APY delta, and net fees as one block; user approves once and the two `PendingTxCard`s thread underneath. |

The corresponding registry diff:

```ts
// components/home/TakumiAgent/StructuredUI/registry.ts (additions)
import OpportunityListCard from "./cards/OpportunityListCard";
import PositionListCard    from "./cards/PositionListCard";
import RebalancePreviewCard from "./cards/RebalancePreviewCard";

export const toolComponents = {
  // ── existing entries (send_native_token, transfer_erc20, …) ──

  // DeFi reads
  defi_list_opportunities: OpportunityListCard,
  defi_list_positions:     PositionListCard,

  // DeFi writes — reuse the unified write card
  defi_deposit:  PendingTxCard,
  defi_withdraw: PendingTxCard,

  // Rebalance — custom preview, then the two writes thread underneath as
  // their own PendingTxCard entries (one per signed step).
  defi_rebalance: RebalancePreviewCard,
};
```

> **Tools deliberately left in the no-UI fallback.** `defi_get_config`
> and `defi_simulate_deposit` are *reasoning aids* for the LLM rather
> than user-facing artifacts. Giving them a card would clutter the
> chat for no UX gain. If usage data later shows the user wants to
> see the simulation result directly, promote `defi_simulate_deposit`
> by adding it to `toolComponents` — additive change, no protocol
> rework.

#### 14.5.2 `OpportunityListCard` — input / output / interaction

Props (`ToolComponentProps<Input, Output>`):

```ts
type OpportunityListInput = {
  tier?: "conservative" | "balanced" | "aggressive";
  asset_symbol?: string;
  chain_id?: number | string;
};

type OpportunityListOutput = {
  status: "ok" | "error";
  opportunities: Array<{
    slug: string;            // matches DefiProtocolAdapter.slug
    display_name: string;    // e.g. "Aave v3 on Base"
    asset_symbol: string;
    chain_id: number | string;
    apy: number;
    apy_7d_avg: number;
    score: number;           // 0–100
    tier: "conservative" | "balanced" | "aggressive";
    liquidity_profile: "instant" | "queued_short" | "queued_long";
  }>;
  // Decision the user took inside the card. Persists into output so
  // the historical render shows the user's choice.
  user_selection?: {
    selected_slug: string;
    selected_amount_raw?: string;   // optional — user can pick amount in-card
  };
  error?: string;
};
```

Live-mode behaviour:

- Render a sorted list (score-desc) of cards, each showing protocol
  name, chain pill, APY (live), risk-badge tier, score number, and
  a "Use this" affordance.
- Tapping "Use this" opens an amount sheet (prefilled with the user's
  `allocationPct` against the wallet's `assetSymbol` balance) →
  calls `addToolResult({ ...output, user_selection: { selected_slug, selected_amount_raw } })`.
- The LLM sees the updated tool result and composes the next turn
  (typically a `defi_deposit` proposal pre-filled with the user's
  picks).

Historical-mode behaviour:

- Render exactly the same list, but with the user-selected row
  highlighted ("You chose Aave v3 on Base — 500 USDC"). No live
  APY refresh, no interactive affordances. Pure receipt.

#### 14.5.3 `PositionListCard` — input / output / interaction

```ts
type PositionListOutput = {
  status: "ok" | "error";
  positions: Array<{
    id: string;
    protocol_slug: string;
    display_name: string;
    chain_id: number | string;
    asset_symbol: string;
    amount_at_deposit_usd: number;
    current_amount_usd: number;
    pnl_usd: number;                // diff
    pnl_pct: number;
    opened_at: number;              // unix ms
    // §14.6 goal tracking. Both optional. When present the card
    // renders a secondary line under the protocol name:
    //   "Laptop fund · 87 days left"
    //   "Laptop fund · target reached" (when targetDate <= now)
    goal?: string;
    target_date?: number;           // unix ms
  }>;
  user_action?: {
    selected_position_id: string;
    action: "withdraw" | "rebalance" | "edit_goal";
  };
  error?: string;
};
```

Interactive: tap "Withdraw" or "Rebalance" → `addToolResult` with
the user's choice → LLM follows up with `defi_withdraw` or
`defi_rebalance` pre-filled. Tap the goal-line "Edit" affordance
(only visible when `goal` is set) → `action: "edit_goal"` →
opens an in-card editor for the goal label and target date; the
result writes through `PATCH /v1/strategies/positions/:id` and
does NOT require a chain transaction.

#### 14.5.4 `RebalancePreviewCard` — input / output / interaction

```ts
type RebalancePreviewInput = {
  from: { protocol_slug: string; chain_id: number | string; asset_symbol: string; amount_raw: string };
  to:   { protocol_slug: string; chain_id: number | string; asset_symbol: string; min_amount_raw: string };
  reason: "yield_improvement" | "depeg_emergency" | "user_initiated";
  estimated: { apy_delta_bps: number; total_fee_usd: number; route_steps: number };
};

type RebalancePreviewOutput = {
  status: "ok" | "rejected" | "error";
  user_decision: "approved" | "rejected";
  // Each leg's tx_hash is reported by the threaded PendingTxCards,
  // not by this card. This card only owns the approval step.
};
```

Live behaviour:

- Top: from-position row (faded) → arrow → to-position row (bold)
- Middle: APY delta badge + total fee + "X steps" pill
- Bottom: Approve / Reject buttons; Approve calls
  `addToolResult({ status: "ok", user_decision: "approved" })`. The
  executor then fires the two writes sequentially, each rendering
  its own `PendingTxCard`.
- On Reject: persist `user_decision: "rejected"` so the historical
  view shows "You declined this rebalance."

Historical behaviour: frozen card showing the approved/declined
state and the timestamp. Tx hashes of the executed legs are not
duplicated here — they live under the trailing `PendingTxCard`s.

#### 14.5.5 Card location + boot

- New files in `components/home/TakumiAgent/StructuredUI/cards/`:
  - `OpportunityListCard.tsx`
  - `PositionListCard.tsx`
  - `RebalancePreviewCard.tsx`
- Registered in `StructuredUI/registry.ts` (additions shown in
  §14.5.1).
- No new module-level boot step — the registry is imported at
  `MessageContent.tsx` load time (already wired).

#### 14.5.6 Why the split (with-UI vs no-UI)

Mirrors the existing rationale (`generative-ui-spec.md` §2):
- Tools that produce *user-visible content* (positions, opportunities,
  tx receipts) get a card.
- Tools that produce *LLM-reasoning content* (config dumps, gas
  simulations, internal lookups) stay in the fallback — the LLM
  reads the JSON and tells the user about it in plain language.

The DeFi tools split cleanly along that line. We add three new cards
and reuse the existing unified `PendingTxCard` for writes — net new
custom UI: three card components and three registry entries.

### 14.6 Inline mini-onboarding (zero-friction first-touch)

Goal: a user can say *"I have 800 USDC, I want to use it later to
buy a laptop after 3 months"* and reach a signed deposit without
the 9-step onboarding sheet (§14 First-run onboarding) interrupting
mid-conversation. The full onboarding sheet stays — it just stops
being a *gate*. It becomes an option for users who want to set
defaults up-front.

The mechanism has three pieces.

#### 14.6.1 LLM intent extraction → transient parameters

When the user phrases a request like the above, the LLM extracts:

| Extracted | From | Maps to |
|---|---|---|
| `tier: "conservative"` | "use it later to buy a laptop" implies principal protection | `defi_list_opportunities.tier` |
| `asset_symbol: "USDC"` | explicit | `defi_list_opportunities.asset_symbol` |
| `amount_usd: 800` | explicit | `defi_list_opportunities.amount_usd` |
| `liquidity_profile: "instant"` | "after 3 months" → must be redeemable on or before day 90 → "instant" or "queued_short" | `defi_list_opportunities.liquidity_profile` |
| `goal: "Laptop purchase"` | explicit | `defi_deposit.goal` |
| `target_date: <now + 90d>` | "after 3 months" | `defi_deposit.target_date` |

System-prompt fragment (extends §12) teaches the LLM to extract
these and pass them through verbatim. **No new tool** — the same
`defi_list_opportunities` and `defi_deposit` accept the optional
fields per the schemas in §11.

#### 14.6.2 First-touch path — no `UserStrategy` row required

When mobile sees a `defi_list_opportunities` call and the JWT-bound
wallet has **no `UserStrategy` row**, the executor:

1. Skips the usual "look up `UserStrategy.tier`" step.
2. Calls `/v1/strategies/opportunities` with the transient
   parameters from the LLM (defaults: `tier=conservative`,
   `liquidity_profile=instant`).
3. Backend returns the curated-Conservative-whitelist list filtered
   by asset + chain + liquidity.
4. `OpportunityListCard` renders normally; user picks an option.

No friction, no detour through `/strategies/onboarding`.

#### 14.6.3 Bootstrap-on-first-deposit

The first `defi_deposit` for a wallet bundles three actions into
one user-visible approval step:

1. Create the `UserStrategy` row from the parameters used (tier,
   asset preference, liquidity preference, allocation %, chain
   preference). Curated whitelist (§21.2) is implicit; empty
   `protocolWhitelist` + `allowAllInTier=false`.
2. Issue the 30-day `defi_write` grant via `permissionGrantStore`
   (same shape as the §14 onboarding step 9).
3. Submit the deposit.

UI: the **PendingTxCard's input-available branch** (the preview)
renders an extra collapsible block titled *"Activate DeFi
Strategies for this wallet"* showing the inferred tier + liquidity
preference + grant duration, with a single primary CTA
"Confirm deposit + activate." Tapping it confirms all three.
A secondary affordance "Customize tier / settings" links out to
the full `/strategies/onboarding` sheet if the user wants to
override before signing — they can come back to the chat after.

**No new screens.** The block lives inside the existing
`PendingTxCard` preview state, gated by a presence check:
`if (no UserStrategy exists for this wallet)`. After the first
deposit completes, subsequent deposits skip this block entirely —
the `UserStrategy` is already there.

#### 14.6.4 Goal annotation at deposit time

When `defi_deposit` is called with `goal` and/or `target_date`, the
mobile executor:

1. Submits the on-chain deposit through the usual path.
2. On success, writes `StrategyPosition.goal` and
   `StrategyPosition.targetDate` via `POST /v1/strategies/positions`
   (or lets the backend backfill from the `tool_executed` payload
   — same path the existing `openTxHash` backfill uses).

The `PositionListCard` (§14.5.3) renders the countdown line. The
`goal-deadline-watcher` worker (§13 worker list, §18) sends a
single push notification at `targetDate - 7d` and another at
`targetDate`. Both deeplink into `/strategies` with the relevant
position card pre-focused.

#### 14.6.5 What this preserves

- **Safety envelope unchanged.** Tier ceiling (§15.7), whitelist
  enforcement (§15.8), threshold resolution (§15.3), JWT binding
  (§15.4), dApp-bridge isolation (§15.5) — all still gate the
  signed action exactly the same way.
- **Onboarding sheet untouched.** Users who tap into `/strategies`
  from the home tab still see the 9-step sheet. The inline path is
  a *parallel* entry point, not a replacement.
- **`allowAllInTier` not exposed at first-touch.** The inline
  path always treats `protocolWhitelist=[]` as "use the curated
  default" — the opt-out toggle is only reachable from the full
  onboarding sheet, by design.
- **Human-in-the-loop intact.** Every signed step still requires
  the user to approve in the device. The bundling is in the
  *grant* + *create* + *deposit* sequence, not in the signing
  itself.

#### 14.6.6 What this does NOT do

- It does not auto-withdraw at `target_date`. The worker only
  *nudges*; the user must come back to the agent (or tap the
  notification deeplink) and approve a `defi_withdraw`.
- It does not project a goal across multiple positions. One
  position = one goal. If the user wants to split $800 across two
  protocols, that's two `defi_deposit` calls each with the same
  goal label (a follow-up: a `goal_id` foreign key would let two
  positions share one goal — out of scope for this iteration).
- It does not enforce the goal's solvency (i.e., we don't refuse
  to let a user spend the laptop fund on something else). The
  goal is a *label*, not a hold. Withdrawal is always allowed.

---

## 15. Permission, threshold, JWT, isolation rules

This section is the load-bearing part of the safety story. Treat
every rule below as a regression test target.

1. **Grant scope.** DeFi tools register under a new capability key
   `defi_write` (writes) and a read-only `defi_read` (reads). Users
   can grant at any of the three scopes (`tool` / `capability` /
   `global`); UI defaults to capability-level so a single approval
   covers all DeFi write tools.
2. **Grant lifetime defaults.** Onboarding grant is `timed` (30 days
   default; user picks). Per-action approvals stay at `once`.
3. **Threshold extension.** Extend `TransferThresholds` (do **not**
   create a parallel store) with:
   ```ts
   defi_per_action_usd: number;     // default 0 = always ask
   defi_per_day_usd: number;        // default 0 = always ask
   defi_overrides: Record<`${chainId}:${protocolSlug}`, number>;
   ```
   The day-window rolls 24h from device clock; persisted as a small
   ledger of `{ at: ms, usd: number }` entries trimmed by age. New
   helper `resolveDefiThreshold(action, usd, chainId, protocolSlug)`
   returns `{ allowed: boolean, source }` mirroring the existing
   `ResolvedThreshold` shape (`transferThresholdStore.ts:88-91`).
4. **JWT binding (CLAUDE.md rule, generalised).** Strategy reads and
   writes must use the **strategy-owning wallet's JWT** — same rule
   as payment intents. Add `hooks/useStrategyJwtBinder.ts` modelled
   on `hooks/usePaymentIntentInvalidator.ts`.
5. **dApp-bridge-style isolation.** When the agent proposes a
   strategy action while the user has multiple wallets, the proposal
   carries `intent.wallet` (the wallet the agent was given in
   `wallet_context`). The PreviewCard / ApprovalSheet / Signer
   MUST render and sign with `intent.wallet`, never with
   `activeWallet`. This is the same bug class fixed in commit
   `4828e91`.
6. **Mobile-side input revalidation.** Every executor re-checks the
   `OpportunityCache` value the LLM cited (`expected_apy`, `tier`).
   ±5% drift is accepted silently; >5% drift forces a banner in the
   preview ("APY now 4.2% (was 7.1% when proposed)").
7. **Tier ceiling enforcement.** `defi_deposit` rejects when
   `OpportunityCache.tier` exceeds the user's `UserStrategy.tier`
   (e.g. agent proposes Balanced opportunity for a Conservative user).
   Error code: `tier_exceeds_user_policy`.
8. **Whitelist enforcement.** `defi_deposit` rejects with
   `protocol_not_in_whitelist` when `protocol_slug` is outside the
   user's whitelist (if set).
9. **Pause kill-switch.** `UserStrategy.pausedAt` blocks every
   `defi_*` write tool. Triggered by the user from
   `/strategies/settings`, or automatically by the depeg watcher
   (Phase 2).
10. **Audit log.** Every DeFi write (success or failure) writes a
    row to the existing `AdminAuditLog` Timescale hypertable, scoped
    to the user. Lets us reconstruct disputes.

---

## 16. User-facing error rule application

Apply the existing rule (`mobile-app/CLAUDE.md` → "User-facing errors")
verbatim. Concretely:

- New `services/defi/errors/defiErrors.ts` mirrors
  `services/errors/paymentErrors.ts`:
  ```ts
  export type DefiErrorCode =
    | "insufficient_funds"
    | "tier_exceeds_user_policy"
    | "protocol_not_in_whitelist"
    | "below_min_deposit"
    | "above_max_deposit"
    | "approval_required"
    | "approval_failed"
    | "deposit_failed"
    | "withdraw_failed"
    | "rebalance_failed"
    | "apy_drift_too_high"
    | "strategy_paused"
    | "network_error"
    | "unknown";

  export function classifyDefiError(err: unknown): DefiErrorCode;
  ```
- A new `<DefiError code={...}/>` component owns user-facing copy,
  gated behind `__DEV__` for any raw detail (mirrors
  `PaymentError`).
- Server endpoints (`api/`) throw `Error("defi_<short_code>")`, never
  embed external bodies. Raw bodies log to backend telemetry. The
  mobile API wrapper (`api/endpoints/strategies.ts`) translates the
  short code into a `DefiErrorCode` for the UI.
- The agent's `tool_executed` payload reports the same
  `DefiErrorCode` in `error`, so the LLM can compose appropriate
  follow-up text without ever seeing a stack trace.

---

## 17. Multi-chain phasing

Match the existing chain-extension discipline: EVM first where
protocol coverage is richest, then Solana via the same docking ports.

| Phase | Chains | Protocols |
|---|---|---|
| **MVP** | Ethereum, Base, Arbitrum | Aave v3 (USDC lending) · Lido (stETH liquid staking) · Curve 3pool (stable LP) |
| **Phase 2** | + Solana | + Morpho (EVM) · + Jito (SOL liquid staking) · + Maple syrupUSDC (RWA, Solana-native) · + LI.FI cross-chain |
| **Phase 3** | All current | + Yearn v3 (Balanced — vault) · + EigenLayer (Balanced — restaking) · + Ethena sUSDe (Balanced — delta-neutral) · + GMX v2 GLP (Aggressive — perp DEX LP) · + Hyperliquid LP (Aggressive — perp DEX LP) |

Each phase adds adapter files only; no spec-level refactor needed
between phases — the registry + tool surface absorbs them. Sui DeFi
isn't on this table; if/when Sui-native protocols become attractive,
they slot in as additional `DefiProtocolAdapter` rows the same way.

---

## 18. Rebalance & monitoring

### Trigger evaluation (server-side, per user)

```
for each active UserStrategy:
  if pausedAt: skip
  candidates = OpportunityCache.filter(tier ≤ user.tier, in user.whitelist, in user.chainPref)
  for each active position p:
    bestForP = candidates.where(assetSymbol == p.assetSymbol).orderByDesc(apy).first()
    if bestForP.apy - currentApy(p) > 1.5%:
      writeRebalanceCandidate(p → bestForP)
  emit notification per user.notificationLevel
```

### Execution

The agent never auto-executes a rebalance in v1 — it **proposes**
one to the user. The user accepts in chat → `defi_rebalance` tool
fires → two sequential signed writes (withdraw, then deposit).

This is deliberate: human-in-the-loop is the contract. Auto-approval
of *below-threshold* operations (per `defi_per_action_usd`,
`defi_per_day_usd`) is supported and skips the approval sheet — but
the device still signs each step locally. Truly device-less autonomy
is explicitly out of scope (§1, §2).

### Monitoring instruments

- `OpportunityCache` write throughput (workers SLO).
- 5-min depeg watcher lag (must be < 60 s p95).
- Tool-call refusal rate by `DefiErrorCode` (signals UX gaps).
- Per-tier average position age (validates the liquidity-preference
  filter).

---

## 19. Phased rollout

Three phases, no fixed durations — phases are scope buckets, not
sprint plans. Each phase is a single coordinated release that
extends the previous one's surface.

### Phase 1 — MVP

Ship the smallest end-to-end Conservative-tier flow.

1. New Prisma models (`UserStrategy`, `StrategyPosition`,
   `OpportunityCache`, `ProtocolScoreCache`) + migration.
2. `api/` strategies module: `/v1/strategies/*` endpoints, DeFiLlama
   poller, scoring service, **Zerion free-tier client (with daily
   budget circuit breaker)**, BullMQ workers.
3. Mobile `services/defi/` skeleton + Aave v3 / Lido / Curve 3pool
   adapters + executor registrations.
4. `app/strategies/` screens (onboarding, list, detail, settings)
   plus three new structured-UI cards (§14.5).
5. `agent-api/` tool-registry update + system-prompt fragment.
6. Threshold-store extension (`defi_per_action_usd`,
   `defi_per_day_usd`).
7. End-to-end test on Base testnet (USDC → Aave deposit +
   withdraw + rebalance).
8. Feature flag the entry point so we can dark-launch.
9. **Total recurring cost target: $0/month** until ~500 DAU or
   DeBank-grade EVM history becomes a need.

### Phase 2 — Solana + cross-chain

1. Solana adapters: Jito (liquid staking), Maple syrupUSDC (RWA).
2. EVM Morpho Vaults adapter (Conservative — optimised lending).
3. LI.FI cross-chain routing via backend proxy
   (`api/src/strategies/external/lifi.client.ts`) plus the
   `defi_cross_chain_deposit` mobile executor.
4. DeBank paid client behind `DEFI_DEBANK_DAILY_BUDGET_CENTS` for
   richer EVM position history + approvals audit.

### Phase 3 — full tier coverage (Balanced + Aggressive)

1. **Balanced** — Yearn v3 (ERC-4626 vaults via Yearn-ERC4626-Router),
   EigenLayer (restaking via `StrategyManager.depositIntoStrategy`),
   Ethena sUSDe (ERC-4626 + 7-day cooldown).
2. **Aggressive** — GMX v2 GLP and Hyperliquid LP. Both are perp-DEX
   LPs and need a per-protocol risk treatment: position values are
   subject to trader-PnL counterparty risk on GLP and concentrated
   liquidation risk on Hyperliquid. The `kind` field on the adapter
   (`lp_volatile` / `delta_neutral`) is what UI uses to surface the
   extra warnings — no special-cased shared code.
3. Tier-cap on auto-approval thresholds: `defi_per_action_usd`
   overrides become per-tier so Aggressive can require a tighter
   ceiling than Conservative for the same wallet.
4. (Optional) extra surface for reward claiming on Yearn / GLP —
   `buildClaim?` on the relevant adapters.

Concrete protocol coordinates for each Phase 3 protocol live in
Appendix B.8 – B.12.

---

## 20. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Protocol exploit on a recommended pool | Low | Catastrophic (user funds) | Conservative-only MVP. Static safety floor in adapters. Audit-firm-tier curated config. Hardcoded blacklist for exploited protocols. |
| Stablecoin depeg | Medium | High | Depeg watcher pushes an alert + pauses the user's strategy. User confirms exit via existing PreviewCard. |
| APY hallucination by LLM | Medium | Medium | Server-side `OpportunityCache` is source of truth. Mobile re-checks `expected_apy` against cache at execution time; >5% drift forces re-prompt. |
| Wallet mix-up (agent proposes for wrong wallet) | Low | High | dApp-bridge isolation rule applied to strategy tools (§15.5). Same enforcement as commit `4828e91`. |
| Threshold bypass (auto-approve too much) | Medium | High | Default thresholds = 0 ("always ask"). UI surfaces every grant + override decision. Audit log every approval. |
| Pre-approved grant + device theft | Low | High | Existing wallet biometric on app open + grant scope limited to `defi_write` (no native transfers). Pause kill-switch. |
| DeFiLlama outage | Low | Low | Last-known scores remain in `OpportunityCache`; staleness banner in UI when > 6h. |
| Cross-chain bridge exploit (Phase 2) | Low | High | Defer to Phase 2; require LI.FI's status API + a small allowlist of bridges. |

---

## 21. Resolved decisions

All seven items previously listed as "open questions" are resolved
below. Each decision cites the sections of the spec it shapes so
reviewers can trace consequences.

### 21.1 Multi-wallet UX — one `UserStrategy` per `(user, walletAddress)` tuple

A user holds wallets across EVM / Solana / Sui simultaneously
(`useWallet.helpers.ts` derives one of each from a single seed). It
is *normal* for the same user to run Conservative on their EVM
wallet (stablecoin lending) and Aggressive on their Solana wallet
(perp DEX LP) — collapsing the two into one `UserStrategy` row
would force a least-common-denominator tier and break the
per-wallet JWT-binding rule (§15.4).

**Decision:** `UserStrategy` is keyed by `(userId, walletAddress)`.
The Prisma schema in §6 already encodes this. The
`/v1/strategies/*` endpoints select rows by the JWT's wallet
address (no `walletAddress` in the path) so the per-wallet JWT
binding stays clean. Affects: §6 schema, §13 endpoints, §15.4 JWT
binding.

### 21.2 Whitelist defaults — curated per-tier; empty = curated, not "all"

"Empty whitelist = all protocols in tier" was footgunny: a user
sets Conservative, expects safety, but the agent could pick any
Conservative-tier opportunity DeFiLlama happens to score above 80,
including pools we haven't hand-vetted.

**Decision:** ship a **curated default whitelist per tier**.
"Empty `protocolWhitelist`" in `UserStrategy` means *use the
curated defaults*, NOT "any protocol in tier." A user can opt out
of curation via a dedicated `UserStrategy.allowAllInTier: boolean`
flag (defaults to `false`), surfaced under Advanced settings in
the onboarding sheet (§14).

Curated MVP whitelist (mirrors §17 phasing):

| Tier | Curated default whitelist |
|---|---|
| Conservative | `aave-v3-ethereum`, `aave-v3-base`, `aave-v3-arbitrum`, `lido-mainnet`, `curve-3pool` (+ Phase 2: `morpho-base`, `jito-sol`, `maple-syrupusdc`) |
| Balanced | `yearn-v3-*`, `eigenlayer-mainnet`, `ethena-susde` (Phase 3) |
| Aggressive | `gmx-v2-arbitrum`, `hyperliquid-lp` (Phase 3) |

Storage: a server-side constant
`api/src/strategies/curatedWhitelist.ts` keyed by tier. The
opportunities endpoint and the deposit guardrail in §15.8 both
consult this when `protocolWhitelist` is empty and
`allowAllInTier` is `false`. Affects: §6 schema (`allowAllInTier`
column on `UserStrategy`), §14 onboarding, §15.8 enforcement.

### 21.3 Reward claiming — manual claim with a CTA on the position card

Auto-compound and auto-sell-to-base require additional signed
steps and (for auto-sell) a swap-adapter entanglement we don't want
in v1.

**Decision:**

- **MVP — manual.** Adapters that accrue rewards in a secondary
  token implement the optional `buildClaim?` capability (already
  defined on `DefiProtocolAdapter`, §7.3). The `PositionListCard`
  (§14.5.3) renders a "Claim rewards" CTA when the underlying
  adapter has `buildClaim` defined. Tapping it fires the
  `defi_claim` write tool — one user-approved signed step, same
  flow as a deposit.
- **Phase 3 — auto-compound as opt-in.** Once we observe live
  claim cadence, add an `auto_compound: boolean` toggle to
  `UserStrategy` that wraps claim + redeposit in a single
  `defi_compound` tool. Stays human-in-the-loop (one signature per
  cycle) — still no AA.
- **Auto-sell back to base asset.** Not in scope. Whoever wants
  this opens a separate ticket against the swap service.

Affects: §11 tool inventory (add `defi_claim` to the table,
`category: write`, UI: unified `PendingTxCard`), §14.5.3 position
card spec.

### 21.4 Tax / reporting — defer; not in MVP

A useful feature, but it's a meaningful build (line-item
categorization, fiat-rate snapshots at deposit/withdraw times, CSV
schema decisions) and only some users need it.

**Decision:** **not in MVP.** When demand surfaces, derive from
the existing `StrategyPosition` rows joined against
`TransactionHistory` + `ExchangeRate` rows — no new persistence
needed, just an export endpoint. Track as a separate "Reporting"
feature spec. Affects: none in this spec.

### 21.5 Gas sponsorship — no

**Decision:** **Takumi does NOT sponsor gas for DeFi Strategies.**
The `walletKit.sendUserOpWithUsdcPaymaster()` path is still used
on Base / Arbitrum where it gives a real UX win (gas paid in
*the user's* USDC instead of forcing the user to also hold ETH for
gas), but the **user**, not Takumi, funds the gas in every case.
The Circle Paymaster integration is a *gas-denomination* tool, not
a *gas-sponsorship* tool, for this feature.

Reverberation on the spec: the "Sponsor first deposit per wallet
as acquisition incentive" idea is dropped. Affects: §5.8 free-tier
routing diagram (no change — `sendUserOpWithUsdcPaymaster` still
appears, just paid by user), §13 worker flow (no
"sponsor-the-first-N-tx" logic to add).

### 21.6 LLM choice — keep Kimi K2 in `agent-api`

The current `agent-api` runs Kimi K2 via `@ai-sdk/openai`. The
research-time question was whether to swap to Anthropic / Claude
for DeFi-tier compliance reasoning.

**Decision:** **stay on Kimi K2.** No split-brain (chat LLM vs.
reasoning LLM), no second provider key, no A/B harness. The
agent's compliance with tier + whitelist constraints is enforced
**below the LLM** by:

1. Mobile-side revalidation of `expected_tier` / `expected_apy` in
   the `defi_deposit` executor (§15.6).
2. Server-side enforcement of `protocol_not_in_whitelist` and
   `tier_exceeds_user_policy` (§15.7, §15.8).

If those guardrails fire, the LLM proposal is rejected before the
device signs. The model's job is to be a *useful* selector within
the safe envelope; the envelope is enforced by code, not by the
model. Affects: §12 `agent-api` changes (no provider swap), §22.4
env vars (zero new agent-api env vars across all phases — already
codified).

### 21.7 Test infra — extend the existing resolver + mock viem transport

Confirmed feasible.

**Decision:** Adapter unit tests reuse the existing
`services/walletKit/evm/_test-resolver.mjs` harness invoked from
`scripts/run-node-tests.sh`. We add **one new helper**,
`services/defi/_test-helpers.ts`, that wraps viem's
`createPublicClient({ transport: customMockTransport })` with a
JSON-RPC mock the per-adapter tests can preload with canned
responses (e.g. an `aUSDC.balanceOf` return value for the Aave
position read).

Why this works without burning testnet quota:

- viem accepts a custom `transport` function in
  `createPublicClient`; tests pass a function that returns the
  fixture instead of dialling HTTP.
- The resolver already rewrites `@/*` aliases and stubs
  RN-only modules — we extend it once to also alias
  `services/defi/_test-helpers` to itself so node:test resolves it
  cleanly.
- Mainnet-fork CI (§23.9 nightly Anvil job) is the layer that
  catches what mock-transport tests can't.

Affects: §23.9 CI integration (already described); no new tooling
beyond the helper file.

---

## 22. Environment variables — all repos

This section enumerates every env var the DeFi Strategies feature
adds across the three repos, plus the rules each repo's `.env`
patterns already enforce.

### 22.1 Rules we follow (existing conventions)

From `mobile-app/.env.example`, `api/.env.example`, and
`docs/umkm-usdc-payout-spec.md` §10:

1. **Mobile `EXPO_PUBLIC_*` is locked down.** Only THREE
   bootstrap/security values may live in mobile env (`API_URL`,
   `TAKUMIPAY_QR_PUBKEY_JWK`, `EIP7702_ALLOWLIST`) plus orthogonal
   peripheral vars (Google OAuth, Agent API host). **Do NOT add
   per-chain or per-protocol coordinates to mobile env** — they
   ride on the enriched `GET /v1/blockchains` feed or hardcoded
   per-protocol packages (see Appendix B).
2. **Secret keys never use the `EXPO_PUBLIC_*` prefix.** Anything
   `EXPO_PUBLIC_*` is shipped *in* the binary.
3. **Backend secret keys never get mirrored to mobile.** Explicit
   rule in `api/.env.example` (see `TAKUMIPAY_QR_PRIVATE_KEY_PEM`
   block).
4. **Per-chain RPC / contract coordinates live in the database**
   (`Blockchain.bundlerUrl`, `Blockchain.x402FacilitatorUrl`,
   etc.), not in env. We extend this for DeFi-specific protocol
   coordinates that are deployment-specific (e.g. paymaster URL,
   factory addresses).

### 22.2 `mobile-app/.env` — additions

**None for MVP.** All DeFi data flows through `api/`. No mobile env
vars are added.

Phase 2 *may* add a single feature-flag env var:

```sh
# Enables the LI.FI-powered cross-chain rebalance UI. Default off.
# Backed by EAS update so we can dark-launch the cross-chain path
# without a binary release. Read by app/strategies/settings.tsx via
# `getFeatureFlag("cross_chain_rebalance")`.
EXPO_PUBLIC_FF_CROSS_CHAIN_REBALANCE=0
```

> **Why no per-protocol mobile env vars?** Protocol contract
> addresses come from doc-curated npm packages
> (`@bgd-labs/aave-address-book`) or are hardcoded in the
> per-protocol adapter (Lido, Curve 3pool — single mainnet
> deployment each). Treating them as env-configurable would buy
> nothing and add a footgun.

### 22.3 `api/.env` — additions

All DeFi data-provider keys live here. Format mirrors the existing
`XENDIT_SECRET_KEY` / `FLIP_SECRET_KEY` convention.

```sh
# ── DeFi Strategies — data providers (task: strategies module) ────

# DeFiLlama Pro API key (optional). When set, the DeFiLlama client
# routes through https://pro-api.llama.fi/<KEY>. When blank, the
# client uses the free endpoints (https://api.llama.fi,
# https://yields.llama.fi). MVP works fine on the free tier;
# add a Pro key only when historical depth or rate limits push us
# past the free ceiling. Pricing: ~$300/month.
# CRITICAL (per DeFiLlama docs): do NOT put a Pro key in
# api.llama.fi URLs; do NOT call pro-api.llama.fi without a key.
# The client enforces this — see api/src/strategies/external/defillama.client.ts.
DEFILLAMA_API_KEY=

# Zerion API key (MVP — free tier). Auth: `Authorization: Bearer
# base64(<KEY>)` per the developers.zerion.io reference. Free tier
# is 1,000 req/day, which is enough for the MVP daily-active count
# (see spec §9.2). Used for the portfolio summary card,
# cross-chain DeFi position rollup, and WebSocket push at
# wss://api.zerion.io/v1/wallets/{addr}/subscribe. Upgrade to
# Growth ($99/month) when MVP usage crosses ~500 DAUs.
# NEVER mirror to mobile.
ZERION_API_KEY=

# DeBank Cloud AccessKey (dev free trial → Phase 2 paid). Header:
# `AccessKey: <key>` on every call to https://pro-openapi.debank.com/v1/*.
# Sign-up at cloud.debank.com gives a 1,000-credit free trial — use
# it to pressure-test the integration in dev / staging. Production
# usage is pay-per-call ("units"); gated by
# DEFI_DEBANK_DAILY_BUDGET_CENTS (below) until the Phase 2 budget
# is approved. NEVER commit a real key; NEVER mirror to mobile
# under any EXPO_PUBLIC_* prefix. NEVER log (enforce redaction in
# api/src/strategies/external/debank.client.ts).
DEBANK_ACCESS_KEY=

# LI.FI integrator identifier (Phase 2). String, NOT a secret —
# this is the `integrator` field of `createConfig({ integrator })`
# on the @lifi/sdk. Used by LI.FI for attribution and fee routing.
LIFI_INTEGRATOR=takumipay

# LI.FI API key (Phase 2, optional). Required only when traffic
# warrants higher rate limits. NEVER mirror to mobile.
LIFI_API_KEY=

# ── DeFi Strategies — feature flags ───────────────────────────────

# Worker enable flag. Set to "false" to halt the DeFiLlama poller,
# scoring worker, and rebalance trigger without redeploying.
DEFI_WORKERS_ENABLED=true

# Stablecoin depeg watcher threshold in basis points (default 50 =
# 0.5%). When a stablecoin in any active StrategyPosition deviates
# past this, the depeg watcher emits a notification and queues an
# emergency rebalance candidate.
DEFI_STABLECOIN_DEPEG_THRESHOLD_BPS=50

# Daily request budget against Zerion's free tier (default 1000 —
# matches Zerion's free-tier ceiling). The Zerion client tracks a
# rolling 24h request count in Valkey and short-circuits to cached
# data when the budget is hit. Lets us run MVP at $0/month
# without accidentally tripping Zerion's rate limit and breaking
# the portfolio summary card. Bump this when we upgrade to the
# Growth plan.
DEFI_ZERION_DAILY_BUDGET_REQUESTS=1000

# Maximum DeBank cost ceiling per day in cents (Phase 2). Server-
# side circuit breaker so a misconfigured worker can't run up the
# bill once we exit DeBank's free trial. Default 100 ($1.00/day) —
# tune during Phase 2 rollout. Set to 0 to disable the breaker.
DEFI_DEBANK_DAILY_BUDGET_CENTS=100
```

> **Per-protocol contract coordinates.** Aave v3 `Pool` addresses
> come from `@bgd-labs/aave-address-book` (compile-time import in
> the adapter — no env var). Lido stETH (`0xae7a…fe84`) and Curve
> 3pool (`0xbebc…ff1c7`) are single-deployment mainnet contracts
> and are hardcoded in their adapters. **Do not** turn these into
> env vars; the address-book / hardcoded path is the canonical
> source.
>
> If a future protocol needs OTA-rotatable coordinates (e.g.
> paymaster-style governance shifts), add a `DefiProtocolDeployment`
> table in Prisma and seed it via SQL — same pattern as
> `Blockchain.bundlerUrl`. Don't add env vars.

### 22.4 `agent-api/.env` — additions

The agent-api is intentionally thin (chat + history only — no
blockchain access). DeFi Strategies adds **zero new `agent-api`
env vars** across all phases. The agent learns about DeFi by:

1. Tool-registry update (`agent-api/src/tools/registry.ts`)
   declaring the `defi_*` tools as `executor: "mobile"`.
2. System-prompt fragment injected per chat session (no env var
   needed — the prompt module reads from a constant file).

### 22.5 Quick-reference summary table

| Var | Repo | Required from | Secret? | Notes |
|---|---|---|---|---|
| `DEFILLAMA_API_KEY` | `api/` | optional | no (just rate limit) | MVP runs on free tier; add Pro key only if scoring needs deeper history |
| `ZERION_API_KEY` | `api/` | **MVP** | **yes** | Free tier (1k req/day) is sufficient for MVP; Growth ($99/mo) when DAU > ~500 |
| `DEBANK_ACCESS_KEY` | `api/` | dev / Phase 2 | **yes** | Use 1k-credit free trial in dev; paid usage gated by `DEFI_DEBANK_DAILY_BUDGET_CENTS` |
| `LIFI_INTEGRATOR` | `api/` | Phase 2 | no | Attribution string, not a secret |
| `LIFI_API_KEY` | `api/` | Phase 2 (optional) | **yes** | Add when volume warrants |
| `DEFI_WORKERS_ENABLED` | `api/` | MVP | no | Kill-switch for workers |
| `DEFI_STABLECOIN_DEPEG_THRESHOLD_BPS` | `api/` | MVP | no | Default 50 (0.5%) |
| `DEFI_ZERION_DAILY_BUDGET_REQUESTS` | `api/` | MVP | no | Free-tier ceiling guard (default 1000) |
| `DEFI_DEBANK_DAILY_BUDGET_CENTS` | `api/` | Phase 2 | no | Cost circuit breaker for paid DeBank |
| `EXPO_PUBLIC_FF_CROSS_CHAIN_REBALANCE` | `mobile-app/` | Phase 2 | no | Feature flag |

**Net MVP secret-key count: one (`ZERION_API_KEY`).** Everything else
either has a no-auth free path (DeFiLlama) or is deferred to Phase 2
(DeBank paid, LI.FI).

---

## 23. Testing strategy — testnet, no real money

The existing TakumiPay backend already seeds testnet rows in the
`Blockchain` table (`api/src/scripts/prisma/seed.ts`) and the
mobile app already flips between mainnet and testnet via the
`Blockchain.isTestnet` flag. DeFi Strategies plugs into that
pattern — every protocol we ship has a mainnet deployment **and** a
testnet deployment, so the full end-to-end flow can be exercised
without spending a cent of real money.

### 23.1 Four test layers — pick the cheapest one that catches the bug

| Layer | What it catches | Where it runs | When to use |
|---|---|---|---|
| **Unit** | Calldata encoding, risk-scoring math, executor input validation, threshold/grant resolution. | `pnpm test:vitest` + `pnpm test:node` (existing harness; see `CLAUDE.md` "Development Commands") | Every change to `services/defi/` and `api/src/strategies/scoring/`. |
| **Mainnet fork (local Anvil / Hardhat / Helius local-validator)** | End-to-end deposit/withdraw against the **real** mainnet contracts with fake funds. Catches ABI mismatches and live integration bugs without touching real money. | Foundry / Anvil locally; spin up against an archive node or via `anvil --fork-url`. | Conservative-tier protocols (Aave, Lido, Curve, Morpho) where mainnet contracts are stable. |
| **Public testnet** | Multi-process flow (mobile → api → agent-api → chain RPC), faucet-funded wallets, real adapter routing, real worker scheduling. | Existing seeded testnet rows (Ethereum Sepolia, Base Sepolia, Arbitrum Sepolia, Holesky, Solana Devnet, Arc Testnet). | Phase rollout sign-off; every PR that touches the executor pipeline. |
| **Mainnet smoke** | Last-mile verification: real protocol APYs, real Zerion/DeBank data, real LI.FI routes. | Live app with a feature-flagged allowlist of internal wallets, capped at ≤ $10 per action via `defi_per_action_usd`. | Before flipping the public feature flag. |

### 23.2 Testnet chains we already have

Already seeded in `api/src/scripts/prisma/seed.ts` with `isTestnet: true`:

| Name | chainId | Cluster | Notes |
|---|---|---|---|
| Ethereum Sepolia | `11155111` | — | Aave v3 ✓, Lido (use Holesky instead), EigenLayer (use Holesky instead), Morpho ✓, Ethena ✓ |
| Base Sepolia | `84532` | — | Aave v3 ✓, Morpho ✓ |
| Lisk Sepolia | `4202` | — | (no DeFi adapter ships here in MVP — leave it untouched) |
| Solana Devnet | — | `devnet` | Jito ✓ (devnet stake pool — coords in Appendix B.5) |
| Arc Testnet | `5042002` | — | Used by payments; ignore for DeFi |

**Two testnets we need to add** for full Phase-1–3 protocol coverage:

- **Arbitrum Sepolia** (`chainId: 421614`) — Aave v3 testnet + GMX v2 testnet live here. Add a `prisma.blockchain.upsert` block mirroring the Base Sepolia one. RPC: `https://arb-sepolia.g.alchemy.com/v2/<KEY>`.
- **Ethereum Holesky** (`chainId: 17000`) — the canonical testnet for **Lido staking** and **EigenLayer restaking**. Add a `prisma.blockchain.upsert` block. RPC: `https://ethereum-holesky-rpc.publicnode.com` (free) or Alchemy.

Both go in the same seed file; their addition is the only seed-script
work the feature needs.

### 23.3 Per-protocol testnet deployments

| Protocol | Testnet | Coordinates |
|---|---|---|
| **Aave v3** | Sepolia / Base Sepolia / Arbitrum Sepolia | `@bgd-labs/aave-address-book` ships `AaveV3Sepolia`, `AaveV3BaseSepolia`, `AaveV3ArbitrumSepolia`. The package is the source of truth — no hand-typed addresses. All deployments use an **open faucet, 10,000-token-per-mint limit** (see [Aave V3 testnet addresses](https://docs.aave.com/developers/deployed-contracts/v3-testnet-addresses)). |
| **Lido stETH** | Holesky (Goerli is deprecated) | Lido proxy `0x3F1c547b21f65e10480dE3ad8E19fAAC46C95034`. Staking Router `0xd6EbF043D30A7fe46D1Db32BA90a0A51207FE229`. Same `submit(address _referral)` ABI as mainnet — adapter just switches address based on chain. See [Lido Holesky docs](https://docs.lido.fi/deployed-contracts/holesky/) and the [Holesky stake UI](https://stake-holesky.testnet.fi/). |
| **Curve 3pool** | No 1:1 testnet | Curve does not officially deploy 3pool to Sepolia/Base Sepolia. Two options: (a) test the adapter against a **mainnet fork** (Anvil + `--fork-url mainnet`), or (b) skip Curve in the public-testnet pass and gate it behind the mainnet smoke. Recommend (a) — it's strictly better for Curve. |
| **Morpho Vaults** | Base Sepolia / Sepolia | Morpho publishes testnet vault addresses through their GraphQL API (`blue-api.morpho.org`) the same way as mainnet — the adapter discovers vaults dynamically. |
| **Jito SOL** | Solana devnet | Program `DPoo15wWDqpPJJtS2MUZ49aRxqz5ZaaJCJP4z8bLuib` · Stake Pool `JitoY5pcAxWX6iyP2QdFwTznGb8A99PRCUCVVxB46WZ` · JitoSOL mint `J1tos8mqbhdGcF3pgj4PCKyVjzWSURcpLZU7pPGHxSYi`. (Source: Jito deployed-programs docs — already in Appendix B.5.) |
| **Yearn v3** | Sepolia (limited) | Yearn community publishes testnet vault deployments via the same registry pattern; coverage is thinner than mainnet. Mainnet fork is the better path; treat Yearn testnet as supplementary. |
| **EigenLayer** | Holesky | `StrategyManager` proxy `0xdfB5f6CE42aAA7830E94ECFCcAd411beF4d4D5b6`. Same `depositIntoStrategy(strategy, token, amount)` ABI as mainnet. Pair with Lido Holesky stETH for the full restake-from-LST flow. See [EigenLayer deployed-contracts](https://docs.eigencloud.xyz/eigenlayer/developers/concepts/eigenlayer-contracts/deployed-contracts) and the [testnet-ETH+LST guide](https://docs.eigencloud.xyz/products/eigenlayer/restakers/restaking-guides/testnet/obtaining-testnet-eth-and-liquid-staking-tokens-lsts). |
| **Ethena sUSDe** | Sepolia | Ethena publishes a Sepolia deployment for integration testing; the adapter swaps `0x9d39…3497` for the testnet address based on `Blockchain.isTestnet`. |
| **GMX v2** | Arbitrum Sepolia | GMX deploys to Arbitrum Sepolia for testing; coordinates in GMX deployment docs. |
| **Hyperliquid** | Hyperliquid testnet endpoint | Separate RPC URL; same SDK. |

### 23.4 Faucets — where to get test tokens

Hand to QA / on-call docs verbatim:

- **USDC on every Sepolia chain + Solana Devnet**:
  [`faucet.circle.com`](https://faucet.circle.com/) — no account, 20 USDC per address per chain every 2 hours. Permissionless. Covers Ethereum Sepolia, Base Sepolia, Arbitrum Sepolia, Polygon Amoy, Solana Devnet, and ~12 others.
- **Aave testnet ERC-20s (other than USDC)**: built-in faucet on every Aave V3 testnet deployment — 10,000-token-per-mint limit per the [V3 Testnet Addresses docs](https://docs.aave.com/developers/deployed-contracts/v3-testnet-addresses).
- **Sepolia ETH (gas)**: Alchemy / Infura / Coinbase / Cloudflare faucets — most require a mainnet ETH balance > 0.001 ETH on the connected wallet. Internal: ops keeps a treasury wallet for QA.
- **Holesky ETH (gas + Lido + EigenLayer)**: PoW faucet (ethpandaops.io/holesky) + Lido docs link the right faucets next to the staking-testnet UI.
- **Solana Devnet SOL**: `solana airdrop 2` from the CLI, or [faucet.solana.com](https://faucet.solana.com/).

Internal practice: keep a **shared QA wallet** funded on each testnet
so a fresh dev doesn't have to bootstrap from zero — pair it with a
small "QA reset" CLI that drains balances back to the shared wallet
when a developer is done.

### 23.5 External data providers in testnet mode — fixture-backed

DeFiLlama, Zerion, and DeBank are **mainnet-only**. They don't index
testnet pools, testnet TVL, or testnet wallet positions. We work
around this in two places:

1. **`OpportunityCache` fixture mode.** When the request's wallet
   chain is `isTestnet: true`, the strategies service serves
   opportunities from a curated JSON fixture instead of the
   `OpportunityCache` table. The fixture is shipped under
   `api/src/strategies/external/testnet-fixtures/opportunities.json`
   and committed to the repo so testnet behaviour is reproducible
   across devs. Sample entry:
   ```jsonc
   [
     {
       "slug": "aave-v3-base-sepolia",
       "namespace": "eip155",
       "chain_id": 84532,
       "asset_symbol": "USDC",
       "apy": 7.2,                // hand-picked plausible number
       "apy_7d_avg": 7.0,
       "tvl_usd": 100000,         // synthetic
       "score": 92,
       "tier": "conservative",
       "kind": "stablecoin_lending",
       "liquidity_profile": "instant",
       "source": "manual"
     }
   ]
   ```
   New env var:
   ```sh
   # When set, the strategies module routes opportunities for
   # isTestnet=true wallets to the fixture file at the given path
   # (relative to the api/ root). Default unset — strategies module
   # returns an empty list for testnet wallets if no fixture is
   # configured (safe default; UI shows "no opportunities").
   DEFI_TESTNET_FIXTURES_DIR=src/strategies/external/testnet-fixtures
   ```
2. **Position reads bypass Zerion/DeBank on testnet.** When the
   wallet is on a testnet chain, the portfolio summary card and
   position list read **only** from the per-adapter `readPosition()`
   contract calls — no API call out. This is correct anyway:
   adapter reads are the source of truth, the third-party APIs are
   the summary layer. On testnet we lose the cross-chain rollup, but
   we keep the trade-decision path honest.

### 23.6 Backend test env knobs (additions to `api/.env`)

```sh
# Master switch — turn the entire DeFi worker pipeline off in CI
# and unit-test environments so background jobs don't fire during
# `pnpm test`. Already declared in §22.3; restated here for the
# test-environment context.
DEFI_WORKERS_ENABLED=false

# Path (relative to api/ root) where testnet opportunity fixtures
# live. Empty / unset → testnet wallets see an empty opportunities
# list (safe default). See §23.5.
DEFI_TESTNET_FIXTURES_DIR=src/strategies/external/testnet-fixtures

# Optional: force-stub the Zerion client to a fixed JSON response
# regardless of the wallet's chain. Used in unit tests that mock
# the portfolio summary path. NEVER set in staging or production.
DEFI_ZERION_STUB_RESPONSE=
```

### 23.7 Mobile QA flow — exact steps

1. **Switch the active chain to a testnet row** via the existing
   chain selector (Ethereum Sepolia / Base Sepolia / Arbitrum
   Sepolia / Holesky / Solana Devnet, depending on the protocol
   under test).
2. **Top up the wallet** via `faucet.circle.com` (USDC) plus the
   relevant gas faucet (Sepolia ETH / Holesky ETH / Devnet SOL).
3. **Open Takumi Agent** → "Find me a safe USDC yield." Agent calls
   `defi_list_opportunities`. Backend returns the **testnet fixture**
   `aave-v3-base-sepolia` (or whichever chain you're on).
4. **Approve the deposit.** The unified `PendingTxCard` walks
   through the same approval flow as production. Sign with the
   wallet's testnet key.
5. **Verify on-chain** via the seeded testnet `blockExplorer` URL
   from the `Blockchain` row (e.g. `sepolia.basescan.org`).
6. **Withdraw** and confirm the position closes — same flow in
   reverse.
7. **For rebalance**, switch chains mid-flow (Aave Sepolia →
   Aave Base Sepolia would require cross-chain in Phase 2; for MVP
   only test same-chain rebalances: e.g. between two Aave-Base
   markets with different assets).

### 23.8 What we *don't* test in pre-mainnet layers

- **Live LI.FI routes.** LI.FI's testnet support is uneven; we
  validate that the LI.FI client wraps quotes correctly via unit
  tests and a recorded fixture, but the end-to-end multi-bridge
  flow is exercised only at the mainnet-smoke layer with a
  ≤ $10 cap.
- **Real APY drift behaviour.** Testnet APYs are synthetic; the
  ±5% drift guard in `defi_deposit` (§15) is unit-tested with
  fixture inputs, not a live testnet pool.
- **Real depeg events.** The depeg watcher is unit-tested with a
  stubbed DeFiLlama `/stablecoins` payload; a real depeg is rare
  enough that we don't gate the rollout on observing one in
  testnet.

### 23.9 CI integration

- `pnpm test` already exists (vitest + node:test, per `CLAUDE.md`).
  New tests for `services/defi/adapters/*` and
  `api/src/strategies/scoring/*` plug into that harness directly.
- Add a **mainnet-fork smoke job** to CI that boots Anvil with a
  Foundry / `viem` test, deposits 100 USDC into Aave v3 mainnet
  Pool from a funded fork-impersonated address, and verifies the
  aUSDC balance changed. This is the "did the calldata stay valid
  after a vendor SDK bump" canary. Runs on a nightly schedule, not
  per-PR, to keep CI fast.
- The `pnpm check:chains` and the new `pnpm check:defi` (§7.6)
  guardrails stay in the `prepush` chain.

### 23.10 Phasing the test work

- **Phase 1:** layers 1 + 2 + 3 for Aave / Lido / Curve. Mainnet
  fork is mandatory because Curve has no testnet 3pool. Public
  testnet covers Aave on Base Sepolia and Lido on Holesky.
- **Phase 2:** add Jito devnet + Morpho Sepolia to the public
  testnet pass. LI.FI gets fixture-tested only until the
  mainnet-smoke pass.
- **Phase 3:** add EigenLayer Holesky + Ethena Sepolia to the
  public testnet pass. GMX testnet runs on Arbitrum Sepolia.
  Hyperliquid stays at fork-only until production sign-off.

---

## 24. Compatibility audit — what we touch, what stays untouched

The feature must not break existing payments, points, dApp browser,
or wallet flows. This section is a line-by-line accounting of every
existing surface the spec interacts with — classified **Additive**
(net-new files, zero risk to existing code), **Extend** (modify an
existing file in a backward-compatible way), or **Migrate** (a
schema/state change with a real backward-compat plan).

Real regressions found during this audit are flagged ⚠️. Each has a
concrete mitigation locked into the spec.

### 24.1 Mobile — `services/`, `hooks/`, `components/`, `app/`

| Existing surface | Classification | What changes | Risk |
|---|---|---|---|
| `services/walletKit/types.ts` (`WalletKitAdapter`) | **Untouched** | We use `sendContractTransaction` / `sendAnchorInstruction` / `sendUserOpWithUsdcPaymaster` as-is. | None |
| `services/walletKit/registry.ts` + `bootstrap.ts` | **Untouched** | Read-only consumer. | None |
| `services/chains/{evm,solana,sui}/` | **Untouched** | None of the per-chain adapters are modified. | None |
| `services/agent-executors/index.ts` (`EXECUTORS` map, `EXPECTED_MOBILE_TOOLS`, `assertRegistryParity`) | **Extend** | Spread `DEFI_EXECUTORS` into `EXECUTORS`; add the new tool names to `EXPECTED_MOBILE_TOOLS`. | ⚠️ **Parity assertion is strict.** Adding mobile-side without server-side (or vice versa) makes `assertRegistryParity()` throw at boot and brick the agent. **Mitigation:** spec §11 + §12 already require simultaneous updates. The Phase 1 PR adds both sides in one commit; a CI test imports both lists and asserts equality. |
| `services/agent-executors/types.ts` (`ExecutorContext`, `MobileToolExecutor`) | **Untouched** | New executors fit the existing signature. | None |
| `services/permissionGrantStore.ts` — `ToolCapability` union (`permissionGrantStore.ts:23`) | **Extend** | Union currently `"read" \| "simulate" \| "write"`. **The spec's §15.1 claim that DeFi tools register under `defi_write` / `defi_read` capability keys is invalid against the current type.** | ⚠️ **Type-system collision.** **Mitigation:** widen the union to `"read" \| "simulate" \| "write" \| "defi_read" \| "defi_write"` in the same PR that adds the DeFi tools. Stored grants from before the change still load (TypeScript type doesn't gate persistence; runtime accepts any string). Reverse migration is safe because new keys only appear after the deploy. |
| `services/permissionGrantStore.ts` — storage shape | **Untouched** | Same key format, same SecureStore adapter. Existing grants keep working. | None |
| `services/transferThresholdStore.ts` — `TransferThresholds` interface | **Extend** | Add `defi_per_action_usd`, `defi_per_day_usd`, `defi_overrides`. | ⚠️ **Existing stored thresholds lack the new fields.** The store loads via `JSON.parse(raw) as Partial<TransferThresholds>` at `transferThresholdStore.ts:171`, so missing fields are `undefined`. **Mitigation:** spec §15.3 default thresholds to `0` ("always ask") via `DEFAULT_THRESHOLDS` merge. Any `undefined` field in a legacy load resolves to `0` and forces approval — the safe default. No user-visible regression. |
| `services/transferThresholdStore.ts` — `ResolvedThreshold` | **Untouched** | New `resolveDefiThreshold(...)` is additive, doesn't touch the existing `resolve(...)`. | None |
| `services/agentPermissionsHelpers.ts` | **Untouched** | DeFi executors call this helper the same way existing ones do. | None |
| `services/bridge/` (dApp bridge) | **Untouched** | Strategy operations are **agent-originated**, not dApp-originated. They do NOT enter the EIP-1193 bridge surface; they do NOT register `ApprovalRenderer`s. The bridge's approval pipeline is independent. | None |
| `services/swap/` | **Untouched** | MVP doesn't route through swap. Phase 2 cross-chain goes through LI.FI (separate module), not the existing swap client. | None |
| `services/staking/{lstDetector,vaultDetector}.ts` | **Untouched** | Read-only token-classification helpers. Lido adapter is a separate file under `services/defi/adapters/lido.ts`; the two coexist without conflict. | None |
| `services/indexer/` + `services/rpc/` | **Untouched** | `readPosition()` uses the existing public clients via the same provider routing. No new providers wired. | None |
| `services/tokens/` | **Untouched** | DeFi adapters reference token addresses directly (Aave address-book, Lido constant). No mutation of the token list. | None |
| `hooks/useWallet.ts` + `useWallet.helpers.ts` | **Untouched** | Strategy hooks consume `useWallet()` read-only. The "no namespace branching in shared code" rule still applies and is enforced by `check:chains`. | None |
| `hooks/queries/*` | **Additive** | New query hooks `useStrategies*`. Existing query hooks untouched. **Query-key namespace:** all new keys begin with `['strategies', ...]` so TanStack Query cache doesn't collide with existing keys. | None |
| `hooks/useRQGlobalState.ts` | **Untouched** | Read-only consumer. | None |
| `components/home/TakumiAgent/StructuredUI/registry.ts` (`toolComponents`) | **Extend** | Add `defi_list_opportunities`, `defi_list_positions`, `defi_deposit`, `defi_withdraw`, `defi_claim`, `defi_rebalance` entries. Existing entries (`send_native_token` etc.) untouched. | None |
| `components/home/TakumiAgent/StructuredUI/cards/PendingTxCard.tsx` | **Extend (preview-state only)** | Reused by `defi_deposit` / `defi_withdraw` / `defi_claim` via registry — output-available + output-error branches untouched. The **input-available (preview) branch** gains a presence-checked collapsible block for §14.6 inline mini-onboarding (only renders for first-touch deposits where the wallet has no `UserStrategy` row). Other write tools (`send_native_token`, `transfer_erc20`, etc.) don't carry the `no_user_strategy` hint in their `meta`, so the block stays hidden for them. | None — backwards-compatible (presence check, default off). |
| `components/home/TakumiAgent/PreviewCard/`, `ApprovalSheet`, `PendingTxCard/` (legacy non-registry one) | **Untouched** | Same. | None |
| `components/agent/approvalSheetLogic.ts` | **Untouched** | New grants reuse the existing five-option picker; no changes to the picker itself. | None |
| `app/_layout.tsx` | **Extend** | Add one line: `bootDefi()` after `bootWalletKits()`. | ⚠️ **Boot-order matters.** Adapters call `walletKitRegistry.get(...)` at registration time. **Mitigation:** §5.3 already pins the order: `pollyfills → bootWalletKits() → bootDefi() → first screen mount → bootBridge()`. Wrong order → adapters register with `null` kits and crash on first deposit. Add a runtime guard inside `bootDefi()` that asserts `walletKitRegistry.list().length > 0`. |
| `app/agent-permissions.tsx` | **Untouched** | Existing settings page renders the existing grant store. New `defi_write` / `defi_read` capabilities show up automatically once the union is widened. | None |
| `app/dapps-browser.tsx`, `app/payment.tsx`, `app/pay-merchant.tsx`, `app/deposit.tsx`, `app/send.tsx`, `app/wallet.tsx`, `app/auth.tsx` | **Untouched** | Zero edits required by this feature. | None |
| `scripts/check-chain-agnostic.sh` | **Untouched** | Existing allowlist stays as-is. | None |
| `scripts/check-defi-agnostic.sh` | **Additive** | New script (§7.6). | None |
| `package.json` `prepush` chain | **Extend** | Append `pnpm check:defi`. | ⚠️ **Script must exist** before `prepush` references it. **Mitigation:** the PR adds the script file *and* the `package.json` entry in the same commit. |

### 24.2 Backend — `api/`

| Existing surface | Classification | What changes | Risk |
|---|---|---|---|
| `prisma/schema.prisma` — existing models | **Untouched** | `UserStrategy`, `StrategyPosition`, `OpportunityCache`, `ProtocolScoreCache` are new top-level models with no FK into payment-path tables. | None |
| Prisma migration | **Migrate** | One additive migration: four `CREATE TABLE` + indices, including `StrategyPosition.goal`, `StrategyPosition.targetDate`, the `@@index([targetDate])`, and `UserStrategy.allowAllInTier`. | ⚠️ **Migration must be fast and non-blocking.** **Mitigation:** none of the new tables back-fill from existing tables. Migration is pure DDL, runs in seconds. Add the migration to the standard `lint-migrations.sh` pass. |
| Existing modules (`pay`, `points`, `blockchains`, `tokens`, `dapps`, `merchants`, `transactions`, `userOp`, `auth`, `admin`, `redemption`) | **Untouched** | None of these import from the new `strategies/` module. | None |
| `JwtAuthGuard` (global guard) | **Untouched** | New routes opt into the existing guard. | None |
| BullMQ queue names | **Additive** | New queues: `defi-llama-poll`, `defi-score-opportunities`, `defi-depeg-watcher`, `defi-rebalance-trigger`, `defi-goal-deadline-watcher`. All prefixed with `defi-` so they can't shadow existing payout / settlement queues. | None |
| Valkey key namespace | **Additive** | All new keys prefixed `defi:` (e.g. `defi:opp:{slug}`, `defi:zerion:budget:{date}`). No collision risk with existing key spaces. | None |
| NATS topics | **Additive** | All new topics prefixed `defi.` (e.g. `defi.depeg.detected`, `defi.opp.scored`). | None |
| `GET /v1/blockchains` feed | **Untouched** | Strategies module consumes it read-only; doesn't add fields. | None |
| `TransactionHistory` ingestion | **Untouched** | The strategies module *observes* the existing pipeline via Prisma reads — no upstream modifications. | None |
| Existing env vars | **Untouched** | All DeFi env vars are new names; nothing renames or repurposes existing keys. | None |

### 24.3 Backend — `agent-api/`

| Existing surface | Classification | What changes | Risk |
|---|---|---|---|
| `TOOL_REGISTRY` | **Extend** | Add `defi_*` entries with `executor: "mobile"`. Existing tools untouched. | ⚠️ **Mobile-server parity** — same risk as §24.1 row for `EXPECTED_MOBILE_TOOLS`. **Mitigation:** the PR updates both sides simultaneously; a CI test imports both lists and asserts equality. |
| System prompt | **Extend** | Inject a DeFi-mode fragment. Existing prompt unchanged. | None |
| `Conversation` / `Message` Prisma tables | **Untouched** | No new persistence in agent-api. | None |
| Streaming SSE wire format | **Untouched** | DeFi tools use the existing `tool_pending` / `tool_executed` envelope. | None |
| Env vars | **Untouched** | Zero new agent-api env vars across all phases (§22.4). | None |

### 24.4 Seed script (`api/src/scripts/prisma/seed.ts`)

| Existing surface | Classification | What changes | Risk |
|---|---|---|---|
| Existing chain rows (Ethereum, Base, Solana mainnet/devnet, Arc Testnet, Monad, Sepolia, Base Sepolia, Lisk Sepolia, Solana Devnet) | **Untouched** | Their index positions in the array stay stable. | None |
| New chain rows | **Additive** | Phase 1 adds Arbitrum Sepolia (chainId `421614`) and Ethereum Holesky (chainId `17000`) — both appended at the **end** of the array so existing `blockchains[N]` references don't shift (same discipline the spec calls out in the existing Arc Testnet seed block). | None |
| Existing token rows | **Untouched** | DeFi adapters resolve protocol contracts from npm packages (Aave address-book) or hardcoded constants (Lido, Curve 3pool) — they do NOT need new `Token` rows. | None |

### 24.5 Three concrete must-fix items rolled up

These are the ⚠️ items above, consolidated as a single PR checklist:

1. **Widen `ToolCapability`** at `services/permissionGrantStore.ts:23`:
   ```ts
   export type ToolCapability = "read" | "simulate" | "write" | "defi_read" | "defi_write";
   ```
2. **Add a registry-parity CI test** that imports both
   `mobile-app:services/agent-executors/index.ts#EXPECTED_MOBILE_TOOLS`
   and `agent-api:src/tools/registry.ts#mobile-executor tool names`
   and asserts they're set-equal. This catches drift on either side
   in CI rather than at boot.
3. **Guard `bootDefi()`** with `if (walletKitRegistry.list().length === 0) throw …` so a wrong boot order fails loud during the polish pass instead of silently producing broken adapters at first use.

### 24.6 TakumiPay smart contracts — **untouched**

Verified at spec time against `/contract/evm/src/` and
`/contract/solana/`:

| TakumiPay contract | Purpose | DeFi-related change? |
|---|---|---|
| `TakumiPay.sol` / `TakumiPayV2.sol` | Merchant payment processing (`processMerchantPayment`), points deposit, settlement | **None** |
| Solana TakumiPay program | Same scope on Solana (Anchor) | **None** |
| EIP-7702 delegator allowlist (`EXPO_PUBLIC_EIP7702_ALLOWLIST`) | Governs which delegators the user's EOA can adopt | **None** — DeFi calls are plain `eth_sendTransaction` from the EOA, no delegation |

Every DeFi write in this spec is the user's wallet signing a
transaction against a **third-party** contract — Aave Pool, Lido
stETH, Curve 3pool, Morpho ERC-4626 vaults, EigenLayer
StrategyManager, Ethena sUSDe, Jito SPL stake pool, Circle
Paymaster, LI.FI router (Phase 2). The wallet is `msg.sender`; the
calldata targets the protocol's contract directly. TakumiPay's
payment contracts are not in the call path.

This is a designed-in property of the space-docking discipline (§7):
DeFi protocols register as `DefiProtocolAdapter`s; the chain
adapter remains the dApp-bridge surface; the wallet kit remains the
first-party signing surface. None of the three docking ports
intersect with TakumiPay's own deployed bytecode.

Three properties it buys us:

1. **Payment rail stays frozen.** No audit, no migration, no
   upgrade window for the live revenue path. A future
   `TakumiPayV3` upgrade can ship independently; DeFi keeps
   working.
2. **Fault isolation.** A buggy Aave adapter can lose a single
   user's deposit. It cannot corrupt a merchant payment or
   drain points balances.
3. **No on-chain governance dependency.** Adding a new DeFi
   protocol is an off-chain addition (new adapter file +
   register call). No on-chain proposal, no timelock, no
   multisig coordination.

### 24.7 What the audit does *not* try to prove

- That **no future** change to existing modules collides with DeFi.
  The audit is a snapshot at spec time; reviewers should re-check
  during the Phase 1 PR review and any time `permissionGrantStore`,
  `transferThresholdStore`, or `agent-executors/index.ts` is
  touched by an unrelated change.
- That third-party SDK bumps (`@bgd-labs/aave-address-book`,
  `@morpho-org/blue-sdk-viem`, `@lifi/sdk`, `@solana/spl-stake-pool`)
  don't regress. That's what the nightly mainnet-fork CI canary in
  §23.9 is for.

---

## 25. Multi-agent architecture integration — stub-to-real flip

This entire spec ships *into* a topology defined by
[`docs/multi-agent-architecture-spec.md`](./multi-agent-architecture-spec.md).
That redesign is **the prerequisite** — it lands first as one
feature and ships the DeFi agent as a stub. This spec flips the
stub to real.

### 25.1 What the multi-agent spec already gives us

When the multi-agent redesign is merged, the following pieces of
DeFi-feature scaffolding **already exist** and we don't rebuild
them:

| Piece | Source (multi-agent spec) | Status pre-flip |
|---|---|---|
| DeFi `AgentCard` | §5 | `status: "stub"` — flip to `"ready"` |
| DeFi handler dir `agent-api/src/agents/defi/{card,handler,prompts}.ts` | §11.1 | Stub handler returns canned `{ status: "stubbed" }`; flip swaps the handler body. |
| Server tool registry dir `agent-api/src/tools/defi/` | §7.1 | Holds stub schemas with the canonical names (`defi_list_opportunities`, `defi_list_positions`, `defi_deposit`, `defi_withdraw`, `defi_rebalance`); flip swaps the implementations to call the DeFi backend. |
| Mobile stub executors `services/agent-executors/defi/stub.ts` | §7.2, §12 | Returns canned `ToolResult`s; flip replaces the file with real executors that go through `services/defi/adapters/*`. |
| Prefix routing `defi_*` → DeFi specialist | §6.1 (static prefix routing) | Already enforced by the orchestrator. Real tools inherit it automatically. |
| `AgentTask` + `AgentPeerMessage` persistence | §8.2 | Already created. DeFi tasks just start writing real input/output instead of canned strings. |
| `wallet_context` forwarding from Core → DeFi specialist | §9 | Already wired. This is what makes the §15 JWT-binding and dApp-bridge-isolation rules work — Core sets `wallet_context` once per turn and DeFi receives it as a function param, never re-resolves from `useWallet`. |
| `pnpm check:agents` CI guard | §7.3, §14.1 row 9 | Already running. Real DeFi tools must keep the `defi_` prefix (this spec already complies). |
| Core's friendly-error narration for stub responses | §12 (last bullet) | Becomes irrelevant once the real DeFi backend lands; the user-facing-error rule (§16 of this spec) takes over per actual error code. |

**Net new from this spec on top of the multi-agent topology:**

- Replace stub handler in `agent-api/src/agents/defi/handler.ts` with real LLM call + `agent-api/src/strategies/external/*` clients.
- Replace stub schemas in `agent-api/src/tools/defi/` with the real Zod schemas from §11 of this spec.
- Replace `services/agent-executors/defi/stub.ts` with real executors under `services/agent-executors/defi/*` (one file per category, mirroring how `wallet/` is laid out per multi-agent §7.2).
- Add the new mobile-side modules from §6 (`services/defi/{registry,bootstrap,adapters,positions,errors,tools}`) — these are the production engine that the real executors call into.
- Add the three new structured-UI cards (§14.5: `OpportunityListCard`, `PositionListCard`, `RebalancePreviewCard`) and wire them into `StructuredUI/registry.ts`.
- Add the `api/src/strategies/` module + Prisma migration + BullMQ workers (§13, §18).
- Add `pnpm check:defi` CI guard (§7.6) — sibling to `pnpm check:agents`, narrower scope (no `protocolSlug` branches in shared code).

### 25.2 Tool-naming alignment (locked in by this spec)

The multi-agent stub uses **canonical names from this spec's §11**.
The two specs now agree:

| Tool name | First appearance | Status |
|---|---|---|
| `defi_list_opportunities` | Multi-agent §5 + this §11 | Stubbed by multi-agent; real by this spec |
| `defi_list_positions` | Multi-agent §5 + this §11 | Stubbed by multi-agent; real by this spec |
| `defi_deposit` | Multi-agent §5 + this §11 | Stubbed by multi-agent; real by this spec |
| `defi_withdraw` | Multi-agent §5 + this §11 | Stubbed by multi-agent; real by this spec |
| `defi_rebalance` | Multi-agent §5 + this §11 | Stubbed by multi-agent; real by this spec |
| `defi_get_config` | This §11 only | **Adds at flip** (no stub) |
| `defi_simulate_deposit` | This §11 only | **Adds at flip** (no stub) |
| `defi_claim` | This §11 only (per §21.3 manual claim decision) | **Adds at flip** (no stub) |

> Earlier drafts of the multi-agent spec carried placeholder names
> like `defi_propose_deposit` and `defi_get_positions`. Those have
> been renamed to the canonical set in the same change that introduced
> this section, so the stub → real flip is a **rename-free**
> operation on the server registry and mobile executor map.

### 25.3 The flip checklist — concrete steps

When this spec is implemented, the entire flip is:

1. **Server handler.** Replace
   `agent-api/src/agents/defi/handler.ts` stub body with the real
   handler that:
   - Receives `wallet_context` per multi-agent §9 (no change to the
     handler signature).
   - Routes `defi_*` tool calls through Zod schema validation,
     queries `api/`'s `/v1/strategies/*` endpoints with the
     paying-wallet JWT, and emits `tool_pending` SSE frames for the
     mobile executor as normal.
   - Optionally calls `core_handoff` (multi-agent §6.1) when a DeFi
     explanation warrants a narrative pass-through; otherwise
     returns structured tool output and lets Core narrate.
2. **Server tools.** Replace the stub Zod schemas + handler bodies
   in `agent-api/src/tools/defi/{opportunities,positions,propose}.ts`
   with the canonical schemas from §11 of this spec. The
   filenames stay (the multi-agent skeleton picked the right
   layout); only contents change.
3. **Mobile executors.** Delete `services/agent-executors/defi/stub.ts`.
   Add the real executors under `services/agent-executors/defi/`
   (one file per category — mirrors `wallet/`):
   - `reads.ts` — `defi_list_opportunities`, `defi_list_positions`, `defi_get_config`
   - `simulate.ts` — `defi_simulate_deposit`
   - `writes.ts` — `defi_deposit`, `defi_withdraw`, `defi_claim`, `defi_rebalance`
   These executors call into `services/defi/adapters/*` (this spec §7)
   to build calldata and dispatch through `walletKitRegistry`
   (`sendContractTransaction` / `sendUserOpWithUsdcPaymaster` /
   `sendAnchorInstruction`).
4. **Mobile production engine.** Add the new `services/defi/`
   tree per §6 (registry, bootstrap, adapters, positions reader,
   errors, tools schemas). Wire `bootDefi()` into `app/_layout.tsx`
   between `bootWalletKits()` and the first screen mount, per §5.3.
5. **Mobile UI.** Add the three new structured-UI cards
   (`OpportunityListCard`, `PositionListCard`,
   `RebalancePreviewCard`) and register them in
   `components/home/TakumiAgent/StructuredUI/registry.ts`
   alongside the wallet cards. Reuse the existing unified
   `PendingTxCard` for `defi_deposit` / `defi_withdraw` /
   `defi_claim`.
6. **Backend.** Add `api/src/strategies/` (this spec §13) with the
   four Prisma models, BullMQ workers (§18: `defillama-poll`,
   `score-opportunities`, `stablecoin-depeg-watcher`,
   `rebalance-trigger`, `goal-deadline-watcher`), and external
   clients (`defillama.client.ts`, `zerion.client.ts`,
   `debank.client.ts`, `lifi.client.ts`).
7. **Env vars.** Provision the keys from §22.3 — `ZERION_API_KEY`
   is the only MVP-required secret; the rest gate Phase 2.
8. **Card flip.** In `agent-api/src/agents/defi/card.ts`, change
   `status: "stub"` → `status: "ready"`. CI's
   `pnpm check:agents` should still pass — the prefix and `tool_prefixes`
   list didn't change.
9. **Friendly-error sanitisation.** Per multi-agent §12, Core
   currently paraphrases stub responses into a fixed "coming soon"
   string. After the flip, Core narrates real responses; the
   user-facing error rule from §16 of this spec takes over (typed
   `DefiErrorCode` → fixed friendly copy in UI).
10. **Drop the migration scaffolding.** Delete any "DeFi is
    stubbed" warnings, the canned `{ status: "stubbed" }` sample
    payloads, and the friendly-coming-soon copy from the system
    prompt fragment.

### 25.4 What does *not* change at flip time

By design (multi-agent §14.3 + this §24): the redesigned topology
is the load-bearing piece. The flip touches only the four boxes
the topology was *built to swap*:

- DeFi `AgentCard.status` (one string)
- DeFi handler body
- DeFi mobile executors
- DeFi server tool schemas

**Untouched at flip time:**

- Core handler / system prompt — Core never needed to know DeFi was
  stubbed; it sees tools by name and routes by prefix.
- Wallet agent — zero edits.
- Orchestrator routing logic — same prefix-based dispatch.
- `AgentTask` / `AgentPeerMessage` Prisma tables — same schema.
- Mobile SSE envelope shape — same `tool_pending` / `tool_result` /
  `origin_agent_id`.
- `wallet_context` propagation — same rule.
- Conversation persistence (`Conversation`, `Message`) — same.

That's the value of shipping the redesign first.

### 25.5 What happens if DeFi Strategies is implemented before multi-agent

It can't, cleanly. The spec assumes prefix-based routing
(multi-agent §6.1) and `wallet_context` forwarding (§9) to keep
shared code namespace-agnostic and to satisfy the JWT-binding rule
(§15.4). Without the multi-agent skeleton, this spec would either:

- Force a one-off `defi_*` dispatcher into the monolithic agent
  (which then has to be torn out when multi-agent ships — wasted
  work), or
- Inline routing logic into the existing flat `EXECUTORS` map
  (which violates the §7 docking-port discipline).

**Don't.** The order is fixed: multi-agent first, then this.

---

## Appendix A — Worked example: Conservative USDC deposit

### A.1 Returning user — has `UserStrategy`, picks "Find me the best safe yield for my USDC"

1. Agent reads `wallet_context` (wallet A, EVM, chainId 8453 Base).
2. Agent calls `defi_list_opportunities { tier: "conservative" }`.
3. Mobile executor proxies to `GET /v1/strategies/opportunities?tier=conservative&chainId=8453`
   with the per-wallet JWT.
4. Server returns scored list. Top entry:
   `{ slug: "aave-v3-base", apy: 7.2%, score: 92, tier: "conservative" }`.
5. Agent composes: "I'd recommend Aave v3 on Base — currently 7.2%
   APY, score 92/100. Deposit 500 USDC?"
6. User taps Yes. Agent emits `defi_deposit { protocol_slug: "aave-v3-base", chain_id: 8453, asset_symbol: "USDC", amount_raw: "500000000", expected_apy: 7.2 }`.
7. Mobile executor:
   - Resolves grant (capability `defi_write`, granted 30d ago, valid).
   - Resolves threshold (`defi_per_action_usd: 1000`, 500 USDC ≈ $500 — under threshold).
   - Resolves opportunity (refetches, confirms tier + APY drift < 5%).
   - Loads `aaveV3` adapter → `buildDeposit()` → `UnsignedCall` with `needsApproval: { token: USDC, spender: AavePool, amount: 500e6 }`.
   - Submits via `walletKit.sendUserOpWithUsdcPaymaster()` (Base) — gas paid in USDC, one signature for approve + deposit.
8. `PendingTxCard` polls; on confirm, writes `StrategyPosition` via
   `POST /v1/strategies/positions` (or lets `TransactionHistory`
   backfill).
9. Agent replies with the receipt: "Deposit confirmed in block N."

No raw error strings, no leaked server bodies, no namespace
branching in shared code, no protocol logic in `agent-api/`, no
private key off-device, no third-party session-key smart contract.

### A.2 First-touch user — *"I have 800 USDC, I want to use it later to buy a laptop after 3 months"*

End-to-end of the inline-mini-onboarding flow (§14.6). User has
NEVER opened `/strategies` and has NO `UserStrategy` row.

1. Agent reads `wallet_context` (wallet B, EVM, chainId 8453 Base).
2. LLM extracts intent → transient params:
   `{ tier: "conservative", asset_symbol: "USDC", amount_usd: 800,
      liquidity_profile: "instant", goal: "Laptop purchase",
      target_date: "2026-08-13T00:00:00Z" }`
   (90 days from today, 2026-05-15).
3. Agent calls `defi_list_opportunities { tier, asset_symbol,
   chain_id, liquidity_profile, amount_usd }`.
4. Mobile executor: detects no `UserStrategy` row for wallet B, but
   the call's optional params let it proceed without one. Calls
   `/v1/strategies/opportunities` with the transient params.
5. Server returns the curated Conservative list, filtered to USDC +
   Base + instant liquidity. Top entry: `aave-v3-base` (Maple
   filtered out because withdrawal-queue ≠ instant).
6. `OpportunityListCard` renders with the scored list. User taps
   "Use this" on Aave v3 Base; amount sheet prefilled with 800 USDC.
   Card calls `addToolResult({ selected_slug: "aave-v3-base",
   selected_amount_raw: "800000000" })`.
7. LLM composes: *"Deposit 800 USDC to Aave v3 on Base, 7.2% APY —
   that's ~$14 yield over 3 months. Approve?"*
   Then emits `defi_deposit { protocol_slug: "aave-v3-base",
   chain_id: 8453, asset_symbol: "USDC", amount_raw: "800000000",
   expected_apy: 7.2, goal: "Laptop purchase",
   target_date: "2026-08-13T00:00:00Z" }`.
8. Mobile executor: sees no `UserStrategy` exists. Renders the
   `PendingTxCard` preview with the §14.6.3 *Activate DeFi
   Strategies for this wallet* collapsible block (inferred:
   Conservative · Instant · 800/wallet-balance% allocation · 30-day
   `defi_write` grant). User taps **"Confirm deposit + activate."**
9. Mobile executor (atomic bundle):
   - `POST /v1/strategies { tier: "conservative",
     assetPreference: "stable", liquidityPref: "instant", ... }` →
     `UserStrategy` row created.
   - `permissionGrantStore` writes the `defi_write` capability
     grant with `lifetime: { type: "timed", expires_at: now+30d }`.
   - Calls `aaveV3-base.buildDeposit()` → `UnsignedCall` with
     `needsApproval: { token: USDC, spender: AavePool, amount: 800e6 }`.
   - `walletKit.sendUserOpWithUsdcPaymaster()` — one signature.
10. On confirm: `POST /v1/strategies/positions { ..., goal:
    "Laptop purchase", targetDate: "2026-08-13T00:00:00Z",
    openTxHash: "0x…" }`.
11. Agent: *"Deposit confirmed in block N. I'll remind you a week
    before 2026-08-13 — your laptop fund is earning 7.2% APY."*

### A.3 Day 83 — the nudge

1. `goal-deadline-watcher` runs at 00:30 UTC. Sees
   `StrategyPosition` with `targetDate - now = 7 days` and no
   `defi.goal.approaching` event in the last 24h.
2. Emits a push notification: *"Your Laptop purchase target is in
   7 days — review your position?"* Deeplinks to `/strategies`
   with the position card focused.
3. User taps the notification → `/strategies` opens, scrolls to
   the Aave-v3-Base position, "Withdraw" CTA pre-focused.

### A.4 Day 90 — withdrawal (still signed by the user)

1. User opens Takumi Agent: *"Withdraw my laptop fund."*
2. Agent calls `defi_list_positions` → `PositionListCard` shows the
   position. User taps "Withdraw."
3. `defi_withdraw { position_id, amount_raw: "MAX" }` →
   unified `PendingTxCard` → one signature → done.
4. `StrategyPosition.status = "withdrawn"`, `closeTxHash` filled.
   The `goal-deadline-watcher` skips the row on subsequent runs.

---

## Appendix B — Protocol coordinates

All addresses and signatures are doc-sourced (citations in Appendix
C). This table is the source-of-truth that the per-adapter files
must agree with; reviewer can grep `Appendix B` to confirm an
adapter is using the right addresses.

### B.1 Aave v3

Use [`@bgd-labs/aave-address-book`][src-aave-addr-book] — compile-
time import, no hand-typed addresses. Reference values (locked to
Pool V3 deployments at spec time, May 2026):

| Deployment | Constant | `POOL` address |
|---|---|---|
| Ethereum mainnet | `AaveV3Ethereum.POOL` | `0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2` |
| Base | `AaveV3Base.POOL` | (from address-book; package is source of truth) |
| Arbitrum One | `AaveV3Arbitrum.POOL` | `0x794a61358D6845594F94dc1DB02A252b5b4814aD` |

ABI we encode against:

```solidity
function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;
function withdraw(address asset, uint256 amount, address to) external returns (uint256);
```

- `onBehalfOf`: pass the user wallet's address — Aave mints aTokens
  to that address.
- `referralCode`: pass `0`. Referral codes are inactive on v3.
- Withdraw sentinel for full exit: `type(uint256).max` (`2**256 - 1`).
- aTokens (e.g. aUSDC) are rebasing 1:1 with the underlying — we
  read `balanceOf(walletAddress)` on the aToken contract to derive
  the current position USD value.

### B.2 Lido (Ethereum mainnet)

- Lido contract: `0xae7ab96520de3a18e5e111b5eaab095312d7fe84`
- ABI:
  ```solidity
  function submit(address _referral) external payable returns (uint256);
  ```
- Pass `0x0000000000000000000000000000000000000000` as `_referral`
  (or our affiliate address if we negotiate one with Lido).
- stETH balance is **rebasing**: `balanceOf` updates on each daily
  oracle report. No "claim" call needed — interest accrues to the
  stETH balance directly.
- Optional `buildWrap?` step: wrap stETH to wstETH (non-rebasing,
  better DeFi composability). Wrapper contract address fetched from
  the adapter's own constant table; see Lido docs.

### B.3 Curve 3pool (Ethereum mainnet)

- Pool contract: `0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7`
  (`StableSwap3Pool` — DAI / USDC / USDT).
- ABI (Vyper-generated, JSON in repo):
  ```solidity
  function add_liquidity(uint256[3] amounts, uint256 min_mint_amount) external;
  function remove_liquidity(uint256 _amount, uint256[3] min_amounts) external;
  function remove_liquidity_one_coin(uint256 _token_amount, int128 i, uint256 min_amount) external;
  ```
- 3CRV LP token: `0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490`
  (the value our `readPosition` reads).
- `add_liquidity` arg order: `[DAI, USDC, USDT]` — see deployment
  table in Curve readthedocs.

### B.4 Morpho Vaults (Phase 2)

- SDK: [`@morpho-org/blue-sdk`][src-morpho-blue] +
  [`@morpho-org/blue-sdk-viem`][src-morpho-blue-viem] +
  `@morpho-org/morpho-ts`.
- Vaults conform to ERC-4626 (`deposit(uint256 assets, address receiver)`,
  `withdraw(uint256 assets, address receiver, address owner)`,
  etc.) — works the same across Morpho Vault V1 and V2.
- **V2 quirk:** `maxDeposit / maxMint / maxWithdraw / maxRedeem`
  always return zero. Don't gate UI on those — use other limits
  the vault advertises. The adapter must paper over this.
- Vault discovery: Morpho's GraphQL API (`blue-api.morpho.org`)
  exposes curated vaults; we'll wire that into the backend
  `defillama-poll` worker as a secondary source so Morpho vaults
  show up in `OpportunityCache` even when DeFiLlama lags.

### B.5 Jito SOL (Phase 2 — Solana)

- SPL Stake Pool program (shared by all SPL-based LSTs):
  `SPoo1Ku8WFXoNDMHPsrGSTSG1Y47rzgn41SLUNakuHy`
- JitoSOL stake pool: `Jito4APyf642JPZPx3hGc6WWJ8zPKtRbRs4P815Awbb`
- JitoSOL SPL mint: `J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn`
- SDKs we'll consume:
  - `@solana/spl-stake-pool` for the deposit/withdraw instructions
  - `@solana/spl-token` for SPL token ops
  - `@jito-foundation/stake-deposit-interceptor-sdk` for stake-
    account deposits (program ID
    `5TAiuAh3YGDbwjEruC1ZpXTJWdNDS7Ur7VeqNNiHMmGV` on mainnet)
- The Jito adapter returns `UnsignedCall.kind = "solana-ix"` —
  list of `TransactionInstruction`s — which the existing
  `walletKit.sendAnchorInstruction()` accepts directly.

### B.6 LI.FI SDK (Phase 2 — backend-side)

- npm: [`@lifi/sdk`][src-lifi-sdk]
- Init: `createConfig({ integrator: "takumipay" })` (string from
  `LIFI_INTEGRATOR`).
- Primary call: `getQuote({ fromAddress, fromChain, toChain,
  fromToken, toToken, fromAmount })` returns a route the backend
  normalises into our `UnsignedCall[]` shape.
- Status: `getStatus` per step, polled by the worker, surfaced to
  mobile via existing query patterns.

### B.7 Maple Finance — syrupUSDC (Phase 2)

Maple's "syrupUSDC" wraps Maple permissioned-pool lending behind an
ERC-4626 vault token. Treat it as an ERC-4626 vault adapter that
happens to be classified as `kind: "rwa_yield"` for tier-gating
purposes. Coordinates and APY metadata sourced from Maple's docs +
DeFiLlama; placeholder in `services/defi/adapters/maple.ts`.

### B.8 Yearn v3 — Balanced tier (Phase 3)

All Yearn V3 vaults are **fully ERC-4626 compliant** as of the
November 2023 v3 release — deposit/withdraw flows through the
standard `deposit(uint256 assets, address receiver)` /
`withdraw(uint256 assets, address receiver, address owner)`.

- **`Yearn-ERC4626-Router`** at
  `0x1112dbCF805682e828606f74AB717abf4b4FD8DE` on Ethereum, Polygon,
  Optimism (and additional chains over time). Use the router for
  multi-step flows; direct vault calls also work.
- Per-vault `POOL`/asset addresses come from Yearn's published
  registry (link in Appendix C). Don't hardcode individual vaults;
  pull the curated list at backend boot and seed `OpportunityCache`
  from it.
- ABI: standard ERC-4626 — same encoding as the Morpho Vaults adapter
  (B.4). The Yearn adapter and Morpho adapter share an internal
  helper that emits ERC-4626 deposit/withdraw calldata; protocol
  identity lives in `slug` + `kind` (`yield_vault` for Yearn,
  `stablecoin_lending` for Morpho).
- `readPosition`: vault.balanceOf(walletAddress) →
  `convertToAssets(...)` → underlying value.

### B.9 EigenLayer — Balanced tier · restaking (Phase 3)

- **`StrategyManager`** proxy at
  `0x858646372cc42e1a627fce94aa7a7033e7cf075a` on Ethereum mainnet.
- ABI for the deposit primitive:
  ```solidity
  function depositIntoStrategy(IStrategy strategy, IERC20 token, uint256 amount) external returns (uint256 shares);
  ```
  The user supplies a per-LST `IStrategy` address (Lido stETH strategy,
  cbETH strategy, etc.). Withdrawals route through `DelegationManager`
  with a queued-withdrawal flow (unbond delay applies — see
  `WithdrawalDelayBlocks` in EigenLayer docs).
- **Approval preamble required.** Caller must `IERC20(token).approve(StrategyManager, amount)`
  before `depositIntoStrategy`. The EVM adapter emits the standard
  `needsApproval` field on `UnsignedCall` so the executor batches it.
- **Slashing + queue risk** → captured in the risk-model dimensions:
  liquidity-and-exit (queue) + market-exposure (slashing). The
  adapter sets `kind: "restaking"`.

### B.10 Ethena — sUSDe / USDe — Balanced tier · delta-neutral (Phase 3)

- **sUSDe vault contract** at
  `0x9d39a5DE30e57443BfF2A8307A4256c8797A3497` — implements
  ERC-4626 over USDe.
- Deposit: standard ERC-4626 `deposit(uint256 assets, address receiver)`.
  Burns USDe to mint sUSDe; sUSDe appreciates against USDe via the
  4626 share/asset math (yield from delta-neutral perp funding).
- **7-day cooldown on unstaking.** `cooldownAssets` / `cooldownShares`
  start the timer; `unstake(receiver)` after the cooldown collects
  USDe. The adapter exposes this via two optional methods on the
  interface — `buildCooldown?` and `buildClaim?` — both presence-checked,
  consistent with the rule in §7.2.
- `kind: "delta_neutral"`. Liquidity-and-exit dimension penalises
  the score because of the cooldown; UI surfaces it in the
  `OpportunityListCard`.

### B.11 GMX v2 GLP — Aggressive tier · perp-DEX LP (Phase 3)

- Arbitrum-deployment for v3 of the GMX-vault-LP flow (GMX has
  evolved across v1 → v2; coordinates resolved at implementation
  time against GMX's published deployment table — see Appendix C).
- Counterparty risk: **GLP is the counterparty to perp traders.**
  When traders lose, LPs gain; when traders win, LPs pay. The risk
  model captures this through the market-exposure dimension; the
  Aggressive-tier ceiling on the user's `defi_per_action_usd` is
  what keeps a single deposit from being outsized.
- `kind: "lp_volatile"` (or a tighter classification once we land
  the perp-LP-specific UI surface).

### B.12 Hyperliquid LP — Aggressive tier · perp-DEX LP (Phase 3)

- Hyperliquid runs its own L1; SDK calls and address coordinates
  are scoped per-deployment. Treat the Hyperliquid adapter as a
  *fourth chain* under the same docking discipline — the existing
  `Namespace` union widens with a new branch when we ship it
  (parallel to how Sui was added).
- Centralisation risk: Hyperliquid sequencer is a smaller validator
  set than Ethereum / Solana — captured under the chain-and-bridge
  dimension.
- `kind: "lp_volatile"`. Same Aggressive-tier ceiling rule as GMX.

---

## Appendix C — Source citations

Every concrete value cited in this spec — addresses, signatures,
endpoints, SDK package names — comes from one of the sources below.
Verified during spec drafting (May 2026). Update this list as
addresses or doc URLs shift.

### Aave v3

- [Aave V3 Pool docs (aave.com)](https://aave.com/docs/aave-v3/smart-contracts/pool)
  · `supply` / `withdraw` ABI · Pool mainnet `0x87870Bca…fa4E2`.
- [Aave V3 Pool — Arbitrum One (Arbiscan)](https://arbiscan.io/address/0x794a61358d6845594f94dc1db02a252b5b4814ad)
  · Arbitrum One Pool address.
- [`@bgd-labs/aave-address-book` on npm](https://www.npmjs.com/package/@bgd-labs/aave-address-book)
  · canonical address book; `AaveV3Ethereum.POOL`,
  `AaveV3Base.POOL`, etc. import pattern.
- [`aave/aave-v3-core` repo](https://github.com/aave/aave-v3-core)
  · ABI artifacts (`@aave/core-v3/artifacts/.../Pool.json`).

### Lido

- [Lido docs — Lido contract](https://docs.lido.fi/contracts/lido)
  · mainnet address `0xae7a…fe84`, `submit(address _referral)`
  signature, shares semantics.

### Curve 3pool

- [3pool contract on Etherscan](https://etherscan.io/address/0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7)
  · pool address.
- [Curve readthedocs — StableSwap pools](https://curve.readthedocs.io/exchange-pools.html)
  · `add_liquidity` / `remove_liquidity` signatures + token order.
- [`curve-contract` repo](https://github.com/curvefi/curve-contract)
  · Vyper source for `StableSwap3Pool`.
- [3CRV LP token on Etherscan](https://etherscan.io/token/0x6c3f90f043a72fa612cbac8115ee7e52bde6e490)
  · LP token mint address.

### Morpho

- [`@morpho-org/blue-sdk-viem` on npm](https://www.npmjs.com/package/@morpho-org/blue-sdk-viem)
  · viem-augmented SDK; ERC-4626 deposit/withdraw on vaults.
- [Morpho docs — Depositing & Withdrawing](https://docs.morpho.org/build/earn/tutorials/assets-flow/)
- [Morpho docs — Vault Mechanics (ERC-4626)](https://docs.morpho.org/build/earn/concepts/vault-mechanics/)
- [`morpho-org/sdks` repo](https://github.com/morpho-org/sdks)

### DeFiLlama

- [DeFiLlama API reference (api-docs.defillama.com)](https://api-docs.defillama.com/)
  · base URLs (free + pro), endpoint catalog (`/pools`,
  `/protocol/{slug}`, `/overview/fees`, `/stablecoins`,
  `/v2/chains`), free-tier auth rule.

### DeBank

- [DeBank Cloud Open API — API reference (docs.cloud.debank.com)](https://docs.cloud.debank.com/en/readme/api-pro-reference)
  · base URL `https://pro-openapi.debank.com`, `AccessKey` header
  auth, 100 req/s Pro plan rate limit.
- [DeBank Cloud landing (cloud.debank.com)](https://cloud.debank.com/)
  · sign-up + AccessKey provisioning.

### Zerion

- [Zerion API — Getting Started (developers.zerion.io)](https://developers.zerion.io/reference/intro/getting-started)
  · auth header `Authorization: Bearer <key>`.
- [Zerion API — Wallet positions endpoint](https://developers.zerion.io/reference/listwalletpositions)
  · `/wallets/{addr}/positions` shape, testnet `X-Env` header.
- [Zerion API product page](https://zerion.io/api) · plan tiers.

### LI.FI

- [LI.FI SDK install docs (docs.li.fi)][src-lifi-sdk]
  · `@lifi/sdk` package, `createConfig({ integrator })` init,
  `getQuote` API.

### Jito (SPL stake pool)

- [Jito docs — Staking Integration (jito.network)](https://www.jito.network/docs/jitosol/jitosol-liquid-staking/for-developers/staking-integration/)
  · stake-deposit flow, SDK packages.
- [Jito docs — Deployed Programs](https://www.jito.network/docs/jitosol/jitosol-liquid-staking/security/deployed-programs/)
  · SPL Stake Pool program `SPoo1Ku8…uHy`, JitoSOL stake pool
  `Jito4AP…Awbb`, JitoSOL mint `J1toso1u…GCPn`, interceptor
  program `5TAiuAh3…HmGV`.
- [`jito-foundation/jito-stake-unstake-reference`](https://github.com/jito-foundation/jito-stake-unstake-reference)
  · reference integration.

### Yearn v3

- [Yearn docs — Integrating V3 Vaults](https://docs.yearn.fi/developers/v3/Integrating_v3)
  · ERC-4626 compliance, deposit semantics.
- [Yearn docs — yVaults v3 overview](https://docs.yearn.fi/developers/v3/overview)
- [Yearn docs — VaultV3](https://docs.yearn.fi/developers/smart-contracts/V3/VaultV3)
- [`yearn/yearn-vaults-v3` repo](https://github.com/yearn/yearn-vaults-v3)
- [`yearn/Yearn-ERC4626-Router` repo](https://github.com/yearn/Yearn-ERC4626-Router)
  · Router at `0x1112dbCF805682e828606f74AB717abf4b4FD8DE`.

### EigenLayer

- [EigenLayer StrategyManager on Etherscan](https://etherscan.io/address/0x858646372cc42e1a627fce94aa7a7033e7cf075a)
  · mainnet proxy address `0x8586…f075a`.
- [EigenLayer docs — Restaking Smart Contract Developer guide](https://docs.eigenlayer.xyz/restakers/restaking-guides/restaking-developer-guide)
  · `depositIntoStrategy(strategy, token, amount)` flow + approve preamble.
- [`Layr-Labs/eigenlayer-contracts` repo](https://github.com/Layr-Labs/eigenlayer-contracts)
- [`eigenlayer-contracts/docs/core/StrategyManager.md`](https://github.com/Layr-Labs/eigenlayer-contracts/blob/main/docs/core/StrategyManager.md)
  · canonical contract docs.

### Ethena (sUSDe / USDe)

- [Ethena docs — Staking USDe](https://docs.ethena.fi/solution-design/staking-usde)
  · ERC-4626 vault, share/asset math, cooldown semantics.
- [Ethena docs — Staking Key Functions](https://docs.ethena.fi/solution-design/staking-usde/staking-key-functions)
  · `cooldownAssets` / `cooldownShares` / `unstake(receiver)` ABIs.
- [sUSDe ERC-4626 vault on Etherscan](https://etherscan.io/token/0x9d39a5de30e57443bff2a8307a4256c8797a3497)
  · vault address `0x9d39…3497`, ERC-4626 confirmation.

### GMX v2 / Hyperliquid

- [GMX docs — Deployment Addresses](https://docs.gmx.io/docs/api/contracts-v2)
  · v2 deployment table (resolved at adapter implementation time).
- [Hyperliquid docs — Vaults / LPs](https://hyperliquid.gitbook.io/hyperliquid-docs)
  · LP mechanics + SDK references for the Hyperliquid L1.

[src-lifi-sdk]: https://docs.li.fi/integrate-li.fi-js-sdk/install-li.fi-sdk
[src-morpho-blue]: https://www.npmjs.com/package/@morpho-org/blue-sdk
[src-morpho-blue-viem]: https://www.npmjs.com/package/@morpho-org/blue-sdk-viem

---

*End of spec. All design questions resolved in §21.*

*Before merging the Phase 1 PR, the reviewer should walk the
following surfaces once:*

- *Adapter ABIs in §7 + Appendix B — confirm Aave `supply` /
  Lido `submit` / Curve `add_liquidity` signatures still match the
  current chain deployments (vendor SDKs evolve).*
- *§15 enforcement points — JWT binding, dApp-bridge isolation,
  tier ceiling, whitelist enforcement, threshold resolution,
  pause kill-switch. These are the load-bearing safety bits.*
- *§22 env vars — confirm `ZERION_API_KEY` is provisioned and no
  DeFi keys leak into any `EXPO_PUBLIC_*` slot.*
- *§23.10 — the nightly mainnet-fork canary catches vendor SDK
  drift; confirm the CI job is live before the public feature
  flag flips.*
