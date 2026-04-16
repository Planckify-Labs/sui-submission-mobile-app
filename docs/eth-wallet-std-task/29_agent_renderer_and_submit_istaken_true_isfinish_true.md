# Task 29 — `AgentCardRenderer` + `DappBridge.submitAgentIntent`

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** `dapp-bridge-spec.md` §6 Phase 2, §2 principle 7.

## Why this matters

Today `components/home/TakumiAgent/PendingTxCard` and `ApprovalSheet`
are parallel approval infra — they duplicate the same send-tx /
sign-message approval spine the WebView uses. Phase 2 unifies them:
the agent sends an `ApprovalIntent` through `DappBridge` just like a
dApp does, and a new renderer handles cards in the chat thread
instead of sheets.

## Scope

- `DappBridge.submitAgentIntent(intent: ApprovalIntent):
  Promise<ApprovalDecision>`:
  - Tags `origin.via = "agent"` (new optional field on `origin`).
  - Pushes through the same pipeline: inspectors → `pendingIntents`
    → `ApprovalHost` → renderer → `adapter.executeApproval`.
  - Returns the decision to the agent caller (which already awaits
    a promise in the current tool-call flow).
- New renderer in `components/dapps-browser/approvals/renderers.ts`:
  ```ts
  { canHandle: i => i.origin?.via === "agent",
    Component: AgentCardRenderer }
  ```
  Registered *before* the default EVM renderers (so agent origins
  pick the card, not the sheet).
- `AgentCardRenderer` is NOT a modal; it renders **inside the chat
  thread** as the next message bubble. Uses the existing generative-UI
  registry (from `gen-ui-task/`) so the card becomes a `tool` part
  in the agent message, not a full-screen takeover.
- Migrate existing `PendingTxCard` and `ApprovalSheet` under
  `components/home/TakumiAgent/` to implement the `ApprovalRenderer`
  interface (one wrapper per card). Their visuals don't change.
- Agent-api tool calls that produce tx/sign intents now call
  `DappBridge.submitAgentIntent(...)` instead of the bespoke
  pending-tx store.

## Rules (non-negotiable)

- **Exactly the same `ApprovalIntent` shape.** An agent-initiated
  swap and a dApp-initiated swap produce
  `ApprovalIntent<EvmSendTxPayload>` that differ only by
  `origin.via`.
- **Same inspector pipeline runs.** Agent-origin intents go through
  `HttpsInspector`, `ApprovalHeuristicInspector`, the future
  `AgentInspector`, etc. The agent doesn't get to bypass its own
  inspection.
- **Card layout is chat-native.** No modal sheet. The chat thread
  renders the card; tapping approve/reject collapses it into a
  frozen receipt (historical branch of the gen-ui registry).
- **One card at a time.** If the agent produces two intents quickly,
  render them in chat order; both stay interactive until one is
  decided. (`ApprovalHost` handles single active sheet; agent
  cards render *in-thread*, so multiple can exist but only one gets
  full interactive focus at a time.)

## Acceptance

- [ ] An agent-initiated swap produces an `ApprovalIntent<EvmSendTxPayload>`,
      renders as a chat card, on approve executes via `EvmAdapter`,
      and updates to a confirmed receipt in the same bubble.
- [ ] A dApp-initiated swap still renders as a full-screen sheet.
- [ ] Both paths pass through the inspector pipeline (tested with a
      stubbed inspector that asserts it saw both origins).
- [ ] The pre-Phase-2 bespoke agent approval code is deleted (no
      duplicate state machines).
- [ ] `pnpm check:syntax` passes.

## Out of scope

- The `AgentInspector` itself (Phase 5).
- Changing the agent chat UX beyond the renderer integration.
