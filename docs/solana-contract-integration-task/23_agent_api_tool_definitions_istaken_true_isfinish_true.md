# Task 23 — Agent-API tool definitions: `execute_booking_sol` + `deposit_points_sol`

**Status:** Not taken
**Owner:** Agent API (takumi-agent-api), co-owned with Mobile
**Spec reference:** `solana-contract-integration-spec.md` §4.8
(Agent-API server-side tool definitions section).

## Why this matters

The agent-API server needs tool registry entries for
`execute_booking_sol` and `deposit_points_sol` so the LLM can discover
and invoke them. These definitions include input schemas and descriptions
that guide the LLM to pick the right tool based on
`wallet_context.namespace`.

## Scope

### `takumi-agent-api/src/tools/registry.ts`

Add two tool definitions following the existing pattern (same as
`send_sol`, `get_wallet_sol_balance`):

#### `execute_booking_sol`

```typescript
{
  name: "execute_booking_sol",
  category: "blockchain_write",
  executor: "mobile",
  capability: "write",
  description:
    "Submit a product purchase transaction on the TakumiPay Solana " +
    "program (createTransactionSol/Token). Use when " +
    "wallet_context.namespace is \"solana\" — for EVM use " +
    "execute_booking instead.",
  inputSchema: {
    type: "object",
    properties: {
      booking_id: { type: "string", description: "Booking UUID." },
      exchange_rate_id: { type: "string", description: "Exchange rate ID." },
      product_variant_id: { type: "string", description: "Product variant UUID." },
      ref_id: { type: "string", description: "Unique reference ID." },
      amount: { type: "string", description: "Amount in token minor units." },
      token_mint: { type: "string", description: "SPL token mint (base58). Omit for native SOL." },
    },
    required: ["booking_id", "exchange_rate_id", "product_variant_id", "ref_id", "amount"],
    additionalProperties: false,
  },
}
```

#### `deposit_points_sol`

```typescript
{
  name: "deposit_points_sol",
  category: "points",
  executor: "mobile",
  capability: "write",
  description:
    "Deposit SPL tokens into TakumiPay Solana program to earn points. " +
    "Use when wallet_context.namespace is \"solana\" — for EVM use " +
    "deposit_points. ALWAYS call get_points_price first.",
  inputSchema: {
    type: "object",
    properties: {
      token_mint: { type: "string", description: "SPL token mint (base58)." },
      token_amount: { type: "string", description: "Human-readable amount (not lamports)." },
      expected_points: { type: "string", description: "Expected points from get_points_price." },
    },
    required: ["token_mint", "token_amount", "expected_points"],
    additionalProperties: false,
  },
}
```

### Tool selection guidance

All tools always registered — no server-side namespace filtering. The
LLM picks the right tool by reading `wallet_context.namespace` from
the system prompt. Tool descriptions guide selection:
*"Use when wallet_context.namespace is 'solana'"* /
*"for EVM use execute_booking instead"*.

## Rules (non-negotiable)

- **`executor: "mobile"`.** These are mobile-executed tools — the
  agent-API sends the tool call to the mobile app, which runs the
  executor (Task 21).
- **No server-side namespace filtering.** Both EVM and Solana tools
  are always in the registry. The LLM disambiguates via
  `wallet_context.namespace`.
- **Agent prompt must not prescribe chain-tool limits** (memory:
  `feedback_agent_prompt_namespace.md`). Surface `namespace` in the
  wallet-context prompt; never list disabled tools or tell the model
  "EVM-only".
- **Input schemas match mobile executor expectations.** Field names
  and types must match what `executeBookingSol` / `depositPointsSol`
  (Task 21) read from `input`.

## Acceptance

- [ ] Both tool definitions added to agent-API tool registry.
- [ ] `executor: "mobile"` on both.
- [ ] Input schemas match mobile executor expectations.
- [ ] Descriptions reference `wallet_context.namespace` for selection.
- [ ] Agent-API builds: `pnpm run build` succeeds.
- [ ] Existing tool definitions unchanged.

## Out of scope

- Mobile executor implementations (Task 21).
- Mobile registry update (Task 22).
- Merchant payment agent tool (not needed — goes through intent flow,
  see spec §4.8 "What about process_merchant_payment_sol?").
