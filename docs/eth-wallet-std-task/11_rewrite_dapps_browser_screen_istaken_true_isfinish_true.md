# Task 11 — Rewrite `app/dapps-browser.tsx`

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** `dapp-bridge-spec.md` §2 principle 1, §3 audit,
§6 Phase 1a item 7.

## Why this matters

The current screen is ~620 lines and owns WebView lifecycle, address
bar, navigation, **and** approval queueing and EVM routing. After
tasks 01–10, the approval and routing responsibilities live in
`DappBridge` + `ApprovalHost` + renderers. This task strips the
screen back to just the WebView shell.

## Scope

Rewrite `app/dapps-browser.tsx` to own only:

- Address bar + navigation UI.
- WebView component + lifecycle (ref, back/forward, reload,
  go-to-url).
- Building `onMessage` → `DappBridge.dispatch(message)`.
- Feeding `DappBridge.onNavigate(url)` on every navigation.
- Injecting `ChainAdapterRegistry.list().map(a =>
  a.getInjectedScript(ctx)).join("\n")` at load.
- Mounting `<ApprovalHost />` once.

**Target: ≤180 lines.** (Spec §6 says ≤180 for 1a; §2 principle says
~150 overall after all phases settle.)

Delete or relocate:

- `handleEthereumRequest` — already in `EvmAdapter`.
- `pendingAccountRequest` slots and queueing — replaced by
  `pendingIntents`.
- `global as any._pendingTransactionResolve` — replaced by
  `DappBridge.resolve`.
- Direct `viem` imports — move into `EvmAdapter`.

## Rules (non-negotiable)

- **Screen imports nothing from `services/chains/evm/*` directly.**
  Only `services/chains/registry` and `services/bridge/*`.
- **No `viem` imports in `app/dapps-browser.tsx`.** Lint rule if
  feasible.
- **No `eth_*` string literals** in `app/dapps-browser.tsx`.
- **WebView injection order preserved.** Today's injected script
  runs before first paint; this must too.

## Acceptance

- [ ] `wc -l app/dapps-browser.tsx` ≤ 180.
- [ ] `rg -n "viem|eth_|global as any|_pendingTransactionResolve"
      app/dapps-browser.tsx` returns zero matches.
- [ ] `<ApprovalHost />` mounts exactly once.
- [ ] QA: full regression matrix from task 10 passes. Navigating
      away mid-sign auto-rejects (invariant 5).
- [ ] `pnpm check:syntax` passes; `pnpm lint` clean.

## Phase 1a exit criteria (entire phase)

Once this ships, §6 Phase 1a exit criteria are met: every existing
dApp flow works identically, no runtime imports of `viem` outside
`services/chains/evm/`, no uses of `global as any`.

## Out of scope

- UX polish to the address bar.
- Bookmarks, history, other browser features.
