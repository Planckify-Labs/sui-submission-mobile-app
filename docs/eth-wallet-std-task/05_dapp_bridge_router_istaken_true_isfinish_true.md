# Task 05 — `DappBridge` router

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** `dapp-bridge-spec.md` §4.4, §4.8 ("the one gate"),
§10.4 invariants 1, 5, 6.

## Why this matters

`DappBridge` is the single choke point every dApp request funnels
through (§4.8). Today the same role is played by a 110-line switch
inside `app/dapps-browser.tsx` with `global as any` for pending
state. Moving the routing into one file unlocks Solana / Sui / agent
integration without touching the screen again.

## Scope

Create `services/bridge/DappBridge.ts` — one class (or factory with a
single instance), ~120 LOC target:

- `dispatch(message: WebViewMessage): Promise<void>`:
  1. Parse the message into `{id, namespace, method, params, origin}`.
     Rejects malformed messages with `-32602`.
  2. Look up `ChainAdapterRegistry.get(namespace)` — rejects with
     `4200` if missing.
  3. Emit `BridgeEvent.request` (redacted params).
  4. Call `adapter.handleRequest(req, ctx)`.
  5. On `"resolved"` → post result to WebView, emit
     `BridgeEvent.result`, done.
  6. On `"error"` → post error, emit `BridgeEvent.result(ok:false)`.
  7. On `"needs-approval"` → call `enqueue(intent)` (see below).
- `enqueue(intent)`:
  1. Reject with `-32002` if another intent from the same `origin.url`
     is already pending (§10.4 invariant 5).
  2. Run `runPipeline(intent, "auto")` — merge annotations, verdict,
     patch.
  3. Emit `BridgeEvent.intent(annotatedIntent, verdict)`.
  4. If `verdict === "block"`, auto-reject with `4001`, post back, done.
  5. Otherwise push to `pendingIntents` store, return a promise that
     resolves when `resolve(id, decision)` is called by `ApprovalHost`.
- `resolve(id, decision)`:
  1. Look up intent; 404 → no-op.
  2. Emit `BridgeEvent.decision`.
  3. If reject → post `4001`, remove from store.
  4. If approve → call `adapter.executeApproval(intent, decision, ctx)`,
     post result / error, emit `BridgeEvent.result`.
- `runOnDemandInspector(name, id)` — runs a single inspector for an
  already-enqueued intent (drives task 06's "Ask Takumi AI" button).
- `onNavigate(url)` — called by the screen when the WebView navigates.
  Rejects any pending intent whose `origin.url` host differs (§10.4
  invariant 5). Emits `BridgeEvent.navigate`.

Wire up adapter context from `useWallet` — `activeWallet`, `wallets`,
`setActiveWallet` — via a constructor-injected `AdapterContextProvider`
so the bridge stays testable without React.

Replace all `global as any` / `_pendingTransactionResolve` usage in
`app/dapps-browser.tsx` by routing through this bridge.

## Rules (non-negotiable)

- **Bridge never renders.** No JSX, no React. The `ApprovalHost` (task
  06) is the React seam.
- **Every exit path posts a result to the WebView.** Dangling promises
  are bugs. Wrap `executeApproval` in `try/finally`.
- **Every exit path emits a `BridgeEvent.result`.** Observers can count
  on `request → (intent →)? → result` being complete.
- **Chain mismatch.** If `payload.chainId !== ctx.activeWallet.chainId`
  on a send-tx intent, auto-reject with `4901` before enqueueing
  (§10.4 invariant 6).
- **All observers subscribe via `BridgeEventBus`.** No second channel.

## Acceptance

- [ ] `services/bridge/DappBridge.ts` exists with the methods above.
- [ ] `global as any._pendingTransactionResolve` grep in `app/` returns
      zero results.
- [ ] Unit tests covering: unknown namespace → 4200; duplicate origin
      pending → -32002; navigate-away mid-intent → pending intent
      auto-rejects.
- [ ] Integration test (RN Testing Library) covering resolved and
      needs-approval happy paths using a fake adapter + fake renderer.
- [ ] `pnpm check:syntax` passes.

## Out of scope

- `EvmAdapter` implementation (task 08).
- Rewrite of `app/dapps-browser.tsx` (task 11).
