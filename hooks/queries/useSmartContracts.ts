import { useQuery } from "@tanstack/react-query";
import {
  smartContractApi,
  type TSmartContract,
} from "@/api/endpoints/smart-contracts";
import { storage } from "@/lib/storage/mmkv";

// MMKV cache parameters. `STALE_TIME` is the window React Query treats
// the cached value as fresh (no background refetch); `OFFLINE_CACHE_TTL`
// is how long we keep serving the cached value if the network is down.
// Matches `useTokens`' cadence so both screens settle in under a frame
// on warm opens.
const CACHE_KEY_PREFIX = "cached_smart_contract_chain_";
const TIMESTAMP_KEY_PREFIX = "cached_smart_contract_chain_ts_";
const STALE_TIME = 5 * 60 * 1000; // 5 min
const OFFLINE_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 h

type CachedValue = TSmartContract | null;

function cacheKey(chainId: number): string {
  return `${CACHE_KEY_PREFIX}${chainId}`;
}

function timestampKey(chainId: number): string {
  return `${TIMESTAMP_KEY_PREFIX}${chainId}`;
}

function readCache(chainId: number): CachedValue | undefined {
  const raw = storage.getString(cacheKey(chainId));
  if (raw === undefined) return undefined;
  try {
    // `null` is a legitimate cached value ("no contract on this
    // chain") — keep it distinguishable from "no cache entry yet".
    return JSON.parse(raw) as CachedValue;
  } catch {
    return undefined;
  }
}

function readCacheTimestamp(chainId: number): number {
  const raw = storage.getString(timestampKey(chainId));
  return raw ? Number.parseInt(raw, 10) || 0 : 0;
}

function writeCache(chainId: number, value: CachedValue): void {
  storage.set(cacheKey(chainId), JSON.stringify(value));
  storage.set(timestampKey(chainId), Date.now().toString());
}

export const useSmartContractByChain = (chainId: number) => {
  return useQuery<CachedValue>({
    queryKey: ["smart-contracts", "chain", chainId],
    // Seed with the last cached value so the deposit screen has a
    // `hasContract` answer on the first render — no loading spinner,
    // no modal flicker — while the background fetch refreshes from
    // the API. MMKV reads are synchronous, so this is ~microseconds.
    initialData: () => {
      if (!chainId) return undefined;
      return readCache(chainId);
    },
    initialDataUpdatedAt: () => readCacheTimestamp(chainId),
    queryFn: async () => {
      try {
        const fresh = await smartContractApi.getSmartContractsByChain(chainId);
        const normalised = fresh ?? null;
        // Persist on every successful API hit so the next cold start
        // (or another screen that mounts this hook) has the latest
        // server value waiting in MMKV. Always writes, even when the
        // server still returns the same shape — stringify cost is
        // dwarfed by the network round-trip we just paid for.
        writeCache(chainId, normalised);
        return normalised;
      } catch (err) {
        // Offline / transient network error — fall back to the cache
        // while it's still within the 24h window. Does NOT overwrite
        // the cache, so the last known-good value persists until we
        // reach the server again.
        const cached = readCache(chainId);
        const ts = readCacheTimestamp(chainId);
        if (cached !== undefined && Date.now() - ts < OFFLINE_CACHE_TTL) {
          return cached;
        }
        throw err;
      }
    },
    enabled: !!chainId,
    // Short staleTime so concurrent consumers on the same mount tick
    // share one refetch instead of dogpiling the API.
    staleTime: STALE_TIME,
    // `refetchOnMount: true` (stale-only) instead of `"always"` —
    // avoids a fresh `/smart-contracts/chain/<id>` round-trip on every
    // mount when a 5-minute-old cache is still serving. Same fix as
    // `useTokens`. The MMKV seed still handles instant render; the
    // network sync runs lazily when data actually goes stale or on
    // reconnect.
    refetchOnMount: true,
    refetchOnReconnect: "always",
  });
};
