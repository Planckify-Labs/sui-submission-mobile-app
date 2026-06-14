# Extensible x402 Agent Payments — Resource Catalog & Settlement Rails — Engineering Spec

**Status:** Draft
**Owner:** Wallet & AI Agent Team
**Target version:** `takumi-agent-api` + `takumipay-mobile-app` v2.8.0
**Scope:** Two extensibility axes over the Phase 5 flow, both registry-driven and config-sourced:
* **Part I — Resource Catalog (agent-api).** Replace the single hardcoded x402 use case (`X402_SECURITY_AUDIT_URL`) with a DB-backed catalog of paid resources; make the agent pick a *capability*, not a URL; let any tool be x402-backed.
* **Part II — Settlement Rails (mobile).** Refactor [`x402Settle.ts`](file:///home/cstralpt/takumipay/mobile-app/services/walletKit/evm/x402Settle.ts) from a hardcoded two-rail order into a priority-ordered, health-aware **SettlementRail chain** with the 1Shot relayer demoted to one optional rail.

**No change** to the [`WalletKitAdapter.settleX402Payment`](file:///home/cstralpt/takumipay/mobile-app/services/walletKit/types.ts) port, the [`runAgentX402Fetch`](file:///home/cstralpt/takumipay/mobile-app/services/x402/agentX402Client.ts) orchestrator, or the mobile `x402_fetch` executor's settlement path.

**References:**
* Phase 5 Spec (the flow both axes extend): [x402-agent-micropayments-spec.md](file:///home/cstralpt/takumipay/mobile-app/docs/x402-agent-micropayments-spec.md)
* Phase 3 Spec (1Shot relayer — now demoted to one rail): [eip7710-1shot-relayer-spec.md](file:///home/cstralpt/takumipay/mobile-app/docs/eip7710-1shot-relayer-spec.md)
* In-repo failover pattern to mirror: [MultiProvider.ts](file:///home/cstralpt/takumipay/mobile-app/services/rpc/MultiProvider.ts)
* **Part I (agent-api):** prompt builder [prompts.ts](file:///home/cstralpt/takumipay/agent-api/src/agents/core/prompts.ts) · the URL-pin hack [chat.service.ts](file:///home/cstralpt/takumipay/agent-api/src/chat.service.ts) · tool registry [registry.ts](file:///home/cstralpt/takumipay/agent-api/src/tools/registry.ts) · `x402_fetch` decl [writes.ts](file:///home/cstralpt/takumipay/agent-api/src/tools/wallet/writes.ts) · boot log [main.ts](file:///home/cstralpt/takumipay/agent-api/src/main.ts)
* **Part II (mobile):** settlement impl [x402Settle.ts](file:///home/cstralpt/takumipay/mobile-app/services/walletKit/evm/x402Settle.ts) · relayer client [relayer.ts](file:///home/cstralpt/takumipay/mobile-app/services/walletKit/evm/relayer.ts) · status polling [pollTaskStatus.ts](file:///home/cstralpt/takumipay/mobile-app/services/gasAbstraction/pollTaskStatus.ts) · executor [x402.ts](file:///home/cstralpt/takumipay/mobile-app/services/agent-executors/wallet/x402.ts)
* Public Relayer skill: [SKILL.md](file:///home/cstralpt/takumipay/mobile-app/.agents/skills/public-relayer/SKILL.md)
* Space docking (the capability registry both axes plug into): [walletKit registry.ts](file:///home/cstralpt/takumipay/mobile-app/services/walletKit/registry.ts) · [bootstrap.ts](file:///home/cstralpt/takumipay/mobile-app/services/walletKit/bootstrap.ts) · guardrail [check-chain-agnostic.sh](file:///home/cstralpt/takumipay/mobile-app/scripts/check-chain-agnostic.sh)

---

## 1. Executive Summary

Phase 5 shipped the agent x402 micropayment flow, but two pieces are hardcoded to
a single use case and a single settlement path. This spec makes both **extensible
by adding a config row, not editing code** — the same registry-driven discipline
applied to two axes.

**Axis 1 — what the agent buys (Part I, agent-api).** Today the one x402 use case
("security audit") is wired through three hardcoded touchpoints: a bespoke prompt
block in [`prompts.ts`](file:///home/cstralpt/takumipay/agent-api/src/agents/core/prompts.ts),
a URL **pin hack** in [`chat.service.ts`](file:///home/cstralpt/takumipay/agent-api/src/chat.service.ts)
that overwrites whatever URL the model passed, and a boot log in
[`main.ts`](file:///home/cstralpt/takumipay/agent-api/src/main.ts) — all keyed on
`X402_SECURITY_AUDIT_URL`. A second use case means copy-pasting all three. Part I
replaces them with a **resource catalog**: a DB-backed registry where each entry
declares a paid resource's semantics, the agent **picks a capability from a closed
set** (never types a URL), and **any tool can be x402-backed** via a binding. The
pin hack disappears because the model can no longer invent a URL.

**Axis 2 — how it settles (Part II, mobile).** Today [`settleX402PaymentEvm`](file:///home/cstralpt/takumipay/mobile-app/services/walletKit/evm/x402Settle.ts)
hardcodes a two-rail order with the **1Shot relayer inlined as the function body**.
Part II turns settlement into an ordered list of interchangeable
**`SettlementRail`s** tried in **priority order with health-based failover** —
structurally identical to the RPC failover we already ship in
[`MultiProvider.ts`](file:///home/cstralpt/takumipay/mobile-app/services/rpc/MultiProvider.ts)
and operationally identical to the fiat payment-service-provider (PSP) cascade the
team already runs (Xendit → Duitku → …). The relayer becomes **one optional rail**;
running with **no relayer at all** is a config flip to the server-settled
`Erc7710FacilitatorRail` (§9.1, §11.2, §12.2).

**The hard part of Axis 2 is doing the cascade safely with money.** RPC failover is
free because reads are idempotent; settlement is not. The central rule
(**SP-1: no failover after the submission boundary**) is what makes a payment
cascade non-double-spending. Every Phase 5 security invariant (budget gate, fee
bound, payment-target binding, wallet isolation, error discipline, chain-agnostic
guardrail) is **preserved unchanged** — both axes change *which component decides
or executes*, never *the rules a payment must obey*.

---

## 2. Goals & Non-Goals

### Goals — Axis 1 (resource catalog, agent-api)
* **G1. A resource catalog replaces the single hardcoded use case.** One declarative
  registry of paid resources drives URL resolution, prompt generation, and tool
  binding. Adding a use case = one catalog row (+ optionally one bound tool).
* **G2. The model selects a *capability*, not a URL.** `x402_fetch` takes a
  `resource` enum (the catalog ids), not free-text `url`; the server resolves the
  URL. This deletes the pin hack at the schema level and ends URL invention.
* **G3. Per-tool x402 binding.** A `ToolMeta.x402` field marks a tool as
  x402-backed; one orchestrator branch resolves + dispatches it. Tools without the
  field are normal — "each tool call *might* have an x402 implementation."
* **G4. Catalog-driven prompt generation.** The Core prompt emits one hint block per
  *enabled* resource, derived from the catalog — not a hand-written per-resource
  block. Add a resource → its hint appears; disable it → it vanishes.
* **G5. DB-backed catalog.** With ≥3 resources expected, resources live in a Prisma
  `X402Resource` table (Valkey-cached); env vars become local-dev seed/override.
  Presence/`enabled` = exposed.

### Goals — Axis 2 (settlement rails, mobile)
* **G6. Rail chain replaces the hardcoded rail order.** Refactor
  [`settleX402PaymentEvm`](file:///home/cstralpt/takumipay/mobile-app/services/walletKit/evm/x402Settle.ts)
  into a thin orchestrator over an ordered, health-filtered list of
  `SettlementRail`s. The budget gate stays in the orchestrator (rail-independent);
  rail-selection logic moves out of the orchestrator into each rail.
* **G7. 1Shot relayer becomes optional.** The current relayer body moves verbatim
  into `RelayerBroadcastRail`, registered **only when configured**. No 1Shot config
  ⇒ the next rail serves the payment. The orchestrator has zero 1Shot-specific code.
* **G8. Mirror the in-repo failover pattern.** Reuse
  [`MultiProvider`](file:///home/cstralpt/takumipay/mobile-app/services/rpc/MultiProvider.ts)'s
  vocabulary: `priority` sort (lower = first), `healthy → degraded → down` states,
  skip-while-down, background health sweep — and the fiat-PSP cascade semantics.
* **G9. Define the settlement-safety boundary.** Specify the single rule (SP-1) and
  a failure-classification table (§9.2) that makes payment failover provably
  non-double-spending: failover only on positive evidence nothing was broadcast.
* **G10. Config-driven rail set.** In-code default rails (ids + priorities, **no
  secret endpoints**) plus a remote override (enable/disable, reorder, endpoints,
  per-rail fee cap), cached on device. Presence of config = enabled.
* **G11. Preserve every Phase 5 invariant.** SI-1…SI-8 hold byte-for-byte; this spec
  adds CI-/SP- invariants about *how things are chosen*, not *what a payment does*.
* **G12. Settlement port stays put (space docking).** `WalletKitAdapter.settleX402Payment`
  keeps its Phase 5 signature — the space-docking capability the rail chain hides
  behind (§3.2); the rail chain is **internal to the EVM kit**. Solana/Sui leave the
  method `undefined` and compile unchanged.
* **G13. Fully specify the relayer-free (server-settled) rail.**
  `Erc7710FacilitatorRail` is specified end-to-end (§9.1 mode + §11.2 impl) so that
  "don't use a relayer" is an operator config flip (`RELAYER_FREE_PROFILE`, §12.1),
  not a future seam.

### Non-Goals
* **N1. New on-chain enforcers.** Both axes compose existing caveats only (carryover
  of Phase 5 N2).
* **N2. Changing the mobile settlement primitive from Part I.** The catalog resolves
  a `resource` → `{ url, method, maxSpendUsdc }` and the mobile `x402_fetch` executor
  still receives a URL exactly as in Phase 5. Part I never touches mobile settlement.
* **N3. A generic web-fetch tool.** `x402_fetch` stays payment-gated against the
  catalog; the catalog is not a backdoor to arbitrary URLs (CI-2).
* **N4. Parallel / racing settlement.** Rails are tried **strictly sequentially**
  (SP-3). Racing two rails for one challenge is a double-spend; forbidden.
* **N5. Cross-session breaker persistence.** Breaker state is in-memory; a cold
  start resets it. A later optimisation, not v1.
* **N6. Changing the mobile agent loop / `runAgentX402Fetch`.** Part II reuses them
  unchanged; the rail chain lives inside the EVM kit.
* **N7. Replacing the on-chain ledger backstop.** The local
  [`X402SpendLedger`](file:///home/cstralpt/takumipay/mobile-app/services/x402/budget.ts)
  + on-chain caveat remain the budget ceiling regardless of resource or rail.

---

## 3. Architecture: two extensibility axes, one discipline

A complete agent payment answers two questions: **what to buy** and **how to pay**.
This spec makes each a registry you extend by adding a row.

```
   Agent decides WHAT          Mobile decides HOW
   ┌──────────────────┐        ┌──────────────────────┐
   │  Resource catalog│        │  Settlement rails    │
   │  (agent-api)     │  url   │  (mobile / EVM kit)  │
   │  resource → URL  │ ─────► │  rail chain + failover│
   └──────────────────┘        └──────────────────────┘
        Part I                       Part II
```

| | Axis 1 — Resource catalog (Part I) | Axis 2 — Settlement rails (Part II) |
| :--- | :--- | :--- |
| Question | *What* paid resource to buy | *How* to settle the payment |
| Layer / repo | agent-api | mobile (`x402Settle.ts`) |
| Registry unit | `X402Resource` (a use case) | `SettlementRail` (a settlement mechanism) |
| Source of truth | Prisma `X402Resource` + Valkey cache | in-code defaults + remote override |
| Selection | match capability → URL (enum / tool binding) | priority order + health failover |
| Add one | a catalog row (+ optional bound tool) | a rail file (+ config row) |
| Disable one | `enabled:false` row | `enabled:false` row |
| Shared DNA | **config/DB-driven · presence = enabled · no hardcoded host · extend by adding a row, not editing code** | |

The two axes are independent (different repos, different PRs) but share the same
config home (OQ-2) and the same neutrality invariant (no vendor/host compiled in).

### 3.1 Extending the system — the cookbook

Every extension below is *add a row / dock a port*, never *edit a switch*.

| To… | Do | Touches |
| :--- | :--- | :--- |
| **Add a paid resource** (GET, no params) | insert one `X402Resource` row | **0 code** — appears in the `x402_fetch` enum + the prompt automatically (CI-3) |
| **Add a resource needing request-shaping / a named tool** | the row + a `buildRequest()` (or a `ToolMeta` with `x402:{resourceId}`, e.g. `defi_security_audit`) | 1 row + 1 tool decl |
| **Add a settlement rail** (relayer / facilitator / direct) | one `SettlementRail` file under `evm/rails/` + one `registerRail()` line + optional config row | 1 file + 1 line |
| **Add / replace a facilitator** | add its origin to `cfg.allowedFacilitators` | **0 code** (facilitator is seller-advertised) |
| **Add / replace a relayer** | swap the relayer rail's client/`endpoint` in config, or register a 2nd instance | config (no new type) |
| **Add settlement on a new chain** (Solana / Sui) | implement `settleX402Payment` on that kit | a space-docking port (§3.2) — no namespace branch |

The recurring shape: a new capability is a new **entry in a registry** (catalog row,
rail registration, adapter method) that shared code discovers by *presence*, not by a
hardcoded branch. That is what keeps "extend it" a one-liner — and it is enforced, not
just encouraged (CI-3, SP-6, SP-9, `pnpm check:chains`).

### 3.2 Both axes ride the project's space-docking mechanism

The load-bearing convention in this repo is **space docking**: shared code never
branches on chain namespace — it resolves a
[`WalletKitAdapter`](file:///home/cstralpt/takumipay/mobile-app/services/walletKit/registry.ts)
from the registry and *presence-checks an optional capability method*; a chain that
can't do a thing leaves the method `undefined` (CLAUDE.md multi-chain rule, enforced
by `pnpm check:chains`). Both axes plug into it rather than around it:

* **Rails (Part II)** live behind the `settleX402Payment` capability — itself a
  space-docking optional method on the EVM adapter. The rail registry is internal to
  the EVM kit; Solana/Sui leave `settleX402Payment` `undefined` and compile unchanged.
  Adding settlement on another namespace = implement that one method on its kit, never
  a namespace branch (SP-9).
* **Catalog (Part I)** dispatches x402-bound tools the same way: the mobile executor
  presence-checks `settleX402Payment` (Phase 5 §6.1) before paying — no agent-side
  namespace logic.

So "extend the rails" and "extend to a new chain" are both *dock a new capability*,
which is why neither needs an `if (namespace === …)` anywhere.

---

# Part I — Resource Catalog (agent-api: what the agent buys)

## 4. Background: the hardcoded single-use-case problem

The one x402 use case today is wired through three places, all keyed on one env var:

```
X402_SECURITY_AUDIT_URL  (one env var, one use case)
   │
   ├─ prompts.ts  x402SafetyHint()   → a bespoke "security audit" prompt block,
   │                                    emitted only if the env var is set
   ├─ chat.service.ts                → THE PIN HACK: if toolName === 'x402_fetch'
   │                                    && env, overwrite input.url = env
   └─ main.ts                        → a boot log naming the single resource
```

Two problems:
1. **Not extensible.** A second use case (a premium price feed, a KYC oracle, …)
   means copy-pasting all three touchpoints and inventing a second env var.
2. **The pin hack is a smell.** It exists because the model keeps inventing hosts
   (DeFiLlama, `http→https` swaps) instead of hitting the configured resource
   ([`chat.service.ts`](file:///home/cstralpt/takumipay/agent-api/src/chat.service.ts)
   comment says as much). The real fix is to **stop letting the model choose a
   URL** — give it a closed set of capabilities and resolve the URL server-side.

Part I generalises all three into a catalog and removes the pin hack by construction.

## 5. The resource catalog

### 5.1 The `X402Resource` entry (semantics only — no host literal)
Each entry declares *what a resource is*, not where it lives. The URL is resolved
from the DB/config by `id` (CI-1) — never written in code.

```typescript
// agent-api: src/x402/catalog.ts
export interface X402Resource {
  id: string;                 // 'security-audit' — stable key; also the x402_fetch enum value
  label: string;              // 'security audit' — user-neutral family name
  method?: 'GET' | 'POST';
  // Prompt material (§7) — what the agent should know about this resource
  purpose: string;            // what it knows that the free tools don't
  useWhen: string[];          // trigger conditions, rendered as bullets in the prompt
  // Economics
  expectedMaxUsdc?: number;   // → maxSpendUsdc per-call ceiling hint (CI-4)
  // Optional: turn the tool's domain args into a concrete request
  buildRequest?(params: Record<string, unknown>): {
    path?: string; query?: Record<string, string>; body?: unknown;
  };
}

/** A resolved entry: the catalog semantics + the URL/enablement from the store. */
export interface X402ResourceRecord extends X402Resource {
  url: string;       // resolved endpoint (DB row / env) — NEVER hardcoded in code (CI-1)
  enabled: boolean;
  priority: number;  // ordering when several resources could match a query
}
```

### 5.2 Storage & resolution (Prisma + Valkey; env as dev seed)
With ≥3 resources expected, the catalog is a table, cached. Env stays only as a
local-dev seed/override so the hackathon harness keeps working.

```prisma
// agent-api: prisma/schema.prisma
model X402Resource {
  id              String   @id            // 'security-audit'
  label           String
  url             String                  // was X402_SECURITY_AUDIT_URL
  method          String   @default("GET")
  purpose         String
  useWhen         String[]
  expectedMaxUsdc Decimal?
  enabled         Boolean  @default(true)
  priority        Int      @default(100)
  updatedAt       DateTime @updatedAt
}
```

```typescript
// agent-api: src/x402/catalog.ts — the loader. Source swaps (env → DB) behind
// these three functions; nothing downstream changes (the same seam serves env now,
// DB next). Cached in Valkey; presence/enabled = exposed.
export async function enabledResources(): Promise<X402ResourceRecord[]>;
export async function getResource(id: string): Promise<X402ResourceRecord | undefined>;
export async function enabledResourceIds(): Promise<string[]>;  // → x402_fetch enum
```

> Mirrors the rail-config two-tier model (§12.1) and the
> [`MultiProvider`](file:///home/cstralpt/takumipay/mobile-app/services/rpc/MultiProvider.ts)
> `DEFAULT_PROVIDERS` + `custom_rpcs` pattern: a safe baseline plus a runtime store,
> editable without a deploy.

## 6. Capability schema & tool binding

### 6.1 `x402_fetch` takes a `resource` enum, not a URL (kills the pin hack)
Change the tool schema in
[`writes.ts`](file:///home/cstralpt/takumipay/agent-api/src/tools/wallet/writes.ts)
so the model can only choose from a closed set:

```typescript
// BEFORE: { url: string, method?, maxSpendUsdc? }  → model invents URLs → pin hack
// AFTER:
inputSchema: {
  type: 'object',
  properties: {
    resource:     { type: 'string', enum: await enabledResourceIds(),
                    description: 'Which paid resource to fetch. Pick the matching capability.' },
    params:       { type: 'object', additionalProperties: true,
                    description: 'Domain args, e.g. { protocol: "aave-v3" }.' },
    maxSpendUsdc: { type: 'number', description: 'Optional per-call USDC ceiling.' },
  },
  required: ['resource'],
  additionalProperties: false,
}
```

The pin hack in
[`chat.service.ts`](file:///home/cstralpt/takumipay/agent-api/src/chat.service.ts)
becomes a clean resolver — `resource` → `{ url, method, maxSpendUsdc }` injected into
the **mobile** tool input (mobile still receives a URL, unchanged — N2):

```typescript
// Resolve the chosen capability → a concrete request. The model never typed a URL.
if (tc.toolName === 'x402_fetch') {
  const res = await getResource(String((tc.input as any).resource));
  if (!res) { /* friendly: "I can't access that resource." — no raw echo (CI-5) */ }
  const { path, query, body } = res.buildRequest?.((tc.input as any).params ?? {}) ?? {};
  tc.input = {
    url: composeUrl(res.url, path, query),                      // server-resolved (CI-2)
    method: res.method,
    maxSpendUsdc: (tc.input as any).maxSpendUsdc ?? res.expectedMaxUsdc,  // CI-4
    body,
  };
}
```

### 6.2 Per-tool x402 binding — "some tools have it, some don't"
Any tool can *be* an x402-backed tool by declaring a binding on its
[`ToolMeta`](file:///home/cstralpt/takumipay/agent-api/src/tools/internal/types.ts):

```typescript
export interface ToolMeta {
  // ...existing fields...
  x402?: { resourceId: string };   // → catalog entry; absent = a normal tool
}
```

A semantic tool that never exposes a URL to the model:

```typescript
defi_security_audit: {
  name: 'defi_security_audit',
  category: 'blockchain_write', executor: 'mobile', capability: 'write',
  description: 'Buy a security report for a DeFi protocol (audit status, admin keys, exploit history).',
  x402: { resourceId: 'security-audit' },                 // ← the binding
  inputSchema: { type: 'object', properties: { protocol: { type: 'string' } },
                 required: ['protocol'], additionalProperties: false },
}
```

One orchestrator branch handles *all* x402-bound tools: if `meta.x402`, resolve the
catalog entry, `buildRequest(input)` → URL/body, set `maxSpendUsdc` from
`expectedMaxUsdc`, and dispatch through the **same** mobile `x402_fetch` machinery.
A tool with no `x402` field is just a normal tool (G3).

### 6.3 Why this is more robust than free-text URLs
The model picks from a closed enum (or calls a semantic tool), so the
URL-invention failure class the pin hack patched over **cannot occur** (CI-2). The
generic `x402_fetch(resource, params)` stays as the power-user primitive; semantic
tools (`defi_security_audit`) are the high-intent surface. Both resolve through the
same catalog.

## 7. Prompt generation from the catalog

Replace the bespoke `x402SafetyHint()` in
[`prompts.ts`](file:///home/cstralpt/takumipay/agent-api/src/agents/core/prompts.ts)
with a loop over the *enabled* catalog:

```typescript
async function x402Hints(): Promise<string> {
  const resources = await enabledResources();
  if (resources.length === 0) return '';   // generalises the old `if (!url) return ''`
  return resources.map((r) =>
    `Paid resource "${r.label}": ${r.purpose}\nUse it when:\n` +
    r.useWhen.map((u) => `  • ${u}`).join('\n') +
    `\nCall \`x402_fetch({ resource: "${r.id}" })\` (add \`params\` as needed). It ` +
    `settles silently from the pre-authorized allowance — never ask the user to approve.`,
  ).join('\n\n');
}
```

Add a resource → its hint appears; disable it → it vanishes. The old prompt's
"copy this URL verbatim, don't switch http→https" instructions disappear entirely:
the model selects a `resource` id, so there is no URL for it to mangle (CI-2).
Provider-neutral preserved — the host only ever lives in the DB row (CI-1).

---

# Part II — Settlement Rails (mobile: how payments settle)

## 8. The settlement chain

### 8.1 The chain (replaces the fixed rail order)

[`settleX402PaymentEvm`](file:///home/cstralpt/takumipay/mobile-app/services/walletKit/evm/x402Settle.ts)
today hardcodes: try `settleViaFacilitator` (returns `null`), then the **inlined**
1Shot relayer body. The relayer is *the function body*, not a swappable dependency.
The refactor makes it a list:

```
settleX402PaymentEvm(args)                       ← unchanged adapter entry point
  │
  ├─ budget gate (SI-1)  ── over_budget ─────────────────────► return over_budget
  │
  ├─ candidates = registry.rails
  │       .filter(r => r.supports(ctx))          ← network/SDK/config capable?
  │       .filter(r => breaker.isUsable(r.id))   ← not 'down' / cooling
  │       .sort((a,b) => a.priority - b.priority)
  │
  └─ for r of candidates:                         ← STRICTLY SEQUENTIAL (SP-3)
         attempt = await r.attempt(args)
         ┌────────────────────────────────────────────────────────────┐
         │ settled         → breaker.recordSuccess; return settled     │
         │ over_budget     → return over_budget (terminal)             │
         │ terminal_failure→ return failed (STOP — SP-1; funds may move)│
         │ unavailable     → breaker.recordFailure; CONTINUE ───────┐  │
         └─────────────────────────────────────────────────────────┘  │
              (only `unavailable` advances to the next rail) ◄──────────┘
     exhausted → return failed (lastReason)
```

### 8.2 Rail taxonomy (initial set)

| Rail | `kind` | Mode (§9.1) | Default | `supports()` true when | Backed by |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `RelayerBroadcastRail` | `relayer` | A · broadcast | enabled, prio 10 | 1Shot configured for `chainId` | [`relayer.ts`](file:///home/cstralpt/takumipay/mobile-app/services/walletKit/evm/relayer.ts) (Phase 3) |
| `Erc7710FacilitatorRail` | `facilitator` | **B · server-settled (relayer-free)** | disabled *pending SDK*, prio 10 | ERC-7710 scheme **and** seller names a `facilitator` **and** buyer SDK present | seller-named x402 facilitator; ERC-7710 buyer SDK (§11.2) |
| *(future)* `Eip3009FacilitatorRail` | `facilitator` | B · server-settled | — | seller advertises EIP-3009 `exact` | shares Path C signing ([`pathCRawX402.ts`](file:///home/cstralpt/takumipay/mobile-app/services/nanopay/pathCRawX402.ts)) |
| *(future)* `DirectBroadcastRail` | `direct` | A · broadcast | — | smart-account self-broadcast available | viem walletClient |

Adding a rail = one file implementing `SettlementRail` + one registry entry +
(optionally) one remote-config row. Removing 1Shot = drop its config (disabled) or
its registry entry. Switching to a *different* relayer is swapping the relayer
rail's client/endpoint in config — not a new rail type. Running with **no relayer at
all** is the `Erc7710FacilitatorRail` row above — a Mode-B (server-settled) rail
that needs no buyer broadcast and no buyer-side relayer (§9.1, §12.2).

## 9. Settlement modes & failure classification

### 9.1 Settlement modes — buyer-broadcast vs server-settled

Rails come in two modes, and **the submission boundary differs by mode.** This is
also exactly the axis that makes "no relayer" possible.

**Mode A — buyer-broadcast** (`RelayerBroadcastRail`; future `DirectBroadcastRail`).
The rail *itself* puts the transfer on-chain inside `attempt()`. The proof is a **tx
hash**. The orchestrator's `X-PAYMENT` retry is pure verification (the seller checks
the tx on-chain). Boundary = the broadcast call inside `attempt()` (the §9.2 table
applies verbatim).

**Mode B — server-settled** (`Erc7710FacilitatorRail`; future
`Eip3009FacilitatorRail` / Path C). The rail only **signs** a payment payload inside
`attempt()` — **no funds move there.** The proof is the signed `X-PAYMENT` envelope,
and the *seller* drives settlement: it forwards the envelope to the facilitator's
`/settle` when the orchestrator retries. Boundary = the **orchestrator's retry**,
which is *outside* the rail. This is the relayer-free, gasless path — the buyer
never broadcasts and runs no relayer.

Naively, Mode B couldn't fail over: a facilitator outage would only surface at the
retry, already past the boundary. The fix is a **non-settling `/verify` pre-check**
inside `attempt()` — the x402 facilitator exposes `/verify`, which validates
signature + balance + nonce and **settles nothing**. So a Mode-B `attempt()`:

1. signs the payload — failure ⇒ `unavailable` (nothing moved);
2. calls the facilitator `/verify` — unreachable/reject ⇒ `unavailable` (nothing
   moved; *this* is what keeps a facilitator outage failover-safe);
3. on `/verify` ok ⇒ returns `settled` with `settlesOnRetry: true`.

Once a `settlesOnRetry` proof is on the wire, a non-200 retry is `terminal_failure`
for the chain (the seller may have settled) — never a fail-over. The `/verify` step
is precisely the window in which trying a different rail is still safe.

| | Mode A · broadcast | Mode B · server-settled |
| :--- | :--- | :--- |
| Funds move in `attempt()` | yes (broadcast) | **no** (sign + `/verify` only) |
| Proof | tx hash | signed `X-PAYMENT` envelope |
| Who settles on-chain | the buyer (relayer/self) | the **seller's facilitator** |
| Submission boundary | broadcast inside `attempt()` | the orchestrator's retry |
| Failover-safe window | up to the broadcast call | **all of `attempt()`** |
| Buyer gas | none (relayer) / yes (direct) | none |
| Buyer-side relayer | required (relayer) | **none** |

The agent, the `WalletKitAdapter` port, and the orchestrator can't tell the modes
apart — both return a `proof` the orchestrator replays as `X-PAYMENT`. That mode
opacity is what lets "use a relayer" and "don't use a relayer" be the same call site
with different config.

### 9.2 Failure classification — the safety core (SP-1)

A rail's `attempt()` MUST classify its own failure into exactly one of two buckets.
**Only `unavailable` may fail over.** The table is written for **Mode A**
(buyer-broadcast) rails, where the boundary lives *inside* `attempt()`; **Mode B**
(server-settled) rails move the boundary to the orchestrator retry (covered in §9.1).

| Where the attempt fails | Value broadcast? | Outcome | Failover? |
| :--- | :--- | :--- | :---: |
| `supports()` re-checks false at runtime | No | `unavailable` | ✅ |
| breaker marks rail `down` | No (skipped before attempt) | *(filtered)* | ✅ |
| capabilities / feeData fetch fails | No (pre-submit) | `unavailable` | ✅ |
| estimate fails | No (pre-submit) | `unavailable` | ✅ |
| fee **>** safety bound (SI-2) for this rail | No (refused pre-submit) | `unavailable` | ✅ (cost-based) |
| `requested + fee > remainingBudget` (SI-1) | No | `over_budget` | ❌ (surface top-up) |
| rail-attested terminal **failed, no txHash** | No (rail is authority it didn't broadcast) | `unavailable` | ✅ |
| `send()` / facilitator redeem **throws** | **Maybe** | `terminal_failure` | ❌ |
| `send()` ok, poll **times out** | **Maybe** (tx in flight) | `terminal_failure` | ❌ |
| terminal **failed with a txHash** | **Maybe** (broadcast then reverted) | `terminal_failure` | ❌ |

**Rule SP-1 stated precisely:** failover (`unavailable`) requires *positive evidence*
that no value-bearing transaction was broadcast — i.e. the attempt failed **before**
its submission boundary, **or** the rail authoritatively attests it never broadcast
(terminal-failed, no tx hash). Any post-submission ambiguity is `terminal_failure`:
we stop, return friendly copy, and let the
[`X402SpendLedger`](file:///home/cstralpt/takumipay/mobile-app/services/x402/budget.ts)
+ on-chain caveat be the backstop. **We never trade a possible failure for a certain
double-spend.**

The **submission boundary** per rail:
* `RelayerBroadcastRail`: the `relayerSend7710Transaction` call. Everything up to and
  including `estimate` is pre-boundary (`unavailable` on failure); from the `send`
  invocation onward, any failure is `terminal_failure`.
* `Erc7710FacilitatorRail` (Mode B, §9.1): the boundary is the **orchestrator's
  `X-PAYMENT` retry**, *not* anything inside `attempt()`. The whole of `attempt()` —
  sign + a non-settling `/verify` — is pre-boundary and failover-safe.

### 9.3 Cost-based failover (a free win from the abstraction)
Because a per-rail fee over its safety bound returns `unavailable`, a cheaper rail
down the list gets a turn. The chain degrades on **price** as well as **liveness**:
expensive relayer A steps aside for cheaper relayer B before we ever refuse the
payment. SI-2's envelope remains the hard ceiling — if *every* rail exceeds it, the
payment fails closed.

## 10. Rail interfaces

All new code lives under `services/x402/settlement/` (orchestration, registry,
breaker — rail-neutral, SDK-free, `node:test`-able) and
`services/walletKit/evm/rails/` (EVM rail impls, where viem/SDK imports are allowed).
The adapter port is unchanged.

### 10.1 `SettlementRail` + attempt classification

```typescript
// services/x402/settlement/types.ts
import type {
  SettleX402PaymentArgs,
  X402Erc7710Challenge,
} from "../../walletKit/types.ts";

export type SettlementKind = "relayer" | "facilitator" | "direct";

/** Cheap, synchronous capability context for `supports()` / `health()`. */
export interface SettlementContext {
  chainId: number;
  challenge: X402Erc7710Challenge;
}

/**
 * A rail's self-classified attempt result. The orchestrator NEVER inspects
 * internals — it branches on `outcome` only. The split between `unavailable`
 * (failover-safe) and `terminal_failure` (stop) is the rail's contractual
 * responsibility and is audited per §9.2 / SP-1.
 */
export type SettlementAttempt =
  | {
      outcome: "settled";
      rail: SettlementKind;
      proof: string;             // tx hash envelope (Mode A) OR signed X-PAYMENT (Mode B)
      txHash?: string;           // present in Mode A; absent in Mode B (seller settles)
      settlesOnRetry?: boolean;  // true in Mode B (§9.1): no funds moved yet; seller settles on retry
      spentAtoms: bigint;
    }
  | { outcome: "over_budget"; requestedAtoms: bigint; remainingBudgetAtoms: bigint }
  | { outcome: "terminal_failure"; reason: string }   // funds MAY have moved → STOP (SP-1)
  | { outcome: "unavailable"; reason: string };        // provably pre-broadcast → try next

export interface SettlementRail {
  readonly id: string;            // 'oneshot-relayer', 'erc7710-facilitator'
  readonly kind: SettlementKind;
  readonly priority: number;      // lower = tried first (matches MultiProvider)

  /** Can this rail service THIS challenge at all? (network, SDK, config). */
  supports(ctx: SettlementContext): boolean;

  /** Optional liveness probe feeding the breaker; never called per-payment. */
  health?(ctx: SettlementContext): Promise<boolean>;

  /**
   * Settle exactly one challenge. MUST be all-or-nothing observable and MUST
   * classify failure per §9.2. `reason` is friendly copy only (SI-6).
   * Carries `idempotencyKey` (SP-5); pass it through where the backend honours it.
   */
  attempt(args: SettleX402PaymentArgs, idempotencyKey: string): Promise<SettlementAttempt>;
}
```

### 10.2 Circuit breaker (mirrors `MultiProvider` health model)

```typescript
// services/x402/settlement/breaker.ts
export type RailHealth = "healthy" | "degraded" | "down";

export interface BreakerConfig {
  failuresToDown: number;   // consecutive `unavailable` before 'down' (default 3)
  cooldownMs: number;       // skip window once 'down' (default 60_000)
}

export interface SettlementBreaker {
  isUsable(railId: string): boolean;       // false while 'down' + cooling
  recordSuccess(railId: string): void;     // → healthy, reset counters
  recordFailure(railId: string): void;     // ++; threshold → down + cooldown
  health(railId: string): RailHealth;
}
```

> Identical state machine to
> [`MultiProvider.checkHealth`](file:///home/cstralpt/takumipay/mobile-app/services/rpc/MultiProvider.ts)
> (`consecutiveHealthy` / `degraded` / `down`), minus the rate limiter (settlements
> are infrequent — no token bucket needed). In-memory (N5).

### 10.3 Registry + orchestrator

```typescript
// services/x402/settlement/registry.ts — rails SELF-REGISTER at bootstrap, mirroring
// services/walletKit/bootstrap.ts (space docking, §3.2). Adding a rail = one
// registerRail() line; the registry itself needs no central edit.
export interface SettlementRailRegistry {
  candidates(ctx: SettlementContext): SettlementRail[];   // config-ordered, capability-filtered
}

const RAILS: SettlementRail[] = [];
export function registerRail(rail: SettlementRail): void { RAILS.push(rail); }

export function settlementRailRegistry(
  resolveCfg = resolveSettlementRails,
): SettlementRailRegistry {
  return {
    candidates: (ctx) =>
      RAILS
        .filter((r) => isEnabled(r.id, resolveCfg))   // presence/enabled = registered (SP-6)
        .filter((r) => r.supports(ctx))
        .sort((a, b) => a.priority - b.priority),
  };
}

// services/walletKit/evm/rails/bootstrap.ts — wired from EVM kit init.
// ADD A RAIL = ADD ONE LINE HERE (same shape as per-namespace adapter wiring):
//   registerRail(createRelayerBroadcastRail(cfg.relayer));
//   registerRail(createErc7710FacilitatorRail(cfg.facilitator));

// services/x402/settlement/settleWithFallback.ts
export async function settleWithFallback(
  args: SettleX402PaymentArgs,
  registry: SettlementRailRegistry,
  breaker: SettlementBreaker,
): Promise<SettleX402PaymentResult> {
  const ctx = { chainId: assertEvmChain(args.chain).chain.id, challenge: args.challenge };

  // Budget gate is rail-independent and runs ONCE, here (SI-1 / SP-4).
  const requestedAtoms = parseAtomsOrFail(args.challenge.maxAmountRequired);
  if (requestedAtoms === null) return { status: "failed", reason: friendlySettlementError() };
  if (requestedAtoms > args.remainingBudgetAtoms) {
    return { status: "over_budget", requestedAtoms, remainingBudgetAtoms: args.remainingBudgetAtoms };
  }

  const candidates = registry
    .candidates(ctx)
    .filter((r) => breaker.isUsable(r.id));      // skip 'down'/cooling (SP-7)
  if (candidates.length === 0) {
    return { status: "failed", reason: friendlySettlementError() };  // no usable rail
  }

  const idempotencyKey = deriveIdempotencyKey(ctx);  // SP-5
  let lastReason = friendlySettlementError();

  for (const r of candidates) {                  // STRICTLY SEQUENTIAL (SP-3)
    const res = await r.attempt(args, idempotencyKey).catch((err) => {
      logX402Debug(`${r.id} threw`, err);
      // An uncaught throw is NOT proof of no broadcast → terminal (SP-2).
      return { outcome: "terminal_failure", reason: friendlySettlementError() } as const;
    });

    switch (res.outcome) {
      case "settled":
        breaker.recordSuccess(r.id);
        return { status: "settled", rail: res.rail, txHash: res.txHash, proof: res.proof, spentAtoms: res.spentAtoms };
      case "over_budget":
        return { status: "over_budget", requestedAtoms: res.requestedAtoms, remainingBudgetAtoms: res.remainingBudgetAtoms };
      case "terminal_failure":
        return { status: "failed", reason: res.reason };   // SP-1: do NOT advance
      case "unavailable":
        breaker.recordFailure(r.id);
        lastReason = res.reason;
        continue;                                          // the ONLY advancing path
    }
  }
  return { status: "failed", reason: lastReason };
}
```

`settleX402PaymentEvm` (the adapter method) shrinks to:

```typescript
// services/walletKit/evm/x402Settle.ts (after refactor)
export async function settleX402PaymentEvm(
  args: SettleX402PaymentArgs,
  deps: SettleDeps = DEFAULT_SETTLE_DEPS,   // { registry, breaker } — injectable for tests
): Promise<SettleX402PaymentResult> {
  return settleWithFallback(args, deps.registry, deps.breaker);
}
```

## 11. The rails

### 11.1 Relayer broadcast rail (1Shot as the default client)

The existing relayer body moves **verbatim** into `attempt()`; the only new work is
classifying failures per §9.2 around the `send` boundary.

```typescript
// services/walletKit/evm/rails/RelayerBroadcastRail.ts
export function createRelayerBroadcastRail(
  cfg: RelayerRailConfig,               // endpoints/keys from config — NOT hardcoded (SP-6)
  relayerDeps = DEFAULT_RELAYER_DEPS,   // the current X402SettleDeps
): SettlementRail {
  return {
    id: cfg.id ?? "oneshot-relayer",
    kind: "relayer",
    priority: cfg.priority ?? 10,

    supports: (ctx) => cfg.enabledChainIds.includes(ctx.chainId),

    async health(ctx) {
      try { return !!(await relayerDeps.getCapabilities({ chainId: ctx.chainId }))[ctx.chainId]; }
      catch { return false; }
    },

    async attempt(args, idempotencyKey) {
      const chainId = assertEvmChain(args.chain).chain.id;
      // ── pre-submission: every failure here is `unavailable` (failover-safe) ──
      let caps, feeData, estimate, bundle, feeAmount;
      try {
        caps = await relayerDeps.getCapabilities({ chainId });
        const feeCollector = caps[chainId]?.feeCollector;
        if (!isAddress(feeCollector)) return unavailable();        // §9.2
        feeData = await relayerDeps.getFeeData({ chainId, token: args.challenge.asset });
        feeAmount = feeData.minFee > 0n ? feeData.minFee : 1n;
        bundle = buildBundle(args, feeCollector, feeAmount);
        estimate = await relayerDeps.estimate({ chainId, transactions: [bundle] });
        if (!estimate.success) return unavailable();
        if (estimate.requiredPaymentAmount !== undefined && estimate.requiredPaymentAmount !== feeAmount) {
          feeAmount = estimate.requiredPaymentAmount;
          bundle = buildBundle(args, feeCollector, feeAmount);
          estimate = await relayerDeps.estimate({ chainId, transactions: [bundle] });
          if (!estimate.success) return unavailable();
        }
        // SI-2 fee bound is now PER-RAIL → `unavailable` enables cost-based failover (§9.3).
        if (!feeWithinSafetyBound(feeAmount)) return unavailable("fee over bound");
        const requested = BigInt(args.challenge.maxAmountRequired);
        if (requested + feeAmount > args.remainingBudgetAtoms) {
          return { outcome: "over_budget", requestedAtoms: requested + feeAmount, remainingBudgetAtoms: args.remainingBudgetAtoms };
        }
      } catch (err) {
        logX402Debug("oneshot pre-submit", err);
        return unavailable();                                      // nothing broadcast yet
      }

      // ── SUBMISSION BOUNDARY ── from here, any failure is terminal (SP-1/SP-2) ──
      try {
        const { taskId } = await relayerDeps.send({
          chainId, transactions: [bundle], context: estimate.context ?? "",
          idempotencyKey,                                          // SP-5 where supported
        });
        const status = await pollToTerminal(chainId, taskId, relayerDeps);
        if (status.kind === "failed" && !status.txHash) {
          // rail attests it never broadcast → safe to fail over (§9.2)
          return unavailable("relayer rejected pre-broadcast");
        }
        if (!status.txHash) return terminal();                     // ambiguous → STOP
        return {
          outcome: "settled", rail: "relayer", txHash: status.txHash,
          proof: encodeProofEnvelope({ challenge: args.challenge, rail: "relayer", txHash: status.txHash }),
          spentAtoms: BigInt(args.challenge.maxAmountRequired),
        };
      } catch (err) {
        logX402Debug("oneshot post-submit", err);
        return terminal();                                         // funds MAY have moved → STOP
      }
    },
  };
}
```

`unavailable()` / `terminal()` return the friendly-copy outcomes; raw detail is
`__DEV__`-logged (SI-6).

### 11.2 ERC-7710 facilitator rail (relayer-free, Mode B)

The server-settled rail. It **signs** the payment inside `attempt()` and lets the
*seller's* facilitator settle on the orchestrator's retry (§9.1) — so it needs no
buyer gas and no buyer-side relayer. Enabling it and disabling the relayer is the
whole of "run relayer-free" (§12.2). SDK imports are lazy so non-facilitator paths
never bundle them.

**Facilitator-agnostic by construction.** This rail is *not* bound to any one
facilitator vendor. The facilitator URL is read from `challenge.facilitator`
(seller-advertised) and validated against `cfg.allowedFacilitators`, and the rail
speaks the standard x402 `/verify` + `/settle` contract — so MetaMask's tx-sentinel,
Coinbase's facilitator, or any compliant one works unchanged, with no host compiled
in (SP-6). The only vendor-specific piece is the buyer-side *signer* that produces
the ERC-7710 payload (`deps.signPayment` — today the MetaMask smart-accounts SDK as
the reference ERC-7710 implementation); it is an injectable dep, swappable without
touching this rail. The rail is named for the **scheme** it settles (`Erc7710`),
never a vendor — which is why an EIP-3009 seller gets a sibling
`Eip3009FacilitatorRail`, not a fork of this one.

```typescript
// services/walletKit/evm/rails/Erc7710FacilitatorRail.ts
export function createErc7710FacilitatorRail(
  cfg: FacilitatorRailConfig,        // facilitator allow-list/endpoints from config — NOT hardcoded (SP-6)
  deps = DEFAULT_FACILITATOR_DEPS,   // { sdkAvailable, deriveAccount, signPayment, verify, probe } — injectable for tests
): SettlementRail {
  return {
    id: cfg.id ?? "erc7710-facilitator",
    kind: "facilitator",
    priority: cfg.priority ?? 10,

    // Capable only for the ERC-7710 delegation scheme, when the seller names a
    // facilitator AND the buyer SDK is present. (An EIP-3009 seller is served by a
    // sibling Eip3009FacilitatorRail with the same Mode-B shape.)
    supports: (ctx) =>
      ctx.challenge.assetTransferMethod === "erc7710" &&
      !!ctx.challenge.facilitator &&
      cfg.allowedFacilitators.includes(originOf(ctx.challenge.facilitator!)) &&  // SI-3
      deps.sdkAvailable(),

    // Liveness = GET the facilitator's /supported (or HEAD /verify). Settles
    // nothing; just feeds the breaker so a dead facilitator is skipped (SP-7).
    async health(ctx) {
      return deps.probe(ctx.challenge.facilitator!).catch(() => false);
    },

    async attempt(args, idempotencyKey) {
      // 1. Derive the buyer smart account from the SESSION-bound wallet (SI-4) —
      //    never activeWallet/activeChain. Same isolation rule as the dApp bridge.
      let signedPayment: string;
      try {
        const account = await deps.deriveAccount(args.wallet, args.chain);

        // 2. Seed the SDK delegation provider (createx402DelegationProvider) with
        //    the STORED user→agent delegation as parentPermissionContext (the
        //    budget). No new on-chain primitive (N1) — it issues an open
        //    redelegation the facilitator redeems; the period/amount caveat bounds spend.
        signedPayment = await deps.signPayment({
          account,
          parentPermissionContext: await encodeDelegations({
            chain: args.chain, delegations: [args.delegation],
          }),
          challenge: args.challenge,     // → SDK paymentRequirements
          idempotencyKey,                // SP-5 where the SDK threads it
        });
      } catch (err) {
        logX402Debug("facilitator sign", err);
        return unavailable();            // signing failed → nothing moved → fail over (SP-1)
      }

      // 3. NON-SETTLING /verify pre-check (§9.1). The reason a facilitator outage
      //    is failover-safe: /verify validates the payload + confirms the
      //    facilitator is up WITHOUT moving any funds.
      const verify = await deps
        .verify(args.challenge.facilitator!, signedPayment, args.challenge)
        .catch(() => ({ reachable: false, ok: false }));

      if (!verify.reachable) return unavailable("facilitator unreachable");      // fail over
      if (!verify.ok)        return unavailable("facilitator rejected payload");  // fail over

      // 4. Hand back the signed payload as the proof. ACTUAL settlement happens
      //    when the orchestrator retries with X-PAYMENT and the seller forwards to
      //    /settle (Mode B). Submission boundary = that retry (§9.1); past it, a
      //    non-200 retry is terminal for the chain — never a fail-over.
      return {
        outcome: "settled",
        rail: "facilitator",
        proof: signedPayment,            // the real X-PAYMENT envelope, not a tx hash
        settlesOnRetry: true,            // marks Mode B for the orchestrator + receipt
        spentAtoms: BigInt(args.challenge.maxAmountRequired),  // optimistic — see OQ-5
      };
    },
  };
}
```

> **Why no `txHash`.** In Mode B the buyer never broadcasts, so the rail has no hash
> to return. The settlement tx is reported back in the seller's `PAYMENT-RESPONSE`
> on the 200 retry; the orchestrator can lift it there for the receipt card (which
> already renders a missing hash gracefully). The relayer-vs-facilitator difference
> stays invisible to the agent and to the `WalletKitAdapter` port.

> **Facilitator allow-list (SP-3 / SI-3).** `supports()` checks
> `challenge.facilitator` against `cfg.allowedFacilitators` so a malicious seller
> can't name an attacker-controlled "facilitator". The signed delegation's `payTo` +
> `asset` binding (SI-3) already constrains where funds can go, but the allow-list
> stops the buyer from *signing for* an unknown redeemer.

## 12. Rail config & operations

### 12.1 Rail config (in-code default + remote override)

```typescript
// services/x402/settlement/config.ts
export interface SettlementRailConfig {
  id: string;
  kind: SettlementKind;
  enabled: boolean;            // presence/enabled = registered (SP-6)
  priority: number;            // operator-tunable ordering
  endpoint?: string;           // resolved from config, never compiled-in
  feeCapUsdcAtoms?: string;    // optional per-rail fee ceiling (≤ SI-2 envelope)
}

// Safe baseline shipped in the binary — ids + priorities only, no secrets.
// `erc7710-facilitator` ships DISABLED only because the buyer SDK isn't a dependency
// yet — it is a fully-specified rail (§11.2), not a stub. Flip `enabled` once the SDK
// lands (or apply RELAYER_FREE_PROFILE below).
export const DEFAULT_SETTLEMENT_RAILS: SettlementRailConfig[] = [
  { id: "oneshot-relayer",     kind: "relayer",     enabled: true,  priority: 10 },
  { id: "erc7710-facilitator", kind: "facilitator", enabled: false, priority: 20 },
];

// Operator preset: run RELAYER-FREE. Enable the server-settled facilitator at the
// top, disable the relayer. No code change; x402 then settles entirely server-side
// (Mode B, §9.1) — buyer signs, seller's facilitator settles, no buyer gas.
export const RELAYER_FREE_PROFILE: SettlementRailConfig[] = [
  { id: "erc7710-facilitator", kind: "facilitator", enabled: true,  priority: 10 },
  { id: "oneshot-relayer",     kind: "relayer",     enabled: false, priority: 20 },
];

// Remote override (served by backend/agent-api, cached like custom_rpcs):
//   enable/disable, reorder priority, set endpoints, set fee caps —
//   demote a flaky rail WITHOUT an app release. Merges over the default set by `id`;
//   unknown ids are ignored; a disabled id is not registered.
export function resolveSettlementRails(
  remote: SettlementRailConfig[] | undefined,
): SettlementRailConfig[] { /* merge by id, default wins only on absence */ }
```

Same two-tier model as
[`MultiProvider`](file:///home/cstralpt/takumipay/mobile-app/services/rpc/MultiProvider.ts)
(`DEFAULT_PROVIDERS` + `custom_rpcs`) and the same control surface as the fiat PSP
dashboard: reorder priorities, flip `enabled`, swap endpoints — live.

### 12.2 Making 1Shot optional / running relayer-free
* **Disable for a release:** remote config sets `oneshot-relayer.enabled = false`.
  The registry stops registering it; payments route to the next enabled rail.
* **Swap for another relayer:** point `RelayerBroadcastRail` at a different relayer
  client (swap `deps` / `cfg.endpoint`), or register a second relayer-rail instance
  at a lower `priority`. 1Shot is just the default *client* of the relayer rail, not
  the rail itself — switching relayers is config, not a rewrite.
* **Go relayer-free (facilitator — the primary path):** apply `RELAYER_FREE_PROFILE`
  (§12.1) — enable `erc7710-facilitator` at priority `10`, disable `oneshot-relayer`.
  x402 then settles **entirely server-side** (Mode B, §9.1): the buyer only signs,
  the seller's facilitator settles, **no buyer gas and no buyer-side relayer.** The
  orchestrator, the port, and `agent-api` are unchanged.
* **Go relayer-free (direct on-chain):** alternatively register `DirectBroadcastRail`
  (self-broadcast from the smart account, Mode A) at priority `10` and disable the
  relayers — for when you'd rather broadcast yourself than depend on any third party.
  Needs gas on the device wallet (or a paymaster).

### 12.3 Priority & failover policy (operator-facing)
* `priority` ascending = preference order (matches MultiProvider). Ties broken by
  registry order.
* A rail that returns `unavailable` 3× consecutively (`failuresToDown`) is marked
  `down` and skipped for `cooldownMs` (default 60 s) — a flapping facilitator can't
  slow every payment (SP-7).
* The background health sweep (optional, 60 s cadence, mirrors
  [`startHealthMonitoring`](file:///home/cstralpt/takumipay/mobile-app/services/rpc/MultiProvider.ts))
  can pre-mark `down` rails so the *first* payment of a session doesn't eat the
  timeout.

### 12.4 Observability
* Per-attempt `__DEV__` log: `{ railId, outcome, priority, breakerHealth }` (no raw
  bodies — SI-6).
* The receipt card already surfaces `rail`; extend the executor output with the
  winning `rail_id` so the activity feed can show *which* rail settled (purely
  informational; still no raw error text).

---

## 13. Security Invariants & Audit Guidelines

> SI-1…SI-8 from the Phase 5 spec are **carried over unchanged**. CI-* govern the
> resource catalog (Part I); SP-* govern rail selection and failover (Part II).

### Catalog invariants (Part I)
* **CI-1. No hardcoded resource host in code.** A resource URL lives only in its
  catalog config/DB row; code resolves it by `id`. Mirrors SP-6 / SI-7.
* **CI-2. The model never receives a raw URL.** It selects a `resource` from a closed
  enum (or calls an x402-bound tool); the server resolves the URL. This deletes the
  URL-invention failure class the pin hack patched over, and bounds the agent to the
  catalog (no arbitrary fetch — N3).
* **CI-3. Presence/`enabled` = exposed.** A resource with no resolvable URL or
  `enabled:false` is in neither the `x402_fetch` enum nor the prompt — it does not
  exist to the agent.
* **CI-4. Per-resource spend ceiling.** `expectedMaxUsdc` flows into the tool's
  `maxSpendUsdc`; it only ever *narrows* the on-chain allowance, never widens it
  (carryover of Phase 5 budget rules).
* **CI-5. Resource bodies are data, not UI.** A resolved resource's response (or any
  resolution error) is tool data; raw server text never reaches the user
  (CLAUDE.md user-facing-errors). Curated friendly copy only.

### Rail invariants (Part II)
* **SP-1. No failover after submission.** The orchestrator advances to another rail
  **only** on an `unavailable` outcome, which a rail emits **only** with positive
  evidence no value-bearing transaction was broadcast (pre-submission failure, or
  rail-attested terminal-failed with no tx hash — §9.2). All post-submission
  ambiguity is `terminal_failure` and stops the chain. *The anti-double-spend
  invariant.*
* **SP-2. Uncaught throw ⇒ terminal.** An `attempt()` that throws is treated as
  `terminal_failure`, never `unavailable` — a throw is not proof of no broadcast.
* **SP-3. Single-flight / sequential.** At most one `attempt()` in flight per
  challenge; rails are never raced (parallel = double-spend).
* **SP-4. Gates run once, rail-independent.** The budget gate (SI-1) runs in the
  orchestrator before dispatch. The fee bound (SI-2) is re-asserted by each rail for
  its own fee; exceeding it yields `unavailable` (cost-based failover, §9.3) — never
  a silent overpay.
* **SP-5. Idempotency where supported.** Each attempt carries a stable
  `idempotencyKey` derived from `(payTo, asset, maxAmountRequired, resource,
  network)`; rails forward it to backends that honour it. Defense-in-depth — SP-1 is
  the real backstop.
* **SP-6. Rail & facilitator neutrality / config-driven.** No vendor is wired in.
  Rail endpoints + enablement come from config (default set + remote override), and
  the **facilitator is whatever the seller advertises** in the 402 challenge —
  validated against a config allow-list, never a hardcoded host. Presence/`enabled` =
  registered; switching relayers or facilitators touches config, not the orchestrator
  (carryover of SI-7).
* **SP-7. Health isolation.** A `down`/cooling rail is skipped before `attempt()`.
  Breaker state is keyed by `railId` and never blocks a *different*, healthy rail.
* **SP-8. Error discipline.** Rail `reason` is hand-written friendly copy; raw
  relayer/facilitator bodies, HTTP status, RPC payloads → `__DEV__` logs only
  (carryover of SI-6).
* **SP-9. Chain-agnostic guardrail.** `services/x402/settlement/` and the
  registry/breaker contain **no** `namespace === "eip155"` branch and MUST pass
  `pnpm check:chains`. Rail selection is by `supports()` + `priority`, never a
  chain-id string branch (carryover of SI-8). EVM rail impls live under `evm/rails/`.

---

## 14. Test Plan & Acceptance Criteria

### Catalog tests (Part I — agent-api)
* **Enum reflects enabled only.** `enabledResourceIds()` excludes disabled /
  URL-less rows; the `x402_fetch` enum is built from it.
* **Resolution.** `getResource(id)` → URL + method; an unknown `resource` id yields a
  friendly result, never a thrown raw error (CI-5).
* **Pin hack gone.** A model input with an arbitrary `url` field is impossible
  (schema has no `url`); a `resource` outside the enum is rejected by the schema.
* **x402-bound tool dispatch.** `defi_security_audit({ protocol })` resolves
  `x402:{resourceId}` → URL via `buildRequest`, sets `maxSpendUsdc` from
  `expectedMaxUsdc` (CI-4), and dispatches the mobile `x402_fetch` machinery.
* **Prompt generation.** One hint block per enabled resource; **zero** enabled →
  empty string (the old `if (!url) return ''` generalised).
* **Extensibility (the headline).** Adding a second `X402Resource` row needs **no
  code change** in the resolver, prompt, or schema wiring — only data.

### Rail unit tests (Part II — `node:test` / Vitest)
* **Selection order.** Three mock rails (priority 10/20/30) → ascending order; a
  `down` rail is skipped.
* **Failover on `unavailable`.** Rail A `unavailable` → B tried; A's breaker
  increments; B's `settled` returned with `rail`/`txHash`.
* **STOP on `terminal_failure` (SP-1).** Rail A `terminal_failure` → orchestrator
  returns `failed` and **never calls B's `attempt()`**. The single most important test.
* **Throw ⇒ terminal (SP-2).** A rail whose `attempt()` rejects → `terminal_failure`;
  B not tried.
* **Submission boundary (1Shot, Mode A).** `estimate` failure → `unavailable` (B
  tried); `send` throws → `terminal_failure`; poll timeout → `terminal_failure`;
  terminal-failed-no-txHash → `unavailable`.
* **Mode-B boundary (facilitator, §9.1).** `signPayment` throws → `unavailable`;
  `/verify` unreachable → `unavailable`; `/verify` rejects → `unavailable`; `/verify`
  ok → `settled` with `settlesOnRetry:true`, `proof` = the signed envelope, **no
  `txHash`**, and the broadcast/settle dep **never called** (assert zero invocations).
* **Facilitator allow-list (SI-3).** A facilitator outside `cfg.allowedFacilitators`
  → `supports()` false → rail skipped, never signs.
* **Cost-based failover (§9.3).** Rail A fee over bound → `unavailable`; cheaper rail
  B settles.
* **Budget gate once (SP-4).** `over_budget` returns before any rail (zero `attempt()`).
* **Breaker.** 3 consecutive `unavailable` → `down`; skipped within `cooldownMs`;
  `recordSuccess` restores `healthy`.
* **Config merge.** Remote `enabled:false` for `oneshot-relayer` ⇒ not in
  `candidates`; reordered `priority` changes try order; unknown id ignored.
* **No-rail / error sanitisation (SP-8).** Empty registry → `failed` with friendly
  copy; a 500 from any rail → friendly `reason`, raw body only under stubbed `__DEV__`.

### Integration tests
* **Full loop (mocked fetch + relayer).** `runAgentX402Fetch` unchanged:
  `probe(402) → settleWithFallback → retry(200)`; resource returned, ledger advanced
  once, exactly one rail charged.
* **Relayer-free profile (Mode B, e2e).** With `RELAYER_FREE_PROFILE`, the facilitator
  rail signs, the orchestrator retries with the signed `X-PAYMENT`, the mocked seller
  returns 200; result `rail:"facilitator"`, `settlesOnRetry:true`, **no buyer
  broadcast** (assert relayer/walletClient never touched).
* **Facilitator down → relayer fallback.** Both rails enabled (facilitator 10, relayer
  20); `/verify` unreachable → `unavailable` → relayer (Mode A) settles;
  `rail:"relayer"`. Proves cross-mode failover.
* **Docking parity.** EVM kit still registers `settleX402Payment`; Solana/Sui leave it
  `undefined` and compile (`pnpm check:chains`, `pnpm check:syntax`).

### Acceptance criteria
1. **Catalog extensibility:** a second resource is added end-to-end by inserting one
   `X402Resource` row — no code change to prompt, schema, or resolver (G1, G5).
2. **No URL invention:** the agent cannot pass an arbitrary URL; it selects a
   `resource` enum or calls an x402-bound tool; the server resolves the URL (G2, CI-2).
3. **Per-tool binding:** an x402-bound tool settles through `x402_fetch`; an unbound
   tool is unaffected (G3).
4. **Relayer optional:** with `oneshot-relayer.enabled:false`, payment still settles
   via the next enabled rail — config only (G7).
5. **Safety boundary:** a pre-submission failure fails over; a post-submission failure
   stops the chain — proven by the SP-1 test (B not invoked) (G9).
6. **Relayer-free:** with `RELAYER_FREE_PROFILE`, a payment completes with **zero
   buyer broadcast and zero buyer-side relayer** (G13). Re-enabling the relayer
   restores Mode A with no code change.
7. **Invariants intact:** every Phase 5 acceptance criterion still passes; `pnpm
   check:chains`, `pnpm test`, `pnpm check:syntax` pass; Solana/Sui unaffected (G11,
   G12, SP-9).

---

## 15. Migration & Rollout

### Part I — Resource catalog (agent-api)
* **A. Introduce the catalog, behaviour-preserving.** Add `X402Resource` + the
  `enabledResources()/getResource()` loader, seeded from the existing
  `X402_SECURITY_AUDIT_URL` as one entry. Replace the three hardcoded touchpoints
  (prompt block, pin hack, boot log) with catalog-driven equivalents. With one entry,
  behaviour is identical.
* **B. Switch the schema to `resource`.** Change `x402_fetch` to the `resource` enum
  and replace the pin hack with the resolver (§6.1). The pin hack is now deletable.
* **C. Move to the DB.** Add the Prisma `X402Resource` table + Valkey cache; env
  becomes a dev seed. The loader interface is unchanged.
* **D. Add a second resource.** Insert a second row (e.g. a premium price feed) to
  prove the extensibility acceptance — no code change.

### Part II — Settlement rails (mobile)
* **1. Extract, no behaviour change.** Introduce `SettlementRail`, the registry, and
  the breaker. Wrap the current relayer body as `RelayerBroadcastRail` (prio 10) and
  the `settleViaFacilitator` seam as `Erc7710FacilitatorRail` (disabled).
  `settleX402PaymentEvm` delegates to `settleWithFallback`. With only 1Shot enabled,
  behaviour is byte-for-byte the Phase 5 path — the test suite is the gate.
* **2. Classify failures (SP-1).** Split the 1Shot body at the `send` boundary into
  `unavailable` vs `terminal_failure`. The security-critical diff — worth a focused
  review.
* **3. Remote config.** Add the cached override surface (merge over
  `DEFAULT_SETTLEMENT_RAILS`). 1Shot is now disable-able/reorderable from ops.
* **4. Land the facilitator rail (relayer-free).** Add the buyer SDK
  (`@metamask/x402` / `@x402/*`) and implement `Erc7710FacilitatorRail` per §11.2
  (sign + non-settling `/verify`, Mode B). Prove it in isolation with
  `RELAYER_FREE_PROFILE` against the demo seller (Phase 5 §9). **This makes "no
  relayer" real.**
* **5. Exercise cross-mode failover.** Run both rails enabled; kill the facilitator
  mid-run and confirm failover to the relayer **only** when it failed at `/verify`
  (pre-boundary), and stops (`terminal_failure`) if it failed after the retry
  committed.

**Rollback (both):** the catalog with one row + `oneshot-relayer` priority 10 and
everything else disabled = exactly today's behaviour. Both abstractions are inert
when each registry has one entry.

---

## 16. Open Questions

* **OQ-1.** Should breaker state persist across app launches (N5)? Default no; revisit
  if first-payment latency from a cold `down` rail is felt.
* **OQ-2.** Where do the **remote configs** live — both the catalog (Part I) and the
  rail override (Part II)? Leaning a single `agent-api`-served, cached surface (no
  secrets, so a signed static blob à la `constants/about.ts` is also viable). The two
  axes should share one config home.
* **OQ-3.** Generic `x402_fetch(resource)` vs semantic tools (`defi_security_audit`):
  keep both (primitive + high-intent), or collapse to semantic tools only once enough
  exist? Default: keep both.
* **OQ-4.** Do we expose `rail_id` / resource `id` in the receipt card, or keep them
  ops-only? (Informational; no security weight.)
* **OQ-5.** Mode-B ledger accounting is optimistic: the orchestrator advances
  [`X402SpendLedger`](file:///home/cstralpt/takumipay/mobile-app/services/x402/budget.ts)
  by `spentAtoms` *before* the retry, but in Mode B the seller settles *during* the
  retry. A failed retry can leave the local ledger over-counted — conservative (it
  under-spends, never a double-spend; the on-chain caveat is unaffected). Reconcile
  against `PAYMENT-RESPONSE` / on-chain on a failed Mode-B retry, or accept the drift?
* **OQ-6.** Idempotency-key support varies by relayer/facilitator (SP-5). Require a
  rail to *declare* idempotency support so the orchestrator can be stricter about
  constrained retries where it's available?
* **OQ-7.** Should a Mode-B rail's `attempt()` optionally *settle directly* (call the
  facilitator `/settle` itself) rather than defer to the seller's retry — turning it
  into a Mode-A-style in-`attempt()` boundary with a tx-hash proof? Simpler SP-1
  reasoning, but couples us to non-standard facilitator behaviour. Default: no.
