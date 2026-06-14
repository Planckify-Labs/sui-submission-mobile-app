/**
 * `settlement/config` — the two-tier rail config (§12.1).
 *
 * Same model as `MultiProvider` (`DEFAULT_PROVIDERS` + `custom_rpcs`): a
 * safe in-binary baseline (ids + priorities only, **no secret endpoints**)
 * plus a remote override (enable/disable, reorder, endpoints, per-rail fee
 * cap) merged by `id`. Presence + `enabled` = registered (SP-6). No vendor
 * host is ever compiled in — the relayer endpoint comes from each rail's
 * own config and the facilitator is whatever the seller advertises.
 */

import type { SettlementKind } from "./types.ts";

export interface SettlementRailConfig {
  id: string;
  kind: SettlementKind;
  /** presence + enabled = registered (SP-6). */
  enabled: boolean;
  /** operator-tunable ordering; lower = tried first. */
  priority: number;
  /** resolved from config, never compiled-in. */
  endpoint?: string;
  /** optional per-rail fee ceiling in atoms (≤ the SI-2 envelope). */
  feeCapUsdcAtoms?: string;
  /**
   * Facilitator allow-list (origins) for a `facilitator` rail (SI-3 / SP-6).
   * API-driven so an operator can authorise a new facilitator without an app
   * release. Ignored by non-facilitator rails.
   */
  allowedFacilitators?: string[];
}

const SETTLEMENT_KINDS: readonly SettlementKind[] = [
  "relayer",
  "facilitator",
  "direct",
];

/**
 * Validate an untrusted remote config blob into `SettlementRailConfig[]`.
 * The remote override is **external data** — every field is shape-checked
 * and bad entries are dropped (never thrown — CLAUDE.md user-facing-errors).
 * Returns `undefined` when the payload isn't a usable array so callers fall
 * back to {@link DEFAULT_SETTLEMENT_RAILS}.
 */
export function parseRailOverride(
  raw: unknown,
): SettlementRailConfig[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: SettlementRailConfig[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (typeof r.id !== "string" || r.id.length === 0) continue;
    if (!SETTLEMENT_KINDS.includes(r.kind as SettlementKind)) continue;
    if (typeof r.enabled !== "boolean") continue;
    if (typeof r.priority !== "number" || !Number.isFinite(r.priority)) {
      continue;
    }
    const entry: SettlementRailConfig = {
      id: r.id,
      kind: r.kind as SettlementKind,
      enabled: r.enabled,
      priority: r.priority,
    };
    if (typeof r.endpoint === "string") entry.endpoint = r.endpoint;
    if (typeof r.feeCapUsdcAtoms === "string") {
      entry.feeCapUsdcAtoms = r.feeCapUsdcAtoms;
    }
    if (
      Array.isArray(r.allowedFacilitators) &&
      r.allowedFacilitators.every((f) => typeof f === "string")
    ) {
      entry.allowedFacilitators = r.allowedFacilitators as string[];
    }
    out.push(entry);
  }
  return out;
}

/**
 * Safe baseline shipped in the binary — ids + priorities only, no secrets.
 * `erc7710-facilitator` ships DISABLED only because the buyer SDK isn't a
 * dependency yet — it is a fully-specified rail (§11.2), not a stub. Flip
 * `enabled` once the SDK lands (or apply {@link RELAYER_FREE_PROFILE}).
 */
export const DEFAULT_SETTLEMENT_RAILS: SettlementRailConfig[] = [
  { id: "oneshot-relayer", kind: "relayer", enabled: true, priority: 10 },
  {
    id: "erc7710-facilitator",
    kind: "facilitator",
    enabled: false,
    priority: 20,
  },
];

/**
 * Operator preset: run RELAYER-FREE. Enable the server-settled facilitator
 * at the top, disable the relayer. No code change; x402 then settles
 * entirely server-side (Mode B, §9.1) — buyer signs, seller's facilitator
 * settles, no buyer gas and no buyer-side relayer.
 */
export const RELAYER_FREE_PROFILE: SettlementRailConfig[] = [
  {
    id: "erc7710-facilitator",
    kind: "facilitator",
    enabled: true,
    priority: 10,
  },
  { id: "oneshot-relayer", kind: "relayer", enabled: false, priority: 20 },
];

/**
 * Remote override merge. Starts from `defaults`; for each remote entry
 * whose `id` exists in the defaults, its fields win (enable/disable,
 * reorder, endpoint, fee cap). Unknown remote ids are ignored — adding a
 * brand-new rail is a code change (a rail file + a default-config row), not
 * a remote flip. A disabled id stays in the list but is filtered at
 * registration time.
 */
export function resolveSettlementRails(
  remote?: SettlementRailConfig[],
  defaults: SettlementRailConfig[] = DEFAULT_SETTLEMENT_RAILS,
): SettlementRailConfig[] {
  if (!remote || remote.length === 0) return defaults.map((c) => ({ ...c }));
  const overrides = new Map(remote.map((c) => [c.id, c]));
  return defaults.map((base) => {
    const override = overrides.get(base.id);
    return override ? { ...base, ...override } : { ...base };
  });
}

/** Whether `railId` is present AND enabled in the resolved config (SP-6). */
export function isEnabled(
  resolved: SettlementRailConfig[],
  railId: string,
): boolean {
  return resolved.find((c) => c.id === railId)?.enabled === true;
}

/**
 * Resolved priority for `railId` — the config value wins so a remote
 * reorder takes effect; falls back to the rail's intrinsic `priority` when
 * the id isn't in the config.
 */
export function priorityOf(
  resolved: SettlementRailConfig[],
  railId: string,
  fallback: number,
): number {
  const entry = resolved.find((c) => c.id === railId);
  return entry ? entry.priority : fallback;
}
