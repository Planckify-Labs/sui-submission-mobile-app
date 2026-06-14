/**
 * Pure helper functions backing the "Agent Permissions" settings screen.
 *
 * Extracted out of the screen component so they can be unit-tested with
 * Node's `node:test` runner (same pattern as task 11/12) without pulling
 * in a React Native renderer.
 *
 * Spec: `AGENT_PROTOCOL.md` §6 "App Settings: Managing Active Grants"
 *       and §6 "Default Permission Mode".
 */

import type {
  GrantLifetime,
  GrantScope,
  PermissionGrant,
} from "./permissionGrantStore.ts";

// --- Default mode ----------------------------------------------------------

/**
 * The three user-facing "default mode" presets described in §6.
 *
 * - `always_ask`   — a global `always_ask` grant is installed. Every write
 *                    goes through the approval sheet regardless of policy.
 * - `agent_decides` — no global override grant. The wallet's
 *                     `ApprovalPolicy` drives every UX treatment decision.
 * - `full_auto`    — a global `permanent` grant is installed. The agent
 *                    executes writes silently until revoked. Power users.
 */
export type DefaultPermissionMode =
  | "always_ask"
  | "agent_decides"
  | "full_auto";

/**
 * Derive the currently-selected default mode from the grants the user
 * already has in their store.
 *
 * Precedence:
 *   1. A global `always_ask` grant → "always_ask" (hard override, wins
 *      over everything — matches the `resolveGrant()` priority in
 *      `permissionGrantStore.ts`).
 *   2. A global `permanent` grant → "full_auto".
 *   3. Otherwise → "agent_decides" (the conservative default).
 *
 * Tool- and capability-scoped grants never flip the mode selector — they
 * live alongside it. That means a user who has one `session` grant for a
 * single tool still sees "Agent decides" as their mode, which is the
 * correct mental model: the mode describes the *default*, not the
 * individual per-tool overrides the user has accumulated.
 */
export function computeCurrentMode(
  grants: PermissionGrant[],
): DefaultPermissionMode {
  for (const g of grants) {
    if (g.scope.kind === "global" && g.lifetime.type === "always_ask") {
      return "always_ask";
    }
  }
  for (const g of grants) {
    if (g.scope.kind === "global" && g.lifetime.type === "permanent") {
      return "full_auto";
    }
  }
  return "agent_decides";
}

// --- Capability auto-approve ----------------------------------------------

/**
 * Check whether a capability has an active "always allow" grant —
 * i.e. a permanent grant scoped to `{ kind: "capability", key }`.
 *
 * Distinct from `computeCurrentMode`: that derives the global default
 * from global-scope grants, while this answers "does the user have a
 * standing pre-approval for this capability bucket?". The two are
 * orthogonal — a user can be in "Agent decides" mode AND have read
 * actions auto-approved at the capability level.
 *
 * Capability-permanent beats global `always_ask` because `resolveGrant`
 * checks tool > capability > global in that order and returns the
 * first non-empty match. So this toggle is a per-bucket override the
 * user opts into deliberately.
 */
export function isCapabilityAutoApproved(
  grants: PermissionGrant[],
  capability: "read" | "simulate" | "write",
): boolean {
  return grants.some(
    (g) =>
      g.scope.kind === "capability" &&
      (g.scope as { key: string }).key === capability &&
      g.lifetime.type === "permanent",
  );
}

// --- Scope label -----------------------------------------------------------

/**
 * Human-readable label for a grant scope.
 *
 * - `{ kind: "tool", key: "send_native_token" }` → "send_native_token"
 * - `{ kind: "capability", key: "read" }`        → "Read actions"
 * - `{ kind: "global" }`                         → "All actions"
 *
 * Capability labels were previously the raw "blockchain_<key>" form
 * mirrored from server logs. The settings screen now renders these
 * as user-facing rows next to the auto-approve toggles, so they need
 * to match the toggle labels.
 */
export function formatScopeLabel(scope: GrantScope): string {
  switch (scope.kind) {
    case "tool":
      return scope.key;
    case "capability":
      switch (scope.key) {
        case "read":
          return "Read actions";
        case "simulate":
          return "Simulate actions";
        case "write":
          return "Write actions";
      }
      return `blockchain_${(scope as { key: string }).key}`;
    case "global":
      return "All actions";
    case "delegation":
      return "Spending delegation";
  }
}

// --- Onchain delegation grants ---------------------------------------------

/** True for grants that carry a signed ERC-7710 onchain delegation. */
export function isDelegationGrant(grant: PermissionGrant): boolean {
  return grant.scope.kind === "delegation";
}

/**
 * Split grants into the local-policy grants the existing UI manages
 * (mode, auto-approve toggles, per-tool overrides) and the onchain
 * delegation grants rendered in their own section. Keeping delegations
 * out of the generic "Active grants" list avoids confusing the
 * local-only mental model with the onchain one.
 */
export function partitionGrants(grants: PermissionGrant[]): {
  local: PermissionGrant[];
  delegations: PermissionGrant[];
} {
  const local: PermissionGrant[] = [];
  const delegations: PermissionGrant[] = [];
  for (const g of grants) {
    if (isDelegationGrant(g)) delegations.push(g);
    else local.push(g);
  }
  return { local, delegations };
}

/** A chain's worth of onchain allowance grants, for sectioned rendering. */
export interface DelegationChainGroup {
  chainId: number;
  chainName: string;
  grants: PermissionGrant[];
}

/**
 * Group onchain delegation grants by the chain they were signed on
 * (`delegationMeta.chainId`). The settings screen renders one section
 * per chain — and because the grants are the source of truth, only the
 * chains the user has actually executed an allowance on appear, and a
 * chain disappears automatically once its last allowance is revoked.
 * Grants missing `delegationMeta` are skipped (defensive).
 *
 * Chain label priority (never show a bare chain id to the user):
 *   1. `delegationMeta.chainName` captured at signing time.
 *   2. `resolveChainName(chainId)` — a live registry lookup the caller
 *      supplies, so grants written before `chainName` existed still get
 *      a friendly name.
 *   3. `Chain <id>` — last-resort only when the chain is unknown.
 */
export function groupDelegationGrantsByChain(
  grants: PermissionGrant[],
  resolveChainName?: (chainId: number) => string | undefined,
): DelegationChainGroup[] {
  const byChain = new Map<number, DelegationChainGroup>();
  for (const g of grants) {
    const meta = g.delegationMeta;
    if (!meta) continue;
    let group = byChain.get(meta.chainId);
    if (!group) {
      const name =
        (meta.chainName && meta.chainName.trim()) ||
        resolveChainName?.(meta.chainId) ||
        `Chain ${meta.chainId}`;
      group = { chainId: meta.chainId, chainName: name, grants: [] };
      byChain.set(meta.chainId, group);
    }
    group.grants.push(g);
  }
  return [...byChain.values()].sort((a, b) =>
    a.chainName.localeCompare(b.chainName),
  );
}

// --- Lifetime label --------------------------------------------------------

export interface LifetimeLabel {
  /** Primary label: "Session", "1 hour", "Always", "Always ask". */
  primary: string;
  /** Secondary line: expiry time, grant date, session-id prefix. */
  secondary: string;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function formatTimeOfDay(ts: number): string {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  // Locale-free compact format so tests are deterministic and don't
  // depend on the host's `toLocaleDateString()` settings.
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "expired";
  const hours = ms / (1000 * 60 * 60);
  if (hours >= 1) {
    const rounded = Math.round(hours);
    return `${rounded} hour${rounded === 1 ? "" : "s"}`;
  }
  const minutes = Math.max(1, Math.round(ms / (1000 * 60)));
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

/**
 * Build the two-line lifetime label shown in the grants list.
 *
 * `nowMs` and `grantedAtMs` are passed explicitly so the function is pure
 * and the tests don't have to freeze `Date.now()` globally.
 *
 * `once` is defensively handled (returns "Once") even though a `once`
 * grant should never be persisted — callers should filter these out
 * before rendering, but we never want a crash if one leaks through.
 */
export function formatLifetimeLabel(
  lifetime: GrantLifetime,
  nowMs: number,
  grantedAtMs: number,
): LifetimeLabel {
  switch (lifetime.type) {
    case "always_ask":
      return { primary: "Always ask", secondary: "override" };
    case "once":
      return { primary: "Once", secondary: "" };
    case "session": {
      const prefix = lifetime.session_id.slice(0, 4);
      return { primary: "Session", secondary: `session #${prefix}` };
    }
    case "timed": {
      const remaining = lifetime.expires_at - nowMs;
      return {
        primary: formatDuration(remaining),
        secondary: `expires ${formatTimeOfDay(lifetime.expires_at)}`,
      };
    }
    case "permanent":
      return {
        primary: "Always",
        secondary: `granted ${formatDate(grantedAtMs)}`,
      };
  }
}

// --- List computation ------------------------------------------------------

/**
 * Render-order for the list: filters out defensive `once` entries and
 * returns a fresh array so the caller can feed it straight into a list
 * component without aliasing the store's internal state.
 *
 * This is the "render helper" the task 17 acceptance bullet targets:
 * extract it so `remove()` can be tested as a pure list transform
 * without instantiating the UI.
 */
export function listRenderableGrants(
  grants: PermissionGrant[],
): PermissionGrant[] {
  return grants.filter((g) => g.lifetime.type !== "once");
}
