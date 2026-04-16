import * as SecureStore from "expo-secure-store";
import { originKey } from "./caip";

// SecureStore only accepts [A-Za-z0-9._-]; `/` is rejected.
const STORAGE_KEY = "dapp_bridge.permissions";

export type PermissionCaveat = {
  type: "restrictReturnedAccounts";
  value: string[];
};

export type PermissionGrant = {
  origin: string;
  walletAddress: string;
  chainId: number;
  caveats: PermissionCaveat[];
  grantedAt: number;
};

type Store = { grants: PermissionGrant[] };

type Listener = () => void;

const listeners = new Set<Listener>();
let cache: Store = { grants: [] };
let hydrated = false;
let hydratePromise: Promise<void> | null = null;

function notify(): void {
  for (const l of listeners) {
    try {
      l();
    } catch (e) {
      if (__DEV__) console.warn("[permissions] listener threw", e);
    }
  }
}

async function persist(): Promise<void> {
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(cache));
  } catch (e) {
    if (__DEV__) console.warn("[permissions] persist failed", e);
  }
}

export const PermissionStore = {
  async hydrate(): Promise<void> {
    if (hydrated) return;
    if (hydratePromise) return hydratePromise;
    hydratePromise = (async () => {
      try {
        const raw = await SecureStore.getItemAsync(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Store;
          if (parsed?.grants && Array.isArray(parsed.grants)) {
            cache = parsed;
          }
        }
      } catch (e) {
        if (__DEV__) console.warn("[permissions] hydrate failed", e);
      } finally {
        hydrated = true;
      }
    })();
    return hydratePromise;
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  async grant(args: {
    origin: string;
    walletAddress: string;
    chainId: number;
  }): Promise<void> {
    const key = originKey(args.origin);
    const filtered = cache.grants.filter(
      (g) =>
        !(
          g.origin === key &&
          g.walletAddress.toLowerCase() === args.walletAddress.toLowerCase() &&
          g.chainId === args.chainId
        ),
    );
    filtered.push({
      origin: key,
      walletAddress: args.walletAddress.toLowerCase(),
      chainId: args.chainId,
      caveats: [
        { type: "restrictReturnedAccounts", value: [args.walletAddress] },
      ],
      grantedAt: Date.now(),
    });
    cache = { grants: filtered };
    notify();
    await persist();
  },

  async revoke(args: {
    origin: string;
    walletAddress?: string;
  }): Promise<void> {
    const key = originKey(args.origin);
    const before = cache.grants.length;
    cache = {
      grants: cache.grants.filter((g) => {
        if (g.origin !== key) return true;
        if (!args.walletAddress) return false;
        return (
          g.walletAddress.toLowerCase() !== args.walletAddress.toLowerCase()
        );
      }),
    };
    if (cache.grants.length !== before) {
      notify();
      await persist();
    }
  },

  listByOrigin(origin: string): PermissionGrant[] {
    const key = originKey(origin);
    return cache.grants.filter((g) => g.origin === key);
  },

  listAll(): PermissionGrant[] {
    return [...cache.grants];
  },

  isGranted(origin: string, walletAddress: string, chainId: number): boolean {
    const key = originKey(origin);
    return cache.grants.some(
      (g) =>
        g.origin === key &&
        g.walletAddress.toLowerCase() === walletAddress.toLowerCase() &&
        g.chainId === chainId,
    );
  },

  asEip2255(origin: string): Array<{
    parentCapability: string;
    id: string;
    date: number;
    caveats: PermissionCaveat[];
  }> {
    const list = this.listByOrigin(origin);
    if (list.length === 0) return [];
    const accounts = [
      ...new Set(list.flatMap((g) => g.caveats.flatMap((c) => c.value))),
    ];
    return [
      {
        parentCapability: "eth_accounts",
        id: `${list[0].origin}-${list[0].grantedAt}`,
        date: list[0].grantedAt,
        caveats: [{ type: "restrictReturnedAccounts", value: accounts }],
      },
    ];
  },
};
