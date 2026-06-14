/**
 * `settlementRails` API endpoint — fetches the remote x402 settlement-rail
 * config override (x402-extensibility-spec §12.1, OQ-2).
 *
 * The backend serves the operator-tunable rail set (enable/disable,
 * reorder priority, per-rail fee cap, facilitator allow-list) so a flaky
 * rail can be demoted — or the app flipped relayer-free — WITHOUT an app
 * release. No secrets are served; this is a public config surface.
 *
 * Error discipline: the caller treats any failure as "no override" and
 * falls back to the cached/default rails — raw errors never surface to
 * users (CLAUDE.md user-facing-errors).
 */

import { publicApi } from "@/constants/configs/ky";
import type { SettlementRailConfig } from "@/services/x402/settlement/config";

/** Backend path serving the rail override (under `EXPO_PUBLIC_API_URL`). */
export const SETTLEMENT_RAILS_PATH = "x402/settlement-rails";

export const settlementRailsApi = {
  /**
   * Fetches the raw rail override. Returns `unknown` — the caller runs it
   * through `parseRailOverride` so an unexpected shape can never crash the
   * settlement path.
   */
  getRailConfig: async (): Promise<unknown> => {
    return publicApi.get(SETTLEMENT_RAILS_PATH).json<SettlementRailConfig[]>();
  },
};
