/**
 * `refreshSettlementRailConfig` — best-effort boot-time refresh of the
 * API-driven rail override (x402-extensibility-spec §12.1, OQ-2).
 *
 * Fetches the backend rail config, validates it, and caches it on device
 * so the (synchronous) settlement registry can read it per payment. This
 * is the only place that touches the network/`ky` — kept out of the
 * settlement registry + store so those stay synchronous and node-safe.
 *
 * Fully best-effort: any failure leaves the previously-cached (or default)
 * rails in place and is dev-logged only — never surfaced to the user
 * (CLAUDE.md user-facing-errors). Mirrors how `MultiProvider` tolerates a
 * missing custom-RPC store.
 */

import { settlementRailsApi } from "@/api/endpoints/settlementRails";
import { parseRailOverride } from "./settlement/config.ts";
import { logSettlementDebug } from "./settlement/errors.ts";
import { setCachedRailOverride } from "./settlementRailConfigStore.ts";

/**
 * Fetch + validate + cache the remote rail override. Returns `true` when a
 * fresh override was cached, `false` on any failure (cache untouched).
 * Call once at app boot (fire-and-forget) and optionally on a timer.
 */
export async function refreshSettlementRailConfig(): Promise<boolean> {
  try {
    const raw = await settlementRailsApi.getRailConfig();
    const parsed = parseRailOverride(raw);
    if (!parsed) {
      logSettlementDebug("rail config fetch: unusable payload");
      return false;
    }
    setCachedRailOverride(parsed);
    logSettlementDebug("rail config refreshed", { count: parsed.length });
    return true;
  } catch (err) {
    logSettlementDebug("rail config fetch failed", err);
    return false;
  }
}
