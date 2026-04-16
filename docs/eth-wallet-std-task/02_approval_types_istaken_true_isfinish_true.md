# Task 02 — `ApprovalIntent` types + `pendingIntents` store

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** `dapp-bridge-spec.md` §4.2, §4.3, §4.4 (persistence),
§5 file layout.

## Why this matters

Today, pending approvals are resolved via `global as any` (see
`app/dapps-browser.tsx:166-193`). That breaks on reload, can't persist,
and can't be observed by telemetry or the agent. `ApprovalIntent` +
`ApprovalDecision` replace the callback spaghetti with serializable
data, and `pendingIntents` becomes the single observable list the
`ApprovalHost` renders from.

## Scope

Create:

- `services/bridge/approval.ts` exporting:
  - `ApprovalKind` union (`"connect" | "signMessage" | "signTypedData" |
    "signTransaction" | "sendTransaction" | "switchChain" | "addChain"`).
    Leave room for additions (task 16 adds `"sendCalls"`, task 27 adds
    `"signAuthorization"`).
  - `ApprovalIntent<P = unknown>` and `ApprovalDecision` exactly as §4.2.
  - `ApprovalRenderer` type.
- `services/bridge/pendingIntents.ts` — a small zustand slice with:
  - `intents: ApprovalIntent[]` (ordered, oldest first).
  - `push(intent)`, `resolve(id, decision)`, `remove(id)`.
  - `persist` middleware writing to `expo-secure-store` under the key
    `dapp-bridge/pending-intents`. On load, restore and synthesize
    reject decisions for any intent older than 5 minutes (mid-approval
    reload should fail closed per §4.4).
- `services/chains/evm/payloads.ts` exporting EVM payload shapes from
  §4.3 (`EvmConnectPayload`, `EvmSignMessagePayload`,
  `EvmSignTypedDataPayload`, `EvmSendTxPayload`).

## Rules (non-negotiable)

- **Intents are plain data.** No functions, no React refs, no class
  instances. JSON-serializable so persistence works.
- **Constructor not exported.** Only `DappBridge.enqueue()` (task 05)
  may create intents; export a type, not a builder. Enforce via a
  named export like `export type ApprovalIntent = …` with no factory.
- **`bigint` serialization.** EVM payloads carry `bigint`s. Use the
  standard string-`0x` encoding when persisting, decode on load.
  Document the transform in one comment at the persistence boundary.
- **Stale purge on boot.** Intents older than 5 minutes at rehydrate
  time get a synthetic `{outcome: "reject"}` decision emitted — do not
  silently forget them, the dApp is still waiting for `-32002`.

## Acceptance

- [ ] `services/bridge/approval.ts` exports the three types.
- [ ] `services/bridge/pendingIntents.ts` exports the zustand store with
      `push`, `resolve`, `remove`.
- [ ] Unit test: push → resolve yields the correct decision; rehydrate
      with a stale intent auto-rejects.
- [ ] `services/chains/evm/payloads.ts` exists with the four EVM payload
      types.
- [ ] `pnpm check:syntax` passes.

## Out of scope

- The renderer registry or `ApprovalHost` component (task 06).
- The actual `DappBridge.enqueue` implementation (task 05).
