/**
 * `settlementRailConfigStore` — on-device cache for the API-driven rail
 * override (x402-extensibility-spec §12.1, OQ-2).
 *
 * Mirrors `MultiProvider`'s `custom_rpcs`: a remote config (served by the
 * backend, fetched by `refreshSettlementRailConfig`) is cached here so the
 * settlement registry can read it **synchronously** per payment without a
 * network round-trip. The in-binary `DEFAULT_SETTLEMENT_RAILS` is the
 * fallback when nothing is cached (first launch / fetch failure).
 *
 * Node-safe: imports only `@/lib/storage/mmkv` (stubbed in the test
 * harness) and the rail-neutral config validator — no `ky`, no network.
 * Reads NEVER trigger a fetch; refresh is an explicit, separate step.
 */

import { storage } from "@/lib/storage/mmkv";
import {
  parseRailOverride,
  type SettlementRailConfig,
} from "./settlement/config.ts";
import { logSettlementDebug } from "./settlement/errors.ts";

const CACHE_KEY = "x402.settlementRailOverride.v1";

/**
 * The last cached remote override, or `undefined` when none is stored /
 * the stored blob is unusable. The settlement registry merges this over
 * `DEFAULT_SETTLEMENT_RAILS`, so `undefined` ⇒ pure defaults.
 */
export function getCachedRailOverride(): SettlementRailConfig[] | undefined {
  let json: string | undefined;
  try {
    json = storage.getString(CACHE_KEY);
  } catch (err) {
    logSettlementDebug("rail override read failed", err);
    return undefined;
  }
  if (!json) return undefined;
  try {
    return parseRailOverride(JSON.parse(json));
  } catch (err) {
    logSettlementDebug("rail override parse failed", err);
    return undefined;
  }
}

/** Persist a validated override (called by `refreshSettlementRailConfig`). */
export function setCachedRailOverride(config: SettlementRailConfig[]): void {
  try {
    storage.set(CACHE_KEY, JSON.stringify(config));
  } catch (err) {
    logSettlementDebug("rail override write failed", err);
  }
}

/** Drop the cached override (revert to in-binary defaults). */
export function clearCachedRailOverride(): void {
  try {
    storage.remove(CACHE_KEY);
  } catch (err) {
    logSettlementDebug("rail override clear failed", err);
  }
}
