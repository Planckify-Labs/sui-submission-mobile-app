# Task 17 — Mobile envelope handling + "via X specialist" badge

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** `multi-agent-architecture-spec.md` §6.4, §8.3, §10.1, §10.2.

## Why this matters

With the server emitting `origin_agent_id` and narrative-handoff
frames (Task 16), mobile needs to (a) parse them without crashing on
old payloads and (b) optionally surface "via DeFi specialist" on the
assistant bubble when a non-Core agent narrated. This is the only
user-visible affordance of the redesign — everything else under the
hood is byte-identical to today.

## Scope

- `services/agentSession/` (parser layer):
  - When a `tool_pending` / `tool_result` envelope includes
    `origin_agent_id`, pass it through to the consumer alongside the
    existing fields. When absent, treat as `undefined` — do not
    default to `"wallet"` on parse (defaulting is a render-time
    decision, see below).
  - Handle the two new frame kinds:
    - `narrative_handoff` → set a per-message `originAgentId` on the
      assistant message currently being assembled.
    - `narrative_handoff_end` → close the narrative handoff for that
      message.
  - Unknown frame kinds are ignored (forward-compat).
- `components/home/TakumiAgent/AgentMode.tsx`:
  - The cached `Message` shape gains an optional
    `originAgentId?: string`. When the parser sets it, store it on
    the message. MMKV cache layout: existing keys unchanged, the
    new field is just an extra property when present (§8.3).
  - **No filter UI** — §10.3 explicitly says conversation filters are
    out of scope for v1.
- `components/home/TakumiAgent/MessageContent.tsx` (or wherever the
  assistant bubble renders):
  - If `originAgentId` is set **and** it is not `"core"` / `"wallet"`
    (Wallet is the default narrator so we don't badge it — §10.1's
    "small affordance" applies to specialists the user wouldn't
    otherwise know about), render a small "via {displayName}"
    badge above or after the bubble.
  - Look up `displayName` from the synced manifest
    (`services/agent-executors/agentManifests.json`) — fall back to
    `originAgentId` verbatim if the manifest doesn't carry display
    names (Task 02 keeps the JSON minimal; if you need
    `display_name`, extend the manifest in this PR and re-sync).
- A tiny `useOriginAgentDisplay(originAgentId?)` hook so the badge
  component stays presentational.

## Rules (non-negotiable)

- **Backwards-compat first.** Old envelopes (no `origin_agent_id`,
  no narrative frames) must parse and render exactly as today.
  Verified by the e2e test in Task 20.
- **No badge for Core or Wallet.** §10.1 — "the user does not know
  there are multiple agents" — Core and Wallet are the default
  voice; surfacing them would confuse, not inform. DeFi (and any
  future specialist) gets the badge when it narrates (only possible
  through `core_handoff conversational: true`).
- **No new SSE events on the wire.** Mobile only reads what Task 16
  defined. Resist parsing speculative fields.
- **Persisted shape is additive.** Existing MMKV-cached
  conversations open without migration. A `Message` without
  `originAgentId` renders today's UI.
- **CLAUDE.md user-facing-error rule:** the badge is hand-written
  copy ("via {displayName}"). If `displayName` is missing, the
  fallback is the agent id (short, lower-case, derivable) — never an
  error label or null state copy.
- **Avoid useEffect for derived data** (CLAUDE.md / `avoid-useeffect`
  skill convention): the badge is derived from `message.originAgentId`
  via `useMemo` / direct render — not synced through `useEffect`.

## Acceptance

- [ ] Parser handles `origin_agent_id` and the two narrative frames;
      unknown frame kinds are ignored.
- [ ] `Message` cached shape gains the optional `originAgentId`;
      MMKV reads of pre-existing conversations are unchanged.
- [ ] Badge renders for non-Core / non-Wallet messages only.
- [ ] Visual sanity check (foreground + background): a DeFi
      `core_handoff conversational: true` flow surfaces "via DeFi"
      on the relevant assistant bubble.
- [ ] node:test covers parser branches (with + without
      `origin_agent_id`, with + without narrative frames).
- [ ] `pnpm check:syntax`, `pnpm test`, `pnpm biome:check` clean.

## Out of scope

- Filter UI / conversation grouping — §10.3 deferred.
- Any change to the approval sheet, grant store, threshold store
  (§10 reassurance list).
- Server-side wire format — Task 16.
