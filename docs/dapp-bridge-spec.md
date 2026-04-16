# DApp Bridge — Engineering Spec (Multi-Chain Docking)

**Status:** Draft
**Owner:** Wallet team
**Scope:** `takumiaiwallet/mobile-app` — `app/dapps-browser.tsx`, `services/ethereumProvider.ts`, `components/dapps-browser/*`, `hooks/useWallet.ts`
**Date:** 2026-04-16

---

## 1. Goal

Turn the DApps browser from an **EVM-hardcoded WebView shim** into a **pluggable bridge** with two well-defined docking ports:

1. **Chain Port** — any blockchain namespace (EVM today, Solana / Sui / Bitcoin / Cosmos tomorrow) plugs in by implementing a single `ChainAdapter` interface. Adding a new chain should touch **zero** files in `app/` or the approval modals.
2. **UI Bridge Port** — every dApp request that needs user consent is converted to a typed **ApprovalIntent** and routed through a single **ApprovalHost**. Any new surface (modal, bottom sheet, agent chat card, hardware signer prompt) is a new `ApprovalRenderer` registered once.

Current EVM behavior must stay byte-identical after Phase 1. Future chains slot in without UI rewrites.

## 2. Guiding principles

1. **The screen is dumb.** `dapps-browser.tsx` owns WebView lifecycle, address bar, navigation — nothing else. It never imports `viem`, never references `eth_*`, never calls `signMessage`. Today it is ~620 lines; target is ~150.
2. **Namespaces are first-class.** Every wallet, every request, every approval carries an explicit `namespace` (CAIP-2 style: `eip155`, `solana`, `sui`). "Ethereum" is not the default — it is one adapter among many.
3. **Two ports, two registries.** Chain adapters and UI renderers are independent. An `eip155:signTypedData` intent can be rendered by the same `SignMessageSheet` that renders `solana:signMessage`, because intents are normalized.
4. **Approvals are data, not callbacks.** An `ApprovalIntent` is a serializable object (`{id, namespace, kind, payload, origin, wallet}`) with a matching `ApprovalDecision` (`{id, outcome: "approve" | "reject", data?}`). No global `_pendingTransactionResolve` hacks.
5. **Injected scripts are adapter-owned.** Each adapter ships its own `getInjectedScript(ctx)` (EIP-1193 for EVM, Wallet Standard for Solana/Sui). The screen concatenates whatever the active adapter set provides.
6. **EIP-6963 from day one.** Even in EVM-only mode, announce via EIP-6963 so we don't collide with future multi-provider dApps and so Solana/Sui can later co-exist on the same page.
7. **Bridge to native UI is reversible.** Any approval that currently lives in `TransactionModal` / `SignMessageModal` must be renderable by an agent-chat card instead, without changing the adapter. This is what makes "agent approves a dApp swap" possible later.

## 3. Current state audit

| Concern | File | Status |
|---|---|---|
| EVM provider injected into WebView | `services/ethereumProvider.ts` | ✅ works, EIP-1193 compatible |
| `dapps-browser.tsx` routes requests | `app/dapps-browser.tsx:132-242` | ⚠️ giant `handleEthereumRequest` switch, EVM-specific |
| Pending approvals via `global as any` | `app/dapps-browser.tsx:166-193` | ❌ resolves stored on `global`, not composable, breaks on reload |
| Modals take raw EVM params | `components/dapps-browser/TransactionModal.tsx` | ⚠️ `transaction: TEvmTxParams` shape hardcoded |
| Wallet selection coupled to account request | `app/dapps-browser.tsx:525-618` | ⚠️ two `pendingAccountRequest` slots, queueing logic inlined |
| `TWallet` has no namespace | `constants/types/walletTypes.ts:4-18` | ❌ no way to distinguish EVM wallet from Solana wallet |
| No EIP-6963 announce | `services/ethereumProvider.ts` | ❌ single-provider clobber of `window.ethereum` |
| Chain switching via `ethereumProvider.setChainId` | `services/ethereumProvider.ts:104` | ⚠️ assumes hex chain id, EVM-only concept |

**Conclusion:** the code works for one chain. Every multi-chain seam is either hardcoded or lives on `global`. We need the ports before we need the chains.

## 4. Architecture — the two docking ports

```
                   ┌──────────────────────────────────────┐
                   │         dapps-browser.tsx            │
                   │  WebView + address bar + nav only    │
                   └───────────────┬──────────────────────┘
                                   │  WebViewMessage
                                   ▼
                   ┌──────────────────────────────────────┐
                   │            DappBridge                │
                   │  (router — owns pending intent map)  │
                   └─────┬──────────────────────────┬─────┘
                         │ resolve request          │ emit ApprovalIntent
                         ▼                          ▼
          ┌──────────────────────────┐   ┌──────────────────────────┐
          │   ChainAdapterRegistry   │   │      ApprovalHost        │
          │  eip155 → EvmAdapter     │   │  sheet | modal | card    │
          │  solana → SolanaAdapter* │   │  (renderer registry)     │
          │  sui    → SuiAdapter*    │   └────────────┬─────────────┘
          └──────────────┬───────────┘                │
                         │                            │ ApprovalDecision
                         ▼                            ▼
                   ┌─────────────┐            ┌──────────────────┐
                   │  viem /     │            │ TransactionSheet │
                   │  @solana/*  │            │ SignMessageSheet │
                   │  @mysten/*  │            │ ConnectSheet     │
                   └─────────────┘            │ AgentChatCard    │
                                              └──────────────────┘
                           * = future phase
```

### 4.1 Port A — `ChainAdapter`

```ts
// services/chains/types.ts
export type Namespace = "eip155" | "solana" | "sui";

export interface ChainRequest {
  namespace: Namespace;
  method: string;           // adapter-native, e.g. "eth_sendTransaction"
  params: unknown;
  origin: { url: string; title?: string };
}

export type ChainResult =
  | { status: "resolved"; value: unknown }
  | { status: "needs-approval"; intent: ApprovalIntent }
  | { status: "error"; code: number; message: string };

export interface AdapterContext {
  activeWallet: TWallet | null;
  wallets: TWallet[];
  setActiveWallet: (index: number) => void;
  getAccount: (wallet: TWallet) => unknown;   // adapter casts
}

export interface ChainAdapter {
  readonly namespace: Namespace;

  /** JS injected into the WebView. EVM → EIP-1193 + EIP-6963.
   *  Solana/Sui → Wallet Standard announce. */
  getInjectedScript(ctx: AdapterContext): string;

  /** Route an RPC method. Returns either a value, an approval
   *  request, or a typed error. Never throws. */
  handleRequest(req: ChainRequest, ctx: AdapterContext): Promise<ChainResult>;

  /** Execute an approved intent and return the on-wire result the
   *  dApp expects (tx hash, signature, account list, etc). */
  executeApproval(
    intent: ApprovalIntent,
    decision: ApprovalDecision,
    ctx: AdapterContext,
  ): Promise<unknown>;

  /** Chain-specific events we want to re-broadcast into the WebView
   *  (accountsChanged, chainChanged, etc). */
  onStateChange?(ctx: AdapterContext): { injectedJs: string } | null;
}
```

### 4.2 Port B — `ApprovalIntent` + `ApprovalHost`

Approvals are **namespace-tagged discriminated unions**. Intent *kinds* are chain-agnostic; intent *payloads* are chain-specific.

```ts
// services/bridge/approval.ts
export type ApprovalKind =
  | "connect"          // dApp wants accounts
  | "signMessage"      // personal_sign, solana:signMessage, …
  | "signTypedData"    // EIP-712 + equivalents
  | "signTransaction"  // sign only, no broadcast
  | "sendTransaction"  // sign + broadcast
  | "switchChain"
  | "addChain";

export interface ApprovalIntent<P = unknown> {
  id: string;                  // uuid, matches the inbound request id
  namespace: Namespace;
  kind: ApprovalKind;
  origin: { url: string; title?: string; icon?: string };
  wallet: TWallet | null;      // null for `connect`
  payload: P;                  // adapter-defined, see §4.3
  createdAt: number;
}

export interface ApprovalDecision {
  id: string;
  outcome: "approve" | "reject";
  data?: unknown;              // e.g. chosen wallet index for `connect`
}

export interface ApprovalRenderer {
  /** Which intents this renderer handles. First match wins. */
  canHandle(intent: ApprovalIntent): boolean;
  /** React component that resolves with a decision. */
  Component: React.ComponentType<{
    intent: ApprovalIntent;
    onDecision: (d: ApprovalDecision) => void;
  }>;
}
```

`ApprovalHost` is a single React component mounted once in the screen. It:
- Subscribes to `DappBridge.pendingIntents$` (a small observable / zustand slice).
- Picks the first registered `ApprovalRenderer` whose `canHandle` returns true.
- Renders it with the intent; forwards the decision back to `DappBridge`.

Adding the agent-chat approval later = register a new renderer that matches `intent.origin.url === "internal://agent"`. **Zero changes to the screen.**

### 4.3 EVM payload shapes (Phase 1 concrete)

```ts
// services/chains/evm/payloads.ts
export type EvmConnectPayload    = { requestedAccounts: number };
export type EvmSignMessagePayload = { message: string; display: "utf8" | "hex" };
export type EvmSignTypedDataPayload = { typedData: TypedDataDefinition };
export type EvmSendTxPayload     = {
  to: `0x${string}`;
  value?: bigint;
  data?: `0x${string}`;
  gas?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  gasPrice?: bigint;
  chainId: number;
};
```

(Solana / Sui payloads are defined when their adapters are added — the union grows, nothing else changes.)

### 4.4 DappBridge

One file, ~120 lines. Responsibilities:
- Parse `WebViewMessage`, dispatch to `registry.get(namespace).handleRequest()`.
- Track `Map<id, {resolve, reject}>` for in-flight requests (replaces `global as any`).
- When an adapter returns `needs-approval`, push the intent onto `pendingIntents$` and wait for `ApprovalHost` to resolve.
- On decision, call `adapter.executeApproval()` and post the result back into the WebView via both `postMessage` and `_handleEthereumResponse` (matches today's dual-path behavior).
- Persist pending intents to `expo-secure-store` so a mid-approval reload leaves a recoverable state (or at minimum, clean rejection on boot).

### 4.5 Wallet namespace

`TWallet` gains a required field:

```ts
export interface TWallet {
  // …existing…
  namespace: Namespace;        // "eip155" for everything today
  chainId?: string | number;   // CAIP-2 reference, adapter-interpreted
}
```

Migration: on app boot, any stored wallet without `namespace` is backfilled with `"eip155"`. `useWallet` exposes `activeNamespace` and `walletsByNamespace`.

### 4.6 Port C — `IntentInspector` (agent-ready seam)

Every approval intent flows through a **middleware chain** before reaching `ApprovalHost`. This is the seam the AI agent plugs into later for scam / phishing / malicious-signature protection. It is defined in Phase 1 so adapters, renderers, and persistence are already inspector-aware — we just don't ship a real inspector yet.

```ts
// services/bridge/inspector.ts
export type RiskSeverity = "info" | "warn" | "danger";

export interface IntentAnnotation {
  /** Stable id for dedup across inspectors (e.g. "evm.unlimited-approval"). */
  code: string;
  severity: RiskSeverity;
  /** Short, human-readable. Renderers surface this. */
  title: string;
  /** Optional longer explanation. Markdown-safe. */
  detail?: string;
  /** Which inspector produced this. For UI attribution + telemetry. */
  source: "local" | "agent" | "allowlist" | "simulation" | string;
  /** Optional structured data for renderers (e.g. decoded calldata). */
  data?: unknown;
}

export interface InspectionResult {
  /** Annotations appended to the intent. Order preserved. */
  annotations: IntentAnnotation[];
  /** Hard decision an inspector can impose. Only the agent / allowlist
   *  should use "block"; local heuristics should stay at "warn". */
  verdict: "allow" | "require-extra-confirmation" | "block";
  /** Optional intent mutation — simulation may fill in decoded fields,
   *  the agent may attach a human-readable summary. Never changes
   *  security-critical values (to, value, data). */
  patch?: Partial<ApprovalIntent["payload"]>;
}

export interface IntentInspector {
  readonly name: string;         // "agent", "phishing-list", "tenderly-sim", …
  readonly priority: number;     // lower runs first; agent is last
  /** "auto" runs on every intent before the sheet opens.
   *  "on-demand" only runs when the user taps a button in the sheet
   *  (e.g. "Ask Takumi AI to review"). Keeps the default path fast
   *  and cheap; heavy/agentic work is opt-in per-intent. */
  readonly mode: "auto" | "on-demand";
  inspect(
    intent: ApprovalIntent,
    prior: IntentAnnotation[],    // what earlier inspectors found
    signal: AbortSignal,          // user may cancel while we wait
  ): Promise<InspectionResult>;
}
```

**Pipeline contract** (implemented in `DappBridge`):

1. Intent is produced by `adapter.handleRequest()`.
2. Run all registered inspectors in `priority` order. Each sees the intent + annotations from earlier inspectors.
3. Merge: `annotations` are concatenated (dedup by `code`); `verdict` is the **strictest** any inspector returned (`block` > `require-extra-confirmation` > `allow`); `patch` is shallow-merged into the intent payload but **only non-security fields** (renderers get an annotated copy, adapters still execute the original).
4. Push the annotated intent to `pendingIntents$`. Renderers render annotations prominently.
5. If `verdict === "block"`, the renderer shows a blocking screen with reject-only (no approve button) and posts `-32003` (request rejected) back to the dApp.
6. If `verdict === "require-extra-confirmation"`, the renderer requires a secondary gesture (typed confirm, hold-to-approve) — renderer-defined.
7. On decision, `DappBridge` emits a terminal `IntentOutcomeEvent` (see §4.7) so inspectors can learn from user overrides.

**Phase 1 ships:**
- The interface, registry, pipeline, merge logic, renderer prop `intent.annotations`.
- One trivial built-in inspector: **`HttpsInspector`** (adds an `info` annotation if `origin.url` is `http://`). Proves the pipeline works end-to-end.
- Renderer work: `<ApprovalShell>` renders a `<RiskBanner annotations={…} />` at the top of every sheet. Empty array → nothing shown.

**Phase 5 (future, out of scope now):** real inspectors. See §6 for the staircase.

### 4.7 Port D — `BridgeEventBus` (read-only stream)

Not every RPC call needs approval, but the agent will still want to see the whole story (which dApp, which chain, what it asked for, what was simulated, what the user decided). We expose a single event bus the agent subscribes to when it comes online — local-only until the agent wires in.

```ts
// services/bridge/events.ts
export type BridgeEvent =
  | { kind: "request";   at: number; id: string; namespace: Namespace; method: string; origin: Origin; params: unknown }
  | { kind: "intent";    at: number; intent: ApprovalIntent; annotations: IntentAnnotation[]; verdict: InspectionResult["verdict"] }
  | { kind: "decision";  at: number; id: string; outcome: "approve" | "reject"; latencyMs: number }
  | { kind: "result";    at: number; id: string; ok: boolean; value?: unknown; error?: { code: number; message: string } }
  | { kind: "navigate";  at: number; url: string; title?: string };

export interface BridgeEventSink {
  emit(e: BridgeEvent): void;
}
```

`DappBridge` owns a `BridgeEventBus` with an in-memory ring buffer (last N events, default 200). Sinks register at boot:

- **`ConsoleSink`** (dev builds only) — logs everything.
- **`TelemetrySink`** (opt-in) — forwards to PostHog with PII scrubbed.
- **`AgentSink`** (future) — ships events to `takumi-agent-api` over the existing chat channel as system messages the agent can reason over.

No PII leaves the device without an explicit sink. Sensitive fields (`params` of `personal_sign`, private-data in typed data) are redacted before emission — the agent sees structure + metadata, not secrets, unless the user explicitly opted in for a specific inspection.

### 4.7a "Ask Agent" — inline, no screen switch

The approval sheet includes a **"Ask Takumi AI to review"** button (shown whenever at least one `on-demand` inspector is registered for the intent's namespace). Tapping it:

1. Calls `DappBridge.runOnDemandInspector("agent", intentId)`.
2. `DappBridge` invokes only that inspector, with the same pipeline plumbing (timeout, abort, merge, dedup).
3. The sheet stays open. The `<RiskBanner>` at the top switches to a streaming state: spinner → partial annotations as they stream in → final verdict.
4. Agent findings merge into `intent.annotations` like any other source — the sheet already renders them, so **no new UI surface is needed**. No navigation, no modal-on-modal, no context switch. The user's finger never leaves the approval.
5. If the agent returns `verdict: "block"`, the approve button disables and the sheet reveals a reject-only tail — same pattern as an auto-blocking inspector.
6. Streaming uses the existing agent chat transport; findings are also emitted as `BridgeEvent`s so the conversation history gains a breadcrumb ("Reviewed a sign request from foo.xyz") without opening chat.

Concretely: the button is rendered by `<ApprovalShell>`, so every chain's renderer gets it for free. Adapters, payloads, and the request spine are untouched — "ask agent" is purely an inspector invocation from the UI.

### 4.8 The unified gate — single choke point, any chain

To answer the design question directly: **yes, every dApp request from every chain funnels through exactly one gate.** That gate is `DappBridge`. The architectural guarantee:

```
  WebView (any dApp)                      Agent / future surfaces
        │                                           │
        │ chain-native RPC                          │ internal request
        ▼                                           ▼
   ┌────────────────────────────────────────────────────────┐
   │                      DappBridge                        │ ← the one gate
   │  1. Normalize: ChainRequest → adapter.handleRequest()  │
   │  2. If approval needed: build ApprovalIntent           │
   │     (chain-agnostic kind + chain-specific payload)     │
   │  3. Run InspectorPipeline (auto inspectors)            │
   │  4. Emit BridgeEvent(intent, annotations, verdict)     │
   │  5. Hand to ApprovalHost → renderer → decision         │
   │  6. Optional on-demand inspector (user-triggered)      │
   │  7. adapter.executeApproval() + post result to WebView │
   │  8. Emit BridgeEvent(result)                           │
   └────────────────────────────────────────────────────────┘
```

Invariants enforced in code (not just docs):

- **Only `DappBridge` instantiates `ApprovalIntent`.** Constructor is not exported; intents are produced via `DappBridge.enqueue()`. Lint rule or package boundary enforces this.
- **Adapters never touch the UI.** `ChainAdapter` has no React imports. The only way for a chain to reach the user is by returning `{ status: "needs-approval", intent }`.
- **Renderers never touch adapters.** Sheets receive `ApprovalIntent` + `onDecision`; they cannot call `viem`, `@solana/web3.js`, etc. Execution belongs to `adapter.executeApproval()`.
- **Inspectors never touch adapters or renderers.** They see a frozen intent, return annotations. Nothing else.
- **All observers subscribe to `BridgeEventBus`.** Agent, telemetry, history, devtools — there is no second channel.

Net result: whether the request comes from an EVM Uniswap page, a Solana Jupiter embed, a Sui DEX, or a future WalletConnect pairing, it lands in the **same** `ApprovalIntent` shape, passes through the **same** inspector pipeline, is logged on the **same** event bus, and reaches the user through the **same** `ApprovalHost`. The agent (and any future defender) learns one schema, not N.

### 4.9 Why both Inspector and EventBus?

- **Inspector** is **synchronous and authoritative** — it can block, warn, annotate a specific intent. Deadline-bound (default 2s timeout; on timeout the intent passes with an `info` annotation noting "inspection skipped"). Blocks the UI.
- **EventBus** is **asynchronous and observational** — fire-and-forget stream for context, learning, cross-intent reasoning ("this user just connected to a site that looks like the one they visited yesterday with a typo"). Never blocks the UI.

The agent uses both: bus for context, inspector for the actual decision on the current intent.

## 5. File layout (target)

```
services/
  bridge/
    DappBridge.ts             ← router, pending-intent map, inspector pipeline
    approval.ts               ← ApprovalIntent, ApprovalDecision, renderer types
    ApprovalHost.tsx          ← picks renderer, renders it
    pendingIntents.ts         ← zustand slice, persists to SecureStore
    inspector.ts              ← IntentInspector, InspectionResult, registry
    inspectors/
      HttpsInspector.ts       ← Phase 1 built-in (trivial, proves pipeline)
      AgentInspector.ts       ← Phase 5 stub
    events.ts                 ← BridgeEvent, BridgeEventBus, sinks
    redact.ts                 ← scrub params before events leave the device
  chains/
    registry.ts               ← namespace → ChainAdapter
    types.ts                  ← ChainAdapter, ChainRequest, ChainResult
    evm/
      EvmAdapter.ts
      injectedScript.ts       ← moved from services/ethereumProvider.ts
      eip6963.ts              ← announce helper
      payloads.ts
    solana/                   ← Phase 3
    sui/                      ← Phase 3
  permissions/
    store.ts                  ← per-origin grants (EIP-2255), SecureStore-backed
    caip.ts                   ← CAIP-2 / CAIP-10 helpers, origin hashing
  decoders/
    permit2.ts                ← Permit2 typed-data decoder
    erc2612.ts                ← ERC-20 permit decoder
    calldata.ts               ← 4byte selector → human-readable (via local db)
    seaport.ts                ← OpenSea Seaport order decoder (opt-in)
components/
  dapps-browser/
    approvals/
      ApprovalShell.tsx       ← shared chrome: origin badge, wallet, RiskBanner, "Ask AI" button
      EvmTransactionSheet.tsx ← was TransactionModal; handles legacy/2930/1559/7702 tx types
      EvmBatchCallsSheet.tsx  ← EIP-5792 wallet_sendCalls UX
      EvmSignMessageSheet.tsx ← personal_sign + EIP-712 with decoded Permit2/2612 view
      ConnectSheet.tsx        ← was WalletSelectorModal usage; writes EIP-2255 grant
      AddChainSheet.tsx       ← EIP-3085 wallet_addEthereumChain
      SwitchChainSheet.tsx    ← EIP-3326 wallet_switchEthereumChain
      WatchAssetSheet.tsx     ← EIP-747 wallet_watchAsset
      renderers.ts            ← ApprovalRenderer[] registration
app/
  dapps-browser.tsx           ← ~150 lines, WebView + DappBridge + ApprovalHost
```

## 6. Phased rollout

### Phase 1 — Ports + production-complete EVM (2 PRs)

**Split into 1a (plumbing, behavior-identical) and 1b (compliance, new methods + UX). Both must land before Phase 2 starts.**

#### Phase 1a — Extract ports, behavior-identical

- [ ] Add `services/chains/{types,registry}.ts`.
- [ ] Add `services/bridge/{DappBridge,approval,ApprovalHost,pendingIntents,inspector,events,redact}.ts` + the `HttpsInspector` stub.
- [ ] Move `services/ethereumProvider.ts` logic into `services/chains/evm/EvmAdapter.ts`. Delete the `global as any` resolves — route via `DappBridge`.
- [ ] Move injected-script builder to `services/chains/evm/injectedScript.ts`. Add **EIP-6963** announce.
- [ ] Rename modals to `EvmTransactionSheet` / `EvmSignMessageSheet`, accept `ApprovalIntent<…>` instead of raw params. Register in `renderers.ts`.
- [ ] Add `namespace` to `TWallet`, backfill on boot in `useWallet`.
- [ ] Rewrite `app/dapps-browser.tsx` to: mount WebView, feed messages to `DappBridge`, render `ApprovalHost`. Target ≤180 lines.
- [ ] `ApprovalShell` with origin badge, wallet header, `<RiskBanner>` slot, "Ask Takumi AI" button (hidden until Phase 5, but wired through `runOnDemandInspector`).
- [ ] QA: connect, personal_sign, eth_sign, signTypedData_v4, eth_sendTransaction, chain switch, reject paths, wallet switch mid-session.

**1a exit criteria:** every existing dApp flow works identically; no runtime imports of `viem` outside `services/chains/evm/`; no uses of `global as any`.

#### Phase 1b — EVM compliance for production

Closes the gap to a production-grade EVM wallet. All items in §10 marked **P1** must be green. Specifically:

- [ ] **EIP-3085** `wallet_addEthereumChain` → `AddChainSheet`; writes to a user-editable chain list; validates RPC reachability before accepting.
- [ ] **EIP-3326** `wallet_switchEthereumChain` → `SwitchChainSheet`; returns `4902` when target chain not added; coordinates with `useWallet.setActiveChain`.
- [ ] **EIP-747** `wallet_watchAsset` (ERC-20 + ERC-721/1155) → `WatchAssetSheet`; persists into the token list shown in the home screen.
- [ ] **EIP-2255** `wallet_getPermissions` / `wallet_requestPermissions` / `wallet_revokePermissions`. `PermissionStore` keyed by `(originHash, walletAddress)`; grants persisted to `SecureStore`. `ConnectSheet` writes the grant. Settings screen (`app/settings/dapp-permissions.tsx`) lists and revokes.
- [ ] **EIP-5792** `wallet_sendCalls` / `wallet_getCallsStatus` / `wallet_showCallsStatus`. New `ApprovalKind: "sendCalls"` with `EvmBatchCallsPayload`. `EvmBatchCallsSheet` renders each call as a step with per-call decoded summary. Execution strategy: sequential `sendTransaction` for EOAs (and return a synthetic bundle id); native batch when targeting a smart account (gated by Phase 1c).
- [ ] **Transaction type coverage**: legacy (type 0), EIP-2930 access list (type 1), EIP-1559 dynamic fee (type 2). Normalize at the adapter boundary; `EvmSendTxPayload` gets a `type` discriminant.
- [ ] **Gas re-estimation**: adapter always calls `eth_estimateGas` + `eth_feeHistory` when the dApp omits or lowballs; sheet shows "wallet-estimated" vs "dApp-requested" side by side, user picks.
- [ ] **Nonce strategy**: track pending nonce per-wallet-per-chain; auto-detect stuck txs; offer "speed up" / "cancel" (new nonce = current, higher fee, empty data to self).
- [ ] **ERC-1271 / EIP-6492** signature **validation** in `EvmAdapter.verifySignature()` (exposed for SIWE + backend auth). Smart-wallet signatures from Safe/Argent validate without the wallet needing to be the signer EOA.
- [ ] **Permit2 + ERC-2612 decoders**: `decoders/{permit2,erc2612}.ts`. `EvmSignMessageSheet` displays `Spender: foo.xyz  |  Token: USDC  |  Amount: Unlimited ⚠️` instead of raw JSON whenever the typed data matches. Unlimited approvals get an automatic `warn` annotation from a built-in `ApprovalHeuristicInspector`.
- [ ] **Calldata selector decoder**: local 4byte db (~30KB gzipped) for the top N selectors (`approve`, `transferFrom`, `swap*`, `multicall`, Seaport `fulfill*`). Fallback: show raw hex + selector + "unknown function". Shown in `EvmTransactionSheet`.
- [ ] **SIWE compatibility**: `EvmSignMessageSheet` detects EIP-4361 format, parses it, renders `Domain / URI / Chain / Nonce / Issued At` as a structured block instead of raw text. Annotates if domain mismatches origin.
- [ ] **Error-code contract**: adapter returns standard `ProviderRpcError` codes — `4001` user rejected, `4100` unauthorized, `4200` unsupported method, `4900` disconnected, `4901` chain not connected, `4902` chain not added, `-32002` resource unavailable (pending request), `-32602` invalid params, `-32603` internal. Unit-tested per method.
- [ ] **EIP-1102 / `eth_accounts`**: respects `PermissionStore` — returns `[]` (not the active address) when origin has no grant. Fixes a privacy leak the current implementation has.

**1b exit criteria:** §10 compliance matrix all **P1** rows ship. Smoke test against Uniswap, Aave, OpenSea, Zerion, Safe app, a SIWE login, and at least one EIP-5792 dApp (Rainbow's test page).

#### Phase 1c — Smart account support (required for GA)

**Decision:** ship in GA, not deferred. Rationale:

- `TWallet.type` shape changes with smart accounts; shipping it post-GA forces a storage migration on every user. Cheaper to land it once.
- EIP-7702 went live on mainnet (Pectra, May 2025). Production peers (Coinbase, Rainbow, Zerion) ship batching + sponsored gas by default. Launching without it looks dated on day one.
- EIP-5792 (already in P1b) is the front door for both EOA-batching and smart-account batching. Shipping 5792 without smart-account support leaves the paymaster/atomic-batch branches as dead code.
- Default wallet type stays **EOA**. Smart accounts are an *additional* creation option, not a forced migration. Existing users are untouched until they opt in.

Scope:

- [ ] **`TWallet.type` extension**: add `"Smart4337"` and `"Smart7702"`. Existing `"PrivateKey" | "SeedPhrase" | "Social"` entries are treated as EOAs. `useWallet` exposes `isSmartAccount(wallet)` helper.
- [ ] **ERC-4337 execution path**: when `activeWallet.type === "Smart4337"`, `EvmAdapter.executeApproval` builds a `UserOperation` (via `viem/account-abstraction`), submits to the configured bundler, and returns the resulting tx hash once mined. `wait()` strategy shared with regular txs.
- [ ] **EIP-7702 delegation**: `wallet_sendCalls` for EOAs can opt into a one-time `signAuthorization` intent (`kind: "signAuthorization"`, new ApprovalKind) that delegates the EOA to a known delegator contract (allowlisted: we pick one audited default). Subsequent calls in the batch run atomically via the delegator. Authorization is re-requested per-chain on expiry.
- [ ] **`wallet_getCapabilities` reporting**: returns `{atomicBatch: {supported: true}, paymasterService: {supported: ...}}` keyed by address + chain. Drives dApp behavior (Uniswap etc. use this to decide whether to request batching).
- [ ] **Paymaster selection**: `EvmTransactionSheet` and `EvmBatchCallsSheet` show a fee-source selector (`Pay with ETH` / `Sponsored` / `Pay with USDC/USDT`). Smart accounts use ERC-7677 paymaster service; EOAs on 7702 can also consume it when the delegator supports paymaster calls.
- [ ] **Smart-account creation flow**: new entry in wallet-creation UI ("Smart wallet — gasless transactions, social recovery"). Out of spec scope for the *bridge*; tracked in wallet-creation spec. But `EvmAdapter` and sheets must handle smart accounts from day one even if the creation UI ships a release later.
- [ ] **Fallback path**: if the configured bundler/paymaster is unreachable, `executeApproval` falls back to direct EOA send (when the wallet still has a controlling key) with a visible `warn` annotation. Never silently degrade; always tell the user.
- [ ] **Recovery signer support**: smart accounts with a recovery guardian must not re-sign via the bridge without an explicit recovery intent. (Gating rule to catch future footguns.)

**1c exit criteria**:

- An EIP-5792 `wallet_sendCalls` against a 4337 smart wallet executes atomically on a supported chain (Base, OP, Arb).
- The same call against a regular EOA with `type === "PrivateKey"` executes sequentially (no 7702), producing the same `bundleId` contract.
- The same call against an EOA the user opts into 7702 delegation for executes atomically via the delegator.
- Paymaster-sponsored tx works end-to-end on one chain.
- `wallet_getCapabilities` returns correct shape for all three wallet types.

### Phase 2 — Agent-bridged approvals (1 PR)

- [ ] Register an `AgentCardRenderer` that matches intents tagged `origin.via === "agent"`.
- [ ] Expose `DappBridge.submitAgentIntent(intent)` so `takumi-agent-api` tool calls can route through the same approval spine instead of bespoke cards.
- [ ] `PendingTxCard` / `ApprovalSheet` in `components/home/TakumiAgent` become `ApprovalRenderer` implementations.

**Exit criteria:** an agent-initiated swap and a dApp-initiated swap produce the same `ApprovalIntent<EvmSendTxPayload>`, differ only by `origin`. The approval UI can be swapped per-origin without adapter changes.

### Phase 3 — Second chain (Solana recommended first) (1 PR)

- [ ] `services/chains/solana/SolanaAdapter.ts`:
  - Injects Wallet Standard registration (`@wallet-standard/core`).
  - Maps `solana:signAndSendTransaction` → `ApprovalIntent<SolanaSendTxPayload>`.
  - Uses `@solana/web3.js` for signing.
- [ ] Add `SolanaTransactionSheet` + `SolanaSignMessageSheet`. Reuse shared chrome (origin badge, wallet header) from a `<ApprovalShell>` wrapper.
- [ ] Extend `TWallet` creation flows to mint Solana wallets (separate spec — out of scope here).

**Exit criteria:** a Solana dApp (e.g. a Jupiter embed) connects, signs a message, and sends a transaction without touching `app/dapps-browser.tsx` or any EVM file.

### Phase 4 — Sui + beyond

Each new chain is one adapter + one set of payload types + one or two sheets. The screen never changes.

### Phase 5 — AI-powered protection (separate future spec)

The seams from §4.6 and §4.7 light up. Rough staircase, in increasing order of risk/power:

1. **`AllowlistInspector`** — local JSON of known-good dApp origins. Annotates, never blocks. No network, no agent.
2. **`PhishingListInspector`** — periodic fetch of a homograph / blocklist feed. Blocks on hard matches. Still no agent.
3. **`SimulationInspector`** — runs `eth_call` / Tenderly / custom simulator on `sendTransaction` intents; annotates balance deltas, unlimited approvals, contract-creation payloads. Local verdict only.
4. **`AgentInspector`** — ships the annotated intent + recent `BridgeEvent` ring buffer to `takumi-agent-api`, waits up to 2s for structured verdict (`{verdict, annotations[]}`). Graceful degradation on timeout. User can opt out per-origin.
5. **Decoded-signature UX** — renderers consume `patch.decoded` (human-readable Permit2, Seaport order, etc.) produced by inspectors. No new seams — just richer annotations.

**Why this order:** each rung fails safe if the one above fails. Agent never becomes a single point of failure for approving a dApp transaction. User always has the final approve/reject unless `verdict === "block"` from a deterministic list match.

## 7. Test plan

| Layer | Test |
|---|---|
| `EvmAdapter.handleRequest` | unit — every method branch returns the expected `ChainResult` shape |
| `DappBridge` | unit — pending map resolves correctly on approve/reject; rejects on unknown namespace |
| `ApprovalHost` | RTL — picks the right renderer; forwards decision |
| EIP-6963 | manual — MetaMask-style multi-provider page sees "Takumi" announced |
| End-to-end | manual matrix on opensea-testnet, uniswap-sepolia, raydium-devnet (Phase 3) |

## 8. Open questions

1. **WalletConnect v2 as a second transport.** Do we expose the same `DappBridge` over a WC pairing so external dApps (desktop) connect to our mobile wallet? The approval spine is already chain-agnostic — only the transport differs. Flag for a follow-up spec.
2. **Bundler + paymaster providers.** Phase 1c needs a concrete choice (Pimlico / Biconomy / Alchemy / self-hosted) and a sponsorship policy (who pays, on which chains, with what caps). Engineering can pick a default; product decides the sponsorship budget later.
3. **Default 7702 delegator contract.** Which audited delegator do we allowlist as the default (Biconomy's `BaseAccount`, Metamask's delegator, a self-deployed fork)? Affects user security posture. Recommend: ship with one well-known default, make it swappable via app config.
4. **Hardware signer renderer.** A Ledger/NFC renderer would plug into `ApprovalHost` the same way as a modal. Worth noting now so we don't paint ourselves into a modal-only corner.
5. **Chain list source of truth.** EIP-3085 adds chains — do we merge user-added chains with a curated default list from `chainlist.org`, or require users to add everything explicitly? Affects onboarding friction.
6. **Seaport / Uniswap Universal Router decoders.** Scope creep beyond Permit2/2612 is unbounded (every protocol has bespoke typed data). Recommend: ship Permit2 + ERC-2612 in Phase 1b, anything else moves to Phase 5's `SimulationInspector` which renders human-readable summaries via simulation rather than hand-written decoders.

## 9. Non-goals

- Replacing `useWallet` or the wallet-creation flows.
- Shipping Solana/Sui wallet creation (separate spec).
- Changing the agent chat's existing UX — Phase 2 only unifies the plumbing behind it.
- Adding WalletConnect — noted as follow-up.
- **Shipping a real AI inspector in Phase 1.** §4.6 / §4.7 only ship the seams + one trivial built-in inspector. Real protection arrives in Phase 5 under its own spec. The goal today is that when Phase 5 lands, **not a single adapter or renderer file needs to change** — agent plugs into ports already in production.

## 10. EVM compliance matrix

**Legend:** **P1a** = plumbing refactor • **P1b** = production compliance • **P1c** = smart account support • **P2+** = post-GA. **All P1 rows (a/b/c) must ship before GA.** Error codes follow EIP-1193 + EIP-1474.

### 10.1 JSON-RPC methods

| Method | Phase | Approval? | Renderer | Notes / EIP |
|---|---|---|---|---|
| `eth_accounts` | P1b | No | — | Returns `[]` when origin has no EIP-2255 grant (privacy fix) |
| `eth_requestAccounts` | P1a | Yes | `ConnectSheet` | EIP-1102; writes EIP-2255 grant |
| `eth_chainId` / `net_version` | P1a | No | — | Read-through to adapter state |
| `eth_blockNumber`, `eth_getBalance`, `eth_call`, `eth_getCode`, `eth_getStorageAt`, `eth_getLogs`, `eth_getTransactionByHash`, `eth_getTransactionReceipt`, `eth_estimateGas`, `eth_gasPrice`, `eth_maxPriorityFeePerGas`, `eth_feeHistory`, `eth_getBlockBy*`, `eth_getTransactionCount` | P1a | No | — | Proxied to the active chain's RPC; no approval |
| `eth_sendTransaction` | P1b | Yes | `EvmTransactionSheet` | Supports type 0/1/2 + (P1c) 4337 UserOp / 7702 set-code |
| `eth_sendRawTransaction` | P1b | Yes* | `EvmTransactionSheet` | *Requires decoding + re-confirmation; most dApps don't use this, but we must handle it safely |
| `eth_sign` | P1a | Yes | `EvmSignMessageSheet` | Warn banner: legacy, dangerous |
| `personal_sign` | P1a | Yes | `EvmSignMessageSheet` | EIP-191; auto-detect SIWE (EIP-4361) and render structured view |
| `eth_signTypedData` (v1) | P1b | Yes | `EvmSignMessageSheet` | Warn as legacy; render decoded if Permit2/2612 |
| `eth_signTypedData_v3` | P1a | Yes | `EvmSignMessageSheet` | EIP-712 |
| `eth_signTypedData_v4` | P1a | Yes | `EvmSignMessageSheet` | EIP-712; Permit2/2612 decoder renders human view |
| `eth_subscribe` / `eth_unsubscribe` | P2 | No | — | Defer; most mobile dApps poll |
| `wallet_addEthereumChain` | P1b | Yes | `AddChainSheet` | EIP-3085; validate RPC reachability |
| `wallet_switchEthereumChain` | P1b | Yes | `SwitchChainSheet` | EIP-3326; returns `4902` if not added |
| `wallet_getPermissions` | P1b | No | — | EIP-2255; reads `PermissionStore` |
| `wallet_requestPermissions` | P1b | Yes | `ConnectSheet` | EIP-2255 |
| `wallet_revokePermissions` | P1b | No | — | EIP-2255; also callable from settings UI |
| `wallet_watchAsset` | P1b | Yes | `WatchAssetSheet` | EIP-747; ERC-20 + 721/1155 |
| `wallet_sendCalls` | P1b | Yes | `EvmBatchCallsSheet` | EIP-5792; EOA = sequential, smart account = native batch |
| `wallet_getCallsStatus` | P1b | No | — | EIP-5792 |
| `wallet_showCallsStatus` | P1b | No | — | EIP-5792; opens internal tx history screen |
| `wallet_getCapabilities` | P1b | No | — | EIP-5792 companion; advertises `atomicBatch`, `paymasterService`, `auxiliaryFunds` |
| `wallet_grantPermissions` | P2 | Yes | TBD | ERC-7715 (session keys); defer to after smart-account lands |
| `wallet_scanQRCode` | P2 | No | — | Optional; routes to camera |

### 10.2 Required standards (enforced via code)

| EIP / ERC | Area | Phase | Implementation note |
|---|---|---|---|
| **EIP-1193** | Provider interface | P1a | `window.ethereum` + event emitter |
| **EIP-1102** | `eth_requestAccounts` | P1b | Gated by `PermissionStore` |
| **EIP-6963** | Multi-provider discovery | P1a | Announce on inject + on `eip6963:requestProvider` |
| **EIP-191** | `personal_sign` framing | P1a | Already handled by viem `signMessage` |
| **EIP-712** | Typed data | P1a | viem `signTypedData` |
| **EIP-1559** | Dynamic fee market | P1b | Default for chains that support it |
| **EIP-2930** | Access list tx | P1b | Pass-through; rare but must not reject |
| **EIP-2255** | Permissions | P1b | `services/bridge/permissions/store.ts` |
| **EIP-3085** | `wallet_addEthereumChain` | P1b | User-editable chain list |
| **EIP-3326** | `wallet_switchEthereumChain` | P1b | Coordinates with `useWallet` |
| **EIP-3668** | CCIP-read | P1b | Automatic on ENS resolution (viem default) |
| **EIP-4361** | Sign-In with Ethereum | P1b | Parse + structured render; backend already supports |
| **EIP-4844** | Blob tx (type 3) | P2 | Reject with clear error (wallets rarely originate blobs) |
| **EIP-5792** | Batched calls | P1b | Core UX primitive going forward |
| **EIP-6963** | Multi-provider | P1a | See above |
| **EIP-7702** | EOA delegation | P1c | Optional now, required before shipping smart UX |
| **ERC-20** | Token transfer, approve, permit (2612) | P1b | Decoder + watchAsset |
| **ERC-721 / ERC-1155** | NFTs | P1b | `watchAsset` + calldata decoder |
| **ERC-1271** | Contract signatures | P1b | Validate signatures *from* smart wallets (SIWE/backend auth) |
| **ERC-2612** | Permit | P1b | Signature decoder |
| **ERC-4337** | Smart accounts | P1c | Bundler + paymaster wiring |
| **ERC-6492** | Pre-deploy sig validation | P1b | Companion to 1271 for counterfactual wallets |
| **ERC-7677** | Paymaster service | P1c | Only if shipping sponsored UX |
| **Permit2 (Uniswap)** | Universal permit | P1b | Decoder → human-readable spender/amount/deadline |

### 10.3 Error code contract

Every `EvmAdapter.handleRequest` error path must return one of:

| Code | Meaning | When |
|---|---|---|
| `4001` | User rejected | User tapped reject in any sheet |
| `4100` | Unauthorized | Origin has no EIP-2255 grant for the requested account/chain |
| `4200` | Unsupported method | Adapter has no branch for the method |
| `4900` | Disconnected | No active wallet |
| `4901` | Chain not connected | Active wallet exists but target chain is unreachable |
| `4902` | Chain not added | `wallet_switchEthereumChain` before `wallet_addEthereumChain` |
| `-32002` | Resource unavailable | Another request is pending for this origin |
| `-32602` | Invalid params | Shape validation failed (Zod schema at adapter boundary) |
| `-32603` | Internal error | Anything else; never bubble raw errors to dApp |

### 10.4 Security invariants (audited before GA)

1. **No raw signing without an origin.** Every `signMessage` / `signTypedData` / `sendTransaction` must carry an `origin.url`. `DappBridge` refuses intents without one.
2. **`eth_sign` warning.** Always rendered with a `danger` annotation even before inspectors run.
3. **Unlimited ERC-20 approvals.** Auto-annotated `warn` by `ApprovalHeuristicInspector`; sheet requires hold-to-confirm.
4. **Address displayed in full** in the sheet on first hover/tap. Truncation in summary, full address always one tap away. Prevents address-poisoning from homograph dApps.
5. **Origin pinning for pending requests.** Once a request is pending, navigating the WebView to a different origin rejects it automatically (`-32002`).
6. **Chain mismatch guard.** If `dapp.chainId !== wallet.chainId`, `sendTransaction` is rejected with `4901` rather than silently signing on the wrong chain.
7. **SIWE domain check.** `EvmSignMessageSheet` annotates `danger` if the SIWE `domain` does not match `origin.host`.
8. **Redaction of message contents** before emission on `BridgeEventBus`. Structure goes through; payloads are replaced with length + hash unless an inspector has opted in.

### 10.5 Go/no-go checklist for GA

- [ ] All §10.1 rows tagged P1a/P1b/P1c implemented and unit-tested.
- [ ] All §10.2 rows tagged P1a/P1b/P1c shipping in code.
- [ ] All §10.3 error codes returned by the matching paths (test coverage per row).
- [ ] All §10.4 invariants covered by integration tests.
- [ ] Third-party smoke test: Uniswap, Aave, OpenSea (Seaport sign), Zerion, Safe dApp, a SIWE login, a Rainbow EIP-5792 test page, an Argent/Safe smart wallet signing via ERC-1271, one sponsored-gas tx via paymaster, one 7702-delegated batch tx.
- [ ] Security review sign-off on §10.4 + the chosen 7702 delegator contract before first store submission.
