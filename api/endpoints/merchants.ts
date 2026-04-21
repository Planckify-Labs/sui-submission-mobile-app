import { publicApi } from "@/constants/configs/ky";
import type { TChannel } from "../types/channel";
import { buildSearchParams } from "../utils/api-helpers";

/**
 * Mobile client for the merchant lifecycle endpoints (task 27 + 28).
 * Only `getChannels` is wired in v1 — signup / profile / QR rotation
 * will land as task 12's react-query mutation swaps from the local
 * `console.log` stub to real POSTs.
 */
export const merchantApi = {
  /**
   * `GET /merchants/channels?country=<iso>` (task 28).
   *
   * Public endpoint — no auth header required. Uses `publicApi` so
   * the signup screen can load the picker pre-login.
   */
  getChannels: async (country: string = "ID"): Promise<TChannel[]> => {
    const params = buildSearchParams({ country });
    try {
      return await publicApi
        .get(`merchants/channels?${params.toString()}`)
        .json<TChannel[]>();
    } catch (error) {
      console.error("Failed to fetch merchant channels", error);
      throw error;
    }
  },
};
