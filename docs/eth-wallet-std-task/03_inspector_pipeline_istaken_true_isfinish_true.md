# Task 03 — `IntentInspector` pipeline + `HttpsInspector` built-in

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** `dapp-bridge-spec.md` §4.6, §4.7a, §9 ("Phase 1
ships…"), §10.4 invariants 2–3.

## Why this matters

The inspector pipeline is the seam that lights up in Phase 5 when we
ship real AI-powered protection. Landing the pipeline in Phase 1a —
with one trivial built-in inspector — guarantees adapters, renderers,
and persistence are already inspector-aware when the agent arrives.
Shipping it later would force every renderer to be rewritten.

## Scope

Create `services/bridge/inspector.ts`:

- Export `RiskSeverity`, `IntentAnnotation`, `InspectionResult`,
  `IntentInspector` exactly per §4.6.
- Export an `InspectorRegistry` with `register(inspector)`,
  `list(mode: "auto" | "on-demand"): IntentInspector[]` (sorted by
  `priority` asc).
- Export `runPipeline(intent, mode, signal): Promise<{annotations,
  verdict, patch}>` implementing the merge contract from §4.6:
  - Run inspectors in priority order.
  - Default timeout per inspector: 2s. On timeout, continue with an
    `info` annotation `{code: "inspector.skipped", source: name}`.
  - `annotations` concatenated, deduped by `code` (keep first).
  - `verdict` is the **strictest** (`block` > `require-extra-confirmation`
    > `allow`).
  - `patch` shallow-merged; security-critical fields (`to`, `value`,
    `data` for EVM; analogues for other chains) are **never** patched.
  - Every inspector receives the *prior* annotation list, frozen.

Create `services/bridge/inspectors/HttpsInspector.ts`:

- `mode: "auto"`, `priority: 0`.
- Returns one `info` annotation (`code: "origin.insecure"`) when
  `intent.origin.url.startsWith("http://")`; otherwise no annotations.
- Never blocks.

Register it at bridge boot (task 05).

## Rules (non-negotiable)

- **Pipeline never throws.** Any inspector error is swallowed and
  reported as a `warn` annotation `{code: "inspector.error", source:
  name}`. A single broken inspector must not DOS the bridge.
- **Adapters and renderers never touch inspectors directly.** Pipeline
  runs inside `DappBridge`.
- **Patches cannot rewrite `payload.to/value/data` on send-tx intents
  or analogous fields.** Enforce this at the merge function, not by
  convention. Test it.
- **`on-demand` inspectors are not run here.** Task 05 / the
  `<ApprovalShell>` invoke them via `runOnDemandInspector(name, id)`.

## Acceptance

- [ ] `services/bridge/inspector.ts` exports the pipeline and registry.
- [ ] `HttpsInspector` registered and covered by a unit test (http → 1
      annotation, https → 0).
- [ ] Unit tests: strictest-verdict merge, dedup by code, timeout →
      skipped annotation, security-critical patch rejection.
- [ ] Pipeline runs under 2s worst-case in the timeout test.
- [ ] `pnpm check:syntax` passes.

## Out of scope

- The agent inspector (Phase 5).
- The `<RiskBanner>` rendering of annotations (task 06).
- The "Ask Takumi AI" button (task 06 wires it as a no-op until Phase 5).
