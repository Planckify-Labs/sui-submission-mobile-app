# Task 11 — Wallet agent — card, handler, system prompt

**Status:** Not taken
**Owner:** Server (agent-api)
**Spec reference:** `multi-agent-architecture-spec.md` §5, §6.2, §9, §11.2, §11.3.

## Why this matters

Wallet owns balances, transfers, approvals, address book, gas
estimation, points — every "the device is the signer" capability. The
spec keeps Wallet's handler as a **thin tool router by default** —
"for pure tool dispatch (no narrative) no separate LLM call is needed"
(§11.3). Landing that thin shape now matters: it is the v1 cost
contract.

## Scope

- `agent-api/src/agents/wallet/card.ts`:
  ```ts
  export const walletCard: AgentCard = {
    id: "wallet",
    version: "0.1.0",
    display_name: "Wallet",
    description: "Balances, transfers, approvals, address book, gas, points.",
    tool_prefixes: [
      "get_", "send_", "transfer_", "approve_",
      "read_contract", "estimate_gas", "write_contract",
      "points_", "address_book_",
    ],
    capabilities: ["read_balance", "sign_tx", "read_contract", "estimate_gas", "address_book"],
    requires_wallet_context: true,
    requires_jwt: true,
    default_system_prompt_ref: "wallet.v1",
    status: "ready",
  };
  ```
- `agent-api/src/agents/wallet/handler.ts`:
  - `handleWalletTask({ task, wallet_context, tools })` — receives an
    `AgentTask` from the orchestrator with the tool name + input.
  - **Thin path (default):** dispatch the tool by name through the
    server tool registry's invoke surface. For tools that route to
    mobile, the dispatch emits a `tool_pending` SSE event with
    `origin_agent_id: "wallet"` (the orchestrator forwards it; see
    Task 16). No LLM call.
  - **Reasoning path (rare):** if the task input has
    `requires_reasoning: true` (set by Core when explicitly using
    `core_handoff` with `conversational: true`), the handler makes one
    LLM call with the `wallet.v1` prompt. v1 ships the thin path
    only — the reasoning branch is a no-op stub that returns "not
    supported in v1" the orchestrator paraphrases.
- `agent-api/src/agents/wallet/prompts.ts`:
  - Export `wallet.v1` under `PROMPTS`. v1 prompt is a placeholder
    used only by the reasoning branch; mark with a `TODO(v2)` comment.
- Wire `walletCard` into `agents/registry.ts` at boot.

## Rules (non-negotiable)

- **`wallet_context` forwarding (§9, CLAUDE.md).** The handler receives
  `wallet_context` as a function parameter and passes it through to
  every `tool_pending` envelope verbatim. It never reads
  `activeWallet` / `activeChain` from anywhere else, and it never
  rebuilds the context from `task.input`. Mobile-side executors will
  honour the forwarded context (this is the dApp-bridge isolation /
  payment-JWT-binding rule applied to agent-side routing).
- **No LLM call on the thin path.** §11.3. Adding an LLM call here
  doubles the per-turn cost. If a future tool *does* need reasoning,
  flip its task to the reasoning path explicitly — never silently.
- **Wallet does not call into Core or DeFi.** §15 open-question 3
  forbids specialist→specialist delegation in v1. If Wallet needs the
  user to clarify, it returns an `ask_user` peer message back to Core
  (Task 13's orchestrator surfaces it).
- **Idempotent over its tool list.** Wallet's tool ownership equals
  the manifest entry — no inline allow-list. If a tool name doesn't
  resolve to Wallet's prefix set, the handler refuses and emits a
  peer message; the orchestrator translates it to a friendly fallback.
- **No user-rendered strings.** Tool failures bubble up as structured
  errors. Core (Task 10) writes the user copy. Wallet never embeds
  raw RPC errors / status lines (CLAUDE.md).

## Acceptance

- [ ] `wallet/card.ts`, `wallet/handler.ts`, `wallet/prompts.ts` exist
      and register at boot.
- [ ] `assertRegistryInvariants` passes — Wallet's `tool_prefixes`
      cover all wallet tools landed in Task 04 (no orphans).
- [ ] Vitest covers: thin path for `transfer_erc20` produces a
      `tool_pending` envelope with `origin_agent_id: "wallet"` and the
      forwarded `wallet_context` (mocked SSE sink).
- [ ] Vitest covers: reasoning-path stub returns "not supported in v1"
      structured payload — no LLM client invoked.
- [ ] Vitest covers: tool name outside Wallet's prefixes is refused
      with a structured error (not thrown).
- [ ] `pnpm --filter agent-api run check:syntax` passes.

## Out of scope

- DeFi handler — Task 12.
- Orchestrator routing — Task 13.
- Mobile envelope rendering with the "via Wallet" badge — Task 17
  (Wallet is the implicit default; the badge only shows for non-
  default specialists per §6 / §10.2).
