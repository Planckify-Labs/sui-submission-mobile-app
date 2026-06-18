/**
 * Resolve the `intent_receipt` Move Package ID from the smart-contracts API
 * (spec §10; the project's "updatable via API, never hardcoded" rule — same
 * discipline as the x402 rails and token config). The published Package ID
 * lives in the `SmartContract` table (name `intent_receipt`, on the Sui
 * blockchain row), so it can be rotated/disabled without an app release.
 *
 * Only POSITIVE results are MMKV-cached (short TTL), so once a row exists the
 * swap path is instant. We deliberately do NOT negative-cache a miss: a
 * freshly-seeded (or corrected) row must be picked up on the very next swap,
 * not after a 5-min stale window — that negative cache was why a just-seeded
 * receipt failed to appear. A miss simply re-checks the API next time (swaps
 * are user-initiated, so one extra read is negligible). Returns `undefined`
 * when no active row matches OR the API is unreachable — the receipt is
 * additive, so the swap is unaffected (`appendIntentReceipt` no-ops).
 *
 * MMKV + the API client are imported DYNAMICALLY (only when a swap actually
 * resolves a receipt) so this module's static graph stays free of native
 * modules — `deepbookSwap.ts` imports it, and the swap unit tests must not
 * pull in MMKV. Mirrors the DeepBook SDK's own lazy-load in this folder.
 */

import type { SuiNetwork } from "@/services/chains/sui/payloads";

/** Contract `name` under which the package is registered in the API table. */
const CONTRACT_NAME = "intent_receipt";
const CACHE_KEY_PREFIX = "sui_intent_receipt_pkg_";
const TS_KEY_PREFIX = "sui_intent_receipt_pkg_ts_";
const STALE_MS = 5 * 60 * 1000;

/** Per-network in-flight dedupe so concurrent swaps share one API call. */
const inflight = new Map<SuiNetwork, Promise<string | undefined>>();

export async function resolveIntentReceiptPackageId(
  network: SuiNetwork,
): Promise<string | undefined> {
  const { storage } = await import("@/lib/storage/mmkv");
  const cacheKey = `${CACHE_KEY_PREFIX}${network}`;
  const tsKey = `${TS_KEY_PREFIX}${network}`;

  // Positive cache only: a non-empty cached address that is still fresh.
  const cached = storage.getString(cacheKey);
  const ts = Number.parseInt(storage.getString(tsKey) ?? "0", 10) || 0;
  if (cached && Date.now() - ts < STALE_MS) {
    return cached;
  }

  const existing = inflight.get(network);
  if (existing) return existing;

  const task = (async (): Promise<string | undefined> => {
    try {
      const { smartContractApi } = await import(
        "@/api/endpoints/smart-contracts"
      );
      // NOTE: do NOT pass `isBlockchainEVM` — the backend search returns 0 rows
      // for `isBlockchainEVM=false` (it mis-coerces the query param and never
      // matches non-EVM rows). We filter non-EVM client-side below, which is
      // authoritative anyway, so the server-side narrowing is unnecessary.
      const rows = await smartContractApi.searchSmartContracts({
        name: CONTRACT_NAME,
        isActive: true,
      });
      // Sui has no numeric chainId, so match on the blockchain's flags: the
      // active network's testnet bit + non-EVM. Only Sui carries this contract.
      const wantTestnet = network !== "mainnet";
      const address = rows.find(
        (r) =>
          r.blockchain?.isEVM === false &&
          r.blockchain?.isTestnet === wantTestnet &&
          !!r.address,
      )?.address;
      // Cache ONLY a hit — never a miss (a just-seeded row must appear next
      // swap, not after the TTL). A miss re-checks the API on the next call.
      if (address) {
        storage.set(cacheKey, address);
        storage.set(tsKey, Date.now().toString());
      }
      return address;
    } catch {
      // Offline / API error → serve the last good cache if we have one, else
      // skip the receipt (never block or break the swap on a config read).
      return cached || undefined;
    } finally {
      inflight.delete(network);
    }
  })();

  inflight.set(network, task);
  return task;
}
