/**
 * Scallop config & address resolution — NO SDK.
 *
 * Replaces `@scallop-io/sui-scallop-sdk` for the supply/withdraw path. Scallop's
 * lending protocol is a small set of public Move calls (`mint::mint` /
 * `redeem::redeem`); the only thing the SDK really did for us was resolve the
 * per-network package + shared-object ids, which Scallop also serves over plain
 * HTTPS. So we:
 *
 *   - PIN the per-asset coinType + decimals (immutable for a given asset), and
 *   - FETCH the core ids (protocol package / Version / Market) from Scallop's
 *     address API, MMKV-cached with a TTL + a pinned fallback — because the
 *     PACKAGE id changes on a Scallop package upgrade ("config not constants",
 *     spec §11). The `Version` shared object aborts a stale-package call, so a
 *     refreshable package id is the one thing we must not hardcode forever.
 *
 * Mainnet-only: Scallop ships no testnet deployment (spec §4.4); the adapter's
 * `chainId:"mainnet"` gates this exactly as before. MMKV is imported
 * dynamically so this module's static graph stays free of native modules
 * (mirrors `resolveIntentReceiptPackageId`).
 */

/** Scallop's mainnet "address set" id (the SDK's `addressId`). */
const ADDRESS_API =
  "https://sui.apis.scallop.io/addresses/67c44a103fe1b8c454eb9699";
const CACHE_KEY = "scallop_core_addrs_v1";
const TS_KEY = "scallop_core_addrs_ts_v1";
const STALE_MS = 30 * 60 * 1000;

export interface ScallopCoin {
  /** Scallop pool coin name (e.g. "usdc") — kept for parity / logging. */
  coinName: string;
  /** Move coinType — the `mint`/`redeem` type argument and the input coin. */
  coinType: string;
  decimals: number;
}

export interface ScallopCore {
  /** Current protocol package id — the `mint`/`redeem` moveCall target. */
  protocolPkg: string;
  /** `&Version` shared object. */
  version: string;
  /** `&mut Market` shared object. */
  market: string;
}

/**
 * Pinned per-asset coinTypes (immutable for a given asset). The supported
 * supply/withdraw assets; extend as we surface more of Scallop's market.
 * Matched case-insensitively by symbol.
 */
const SCALLOP_COINS: Record<string, ScallopCoin> = {
  SUI: { coinName: "sui", coinType: "0x2::sui::SUI", decimals: 9 },
  USDC: {
    coinName: "usdc",
    coinType:
      "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
    decimals: 6,
  },
  USDT: {
    coinName: "sbusdt",
    coinType:
      "0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT",
    decimals: 6,
  },
};

export function resolveScallopCoin(symbol: string): ScallopCoin | null {
  return SCALLOP_COINS[symbol.toUpperCase()] ?? null;
}

/** Pinned fallback for the mutable core ids (verified 2026-06-19). */
const FALLBACK_CORE: ScallopCore = {
  protocolPkg:
    "0xde5c09ad171544aa3724dc67216668c80e754860f419136a68d78504eb2e2805",
  version: "0x07871c4b3c847a0f674510d4978d5cf6f960452795e8ff6f189fd2088a3f6ac7",
  market: "0xa757975255146dc9686aa823b7838b507f315d704f428cbadad2f4ea061939d9",
};

interface ScallopAddressPayload {
  mainnet?: {
    core?: {
      version?: string;
      market?: string;
      packages?: { protocol?: { id?: string } };
    };
  };
}

function safeParseCore(s: string): ScallopCore | null {
  try {
    const o = JSON.parse(s) as Partial<ScallopCore>;
    if (o.protocolPkg && o.version && o.market) return o as ScallopCore;
  } catch {
    // fall through
  }
  return null;
}

let inflight: Promise<ScallopCore> | undefined;

/**
 * Resolve Scallop's mainnet core ids — protocol package (moveCall target),
 * Version, Market. MMKV-cached (TTL); refreshed from Scallop's address API so a
 * package upgrade is picked up without an app release; falls back to the
 * last-good cache, then to pinned constants, so a supply never breaks on a
 * config read. Mirrors `resolveIntentReceiptPackageId`.
 */
export async function getScallopCore(): Promise<ScallopCore> {
  const { storage } = await import("@/lib/storage/mmkv");
  const cached = storage.getString(CACHE_KEY);
  const ts = Number.parseInt(storage.getString(TS_KEY) ?? "0", 10) || 0;
  if (cached && Date.now() - ts < STALE_MS) {
    const parsed = safeParseCore(cached);
    if (parsed) return parsed;
  }
  if (inflight) return inflight;

  const task = (async (): Promise<ScallopCore> => {
    try {
      const res = await fetch(ADDRESS_API);
      const json = (await res.json()) as ScallopAddressPayload;
      const core = json?.mainnet?.core;
      const resolved: ScallopCore = {
        protocolPkg: core?.packages?.protocol?.id ?? FALLBACK_CORE.protocolPkg,
        version: core?.version ?? FALLBACK_CORE.version,
        market: core?.market ?? FALLBACK_CORE.market,
      };
      storage.set(CACHE_KEY, JSON.stringify(resolved));
      storage.set(TS_KEY, Date.now().toString());
      return resolved;
    } catch {
      return (cached ? safeParseCore(cached) : null) ?? FALLBACK_CORE;
    } finally {
      inflight = undefined;
    }
  })();
  inflight = task;
  return task;
}
