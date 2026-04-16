# Task 06 — `ApprovalHost` + `ApprovalShell` + renderer registry

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** `dapp-bridge-spec.md` §4.2, §4.6 (`<RiskBanner>`),
§4.7a ("Ask Agent"), §5 file layout.

## Why this matters

`ApprovalHost` is where the bridge (data) meets the screen (UI). One
component mounts once per screen, subscribes to `pendingIntents`, picks
the first registered renderer that `canHandle` the intent, and forwards
the decision back. Adding a new approval surface (agent card, hardware
signer prompt) later = register one more renderer. Zero changes to the
screen.

## Scope

Create:

- `services/bridge/ApprovalHost.tsx`:
  - Reads `pendingIntents` store (zustand selector).
  - Renders the first pending intent (FIFO) only — one approval at a
    time.
  - Iterates `ApprovalRenderer[]` in registration order, picks the
    first whose `canHandle(intent)` is true.
  - Passes `{intent, onDecision}` to the chosen `Component`.
  - `onDecision(d)` → `DappBridge.resolve(intent.id, d)`.
  - If no renderer matches, logs a `warn` and auto-rejects after 100ms
    with `-32603` (internal error; this is a dev bug).
- `services/bridge/renderers.ts`:
  - `renderers: ApprovalRenderer[]` — mutable registry.
  - `registerRenderer(r)`, `clear()` for tests.
- `components/dapps-browser/approvals/ApprovalShell.tsx` — shared
  chrome, rendered *inside* each sheet:
  - Origin badge (favicon + host + lock-or-warn icon based on scheme).
  - Wallet header: active wallet avatar + address + chain; tap to
    switch (gated per-intent — some intents lock the wallet).
  - `<RiskBanner annotations={intent.annotations} />` at the top.
    Collapsed summary by default; tap expands. `danger` > `warn` >
    `info` color coding.
  - "Ask Takumi AI to review" button — visible only when there is at
    least one `on-demand` inspector registered for this namespace. On
    tap, calls `DappBridge.runOnDemandInspector("agent", intent.id)`;
    the `<RiskBanner>` auto-updates as annotations stream in.
    **Phase 1a ships the button wired, but with no agent inspector
    registered** — the button stays hidden in production until Phase 5.

Create a placeholder `components/dapps-browser/approvals/renderers.ts`
that exports an empty array today; tasks 10, 13–16, 29 will add to it.

## Rules (non-negotiable)

- **Only one intent renders at a time.** If three are pending, show
  the oldest. Sheet is full-screen modal; no stacking. Matches
  current UX.
- **Renderers are dumb.** They receive `intent + onDecision` and
  nothing else. No imports from `services/chains/*`.
- **`ApprovalShell` is shared.** Every chain's sheet wraps its body
  in `<ApprovalShell intent={intent}>…</ApprovalShell>`.
- **Theme + safe-area + hardware-back must all work.** Hardware back
  = reject.

## Acceptance

- [ ] `ApprovalHost.tsx` mounts once per screen and picks the right
      renderer (proven by a fake-renderer RTL test).
- [ ] `ApprovalShell.tsx` renders origin badge, wallet header, risk
      banner, and conditional "Ask AI" button.
- [ ] `<RiskBanner>` renders an empty `annotations` array as `null`,
      not empty chrome.
- [ ] No renderer yet matches EVM payloads (that ships in task 10);
      the EVM flows still work through the old modals until task 10
      lands.
- [ ] `pnpm check:syntax` passes.

## Out of scope

- Migrating EVM modals to renderers (task 10).
- The actual agent inspector (Phase 5).
