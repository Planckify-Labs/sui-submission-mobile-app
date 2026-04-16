# Task 30 — `SolanaAdapter` + Wallet Standard + Solana sheets

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** `dapp-bridge-spec.md` §6 Phase 3.

## Why this matters

This is the proof that the bridge architecture actually works.
Adding a second chain — a completely different RPC model, a
different injected API (Wallet Standard, not EIP-1193), different
signing primitives — should touch zero files in `app/` and zero
files in EVM-specific folders. If it does, a port is leaking.

## Scope

- `services/chains/solana/SolanaAdapter.ts` implementing
  `ChainAdapter` with `namespace: "solana"`:
  - `getInjectedScript(ctx)` registers a Wallet Standard wallet
    (`@wallet-standard/core`). Injects via the same WebView
    concatenation path the screen already uses — no screen change.
  - `handleRequest` routes:
    - `solana:standard:connect` → `ApprovalIntent<SolanaConnectPayload>`.
    - `solana:signMessage` → `ApprovalIntent<SolanaSignMessagePayload>`.
    - `solana:signTransaction` → `ApprovalIntent<SolanaSignTxPayload>`.
    - `solana:signAndSendTransaction` → intent + broadcast on
      approve.
  - `executeApproval` uses `@solana/web3.js` for signing.
- `services/chains/solana/payloads.ts`:
  ```ts
  export type SolanaConnectPayload = { cluster: "mainnet-beta" | "devnet" };
  export type SolanaSignMessagePayload = { message: Uint8Array };
  export type SolanaSignTxPayload = { transaction: Uint8Array; cluster: string };
  ```
- Sheets (new under `components/dapps-browser/approvals/`):
  - `SolanaTransactionSheet.tsx` — shows instructions decoded (best
    effort via `@solana/spl-token` for SPL transfers; raw otherwise).
  - `SolanaSignMessageSheet.tsx`.
  - `SolanaConnectSheet.tsx` (reuses `ConnectSheet` with a
    namespace-specific account list if feasible).
- Register in `renderers.ts`. Solana wallets must also satisfy task
  07's `TWallet.namespace = "solana"` — creation flow is out of
  scope here.

## Rules (non-negotiable)

- **Zero changes to `app/dapps-browser.tsx`.** If you need to touch
  it, a port is wrong. Fix the port instead.
- **Zero changes to `services/chains/evm/*`.**
- **Shared `ApprovalShell`.** Origin badge, wallet header, risk
  banner, Ask-AI button — all reused. Only the body differs.
- **Inspectors run on Solana intents too.** `HttpsInspector` is
  namespace-agnostic; a future `SolanaPhishingInspector` plugs into
  the same pipeline.
- **`BridgeEventBus` emissions redact Solana message bodies the
  same way EVM personal_sign is redacted** (task 04's `redact.ts`
  gets a `solana:signMessage` branch).

## Acceptance

- [ ] A Solana dApp (e.g. a Jupiter embed, Raydium devnet) connects,
      signs a message, and signs+sends a transaction.
- [ ] Grep `app/dapps-browser.tsx` diff vs the pre-task state:
      zero lines added specific to Solana.
- [ ] Grep `services/chains/evm/**` diff: zero lines added specific
      to Solana.
- [ ] `<ApprovalShell>` renders the same chrome for a Solana sign
      and an EVM sign; visual consistency.
- [ ] Unit tests for the adapter's branches.
- [ ] `pnpm check:syntax` passes.

## Out of scope

- Solana wallet creation flows (separate spec).
- Sui adapter (Phase 4 — same pattern, new namespace).
- Solana smart-account equivalents.
