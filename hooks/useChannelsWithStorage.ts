import { useQuery } from "@tanstack/react-query";
import { merchantApi } from "@/api/endpoints/merchants";
import type { TChannel } from "@/api/types/channel";
import { storage } from "@/lib/storage/mmkv";

/**
 * Merchant-payout-channel list, cached in MMKV.
 *
 * Mirrors `useBlockchainsWithStorage`:
 *   - `initialData` reads the last-known payload synchronously so the
 *     signup form's picker renders real rows on frame 0.
 *   - Background refetch under `STALE_TIME` reconciles against the
 *     server. MMKV rehydrates on every successful fetch.
 *   - On network failure, serve the MMKV snapshot if it's within the
 *     offline TTL; otherwise propagate the error so the caller can
 *     show a retry affordance.
 *
 * Keyed per country because Channel rows are scoped by country in the
 * DB (task 26 seeded 8 ID channels; PH/SG/MY/VN will come later).
 */

const STALE_TIME = 5 * 60 * 1000; // 5 min — fresh enough, quiet during typing.
const OFFLINE_CACHE_TTL = 24 * 60 * 60 * 1000; // 24h — offline fallback.

const cacheKeyFor = (country: string): string =>
  `cached_merchant_channels_${country}`;
const timestampKeyFor = (country: string): string =>
  `cached_merchant_channels_ts_${country}`;

function readCached(country: string): TChannel[] | undefined {
  const raw = storage.getString(cacheKeyFor(country));
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as TChannel[];
  } catch {
    return undefined;
  }
}

function readCachedTimestamp(country: string): number {
  const raw = storage.getString(timestampKeyFor(country));
  return raw ? Number.parseInt(raw, 10) || 0 : 0;
}

async function fetchAndCache(country: string): Promise<TChannel[]> {
  const response = await merchantApi.getChannels(country);
  storage.set(cacheKeyFor(country), JSON.stringify(response));
  storage.set(timestampKeyFor(country), Date.now().toString());
  return response;
}

export const useChannelsWithStorage = (country: string = "ID") => {
  return useQuery<TChannel[]>({
    queryKey: ["merchant-channels", country],
    initialData: () => readCached(country),
    initialDataUpdatedAt: () => readCachedTimestamp(country),
    queryFn: async () => {
      try {
        return await fetchAndCache(country);
      } catch (err) {
        const cached = readCached(country);
        const ts = readCachedTimestamp(country);
        if (cached && Date.now() - ts < OFFLINE_CACHE_TTL) {
          return cached;
        }
        throw err;
      }
    },
    staleTime: STALE_TIME,
    gcTime: OFFLINE_CACHE_TTL,
    refetchOnMount: true,
    refetchOnReconnect: "always",
  });
};
