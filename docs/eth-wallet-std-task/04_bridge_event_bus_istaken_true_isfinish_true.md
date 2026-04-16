# Task 04 — `BridgeEventBus` + `ConsoleSink` + `redact.ts`

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** `dapp-bridge-spec.md` §4.7, §4.9, §10.4 invariant 8.

## Why this matters

The event bus is the asynchronous observational stream that future
telemetry and the agent subscribe to. Shipping it in Phase 1a (with
only a console sink) means every adapter, inspector, and renderer is
already emitting structured events when Phase 2 and Phase 5 light up.
Redaction lives next to it so sensitive message contents never leak to
sinks by default.

## Scope

Create:

- `services/bridge/events.ts`:
  - Export `BridgeEvent` union exactly per §4.7 (`request`, `intent`,
    `decision`, `result`, `navigate`).
  - Export `BridgeEventSink` interface (`emit(e)`).
  - Export `BridgeEventBus` — tiny pub/sub with a ring buffer (default
    size 200) and `subscribe(sink)`, `recent(n)`, `emit(e)`.
- `services/bridge/redact.ts`:
  - `redactParams(method, params): unknown` — for `personal_sign`,
    `eth_sign`, `eth_signTypedData*`, replaces the message body with
    `{length, sha256Prefix}` (first 8 bytes of hash, hex). Structure
    preserved for `eth_sendTransaction` (`to`, `value`, `data` length,
    `chainId`); raw `data` hex is truncated to first 10 chars
    (selector) when longer than 10.
  - Applied by `DappBridge` before `emit()` on `request` / `intent`
    events unless an inspector explicitly attached `data.allowRawEmit:
    true` for that intent.
- `services/bridge/sinks/ConsoleSink.ts`:
  - Registered only in `__DEV__`. `emit` → `console.debug('[bridge]', e)`.

## Rules (non-negotiable)

- **Sinks never back-pressure the bridge.** `emit` is fire-and-forget;
  sinks must `try/catch` internally and never throw.
- **Redaction is opt-in to *un*-redact.** Default to redacted. Only an
  explicit inspector annotation (Phase 5) may request raw emission.
- **Ring buffer is in-memory only.** Do not persist events to disk —
  this is observational, not audit.
- **No PII leaves the device from this module.** `TelemetrySink` and
  `AgentSink` land in later tasks (Phase 2 / Phase 5).

## Acceptance

- [ ] `services/bridge/events.ts` exports `BridgeEvent`, `BridgeEventBus`,
      `BridgeEventSink`.
- [ ] `services/bridge/redact.ts` exports `redactParams`.
- [ ] `ConsoleSink` registered in `__DEV__` only.
- [ ] Unit test: emit 250 events, ring buffer length === 200, oldest is
      index 50.
- [ ] Unit test: `redactParams("personal_sign", ["0xdead...", addr])`
      returns `{length, sha256Prefix}` not the raw message; address
      kept.
- [ ] `pnpm check:syntax` passes.

## Out of scope

- `TelemetrySink` (future PostHog integration).
- `AgentSink` (Phase 5).
- Wiring into `DappBridge` (task 05 consumes this module).
