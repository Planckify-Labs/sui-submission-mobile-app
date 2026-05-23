/**
 * Permission Grant store for the Takumi Agent.
 *
 * Implements the data model, persistence, and `resolveGrant()` resolver
 * described in `AGENT_PROTOCOL.md` §6 "Permission Grants & Trust Delegation".
 *
 * Grants are stored locally on the device (SecureStore — matches the
 * wallet-key storage pattern in `services/walletService.ts`) and are
 * wallet-scoped: a grant for wallet A must not apply to wallet B.
 *
 * The public API is synchronous to match the spec; persistence happens
 * fire-and-forget on a serialized tail promise so writes cannot interleave.
 * Tests and app-launch code can await `store.whenLoaded()` / `store.flushed()`
 * if they need to observe persistence state.
 */

// --- Types ------------------------------------------------------------------

/**
 * Mirrors the server-side `TOOL_REGISTRY` capability type. Defined locally
 * because the agent-api registry is not importable from the mobile app.
 */
export type ToolCapability =
  | "read"
  | "simulate"
  | "write"
  | "defi_read"
  | "defi_write";

export type GrantLifetime =
  | { type: "always_ask" }
  | { type: "once" }
  | { type: "session"; session_id: string }
  | { type: "timed"; expires_at: number } // Unix ms
  | { type: "permanent" };

export type GrantScope =
  | { kind: "tool"; key: string }
  | { kind: "capability"; key: ToolCapability }
  | { kind: "global" };

export interface PermissionGrant {
  scope: GrantScope;
  lifetime: GrantLifetime;
  wallet_address: `0x${string}`;
  granted_at: number; // Unix ms
}

// --- Storage adapter --------------------------------------------------------

/**
 * Minimal async key/value interface so the store can be unit-tested with an
 * in-memory mock without dragging in `expo-secure-store` at test time.
 */
export interface GrantStorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  deleteItem(key: string): Promise<void>;
}

/**
 * Lazily-loaded default adapter backed by `expo-secure-store`. The module
 * is `require`d on first use so Node-based unit tests (which inject their
 * own in-memory adapter) never touch the native module loader.
 */
let secureStoreAdapterSingleton: GrantStorageAdapter | null = null;
function getSecureStoreAdapter(): GrantStorageAdapter {
  if (secureStoreAdapterSingleton) return secureStoreAdapterSingleton;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const SecureStore =
    require("expo-secure-store") as typeof import("expo-secure-store");
  secureStoreAdapterSingleton = {
    getItem: (key) => SecureStore.getItemAsync(key),
    setItem: (key, value) => SecureStore.setItemAsync(key, value),
    deleteItem: (key) => SecureStore.deleteItemAsync(key),
  };
  return secureStoreAdapterSingleton;
}

// --- Constants --------------------------------------------------------------

const STORAGE_KEY_PREFIX = "permission_grants_";

function storageKeyFor(wallet: `0x${string}`): string {
  // Normalize to lowercase so 0xABC and 0xabc share the same slot.
  return `${STORAGE_KEY_PREFIX}${wallet.toLowerCase()}`;
}

// --- Scope helpers ----------------------------------------------------------

function scopesEqual(a: GrantScope, b: GrantScope): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "global") return true;
  // `a.kind === b.kind` narrows to "tool" or "capability", both of which have
  // a `key` field.
  return (a as { key: string }).key === (b as { key: string }).key;
}

function walletsEqual(a: `0x${string}`, b: `0x${string}`): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function isExpired(grant: PermissionGrant, now: number): boolean {
  return grant.lifetime.type === "timed" && grant.lifetime.expires_at <= now;
}

// --- Store ------------------------------------------------------------------

export class PermissionGrantStore {
  private readonly wallet: `0x${string}`;
  private readonly adapter: GrantStorageAdapter;
  private grants: PermissionGrant[] = [];
  private loadPromise: Promise<void>;
  private persistTail: Promise<void> = Promise.resolve();

  constructor(
    wallet: `0x${string}`,
    adapter?: GrantStorageAdapter,
    seed?: PermissionGrant[],
  ) {
    this.wallet = wallet;
    this.adapter = adapter ?? getSecureStoreAdapter();
    this.loadPromise = this.hydrate(seed);
  }

  private async hydrate(seed?: PermissionGrant[]): Promise<void> {
    try {
      const raw = await this.adapter.getItem(storageKeyFor(this.wallet));
      if (raw) {
        const parsed = JSON.parse(raw) as PermissionGrant[];
        if (Array.isArray(parsed)) {
          this.grants = parsed.filter(
            (g): g is PermissionGrant =>
              !!g &&
              typeof g === "object" &&
              walletsEqual(g.wallet_address, this.wallet),
          );
        }
      }
    } catch (error) {
      console.error("PermissionGrantStore: failed to hydrate", error);
      this.grants = [];
    }

    if (seed && this.grants.length === 0) {
      this.grants = seed.filter((g) =>
        walletsEqual(g.wallet_address, this.wallet),
      );
      this.schedulePersist();
    }
  }

  private schedulePersist(): void {
    const snapshot = JSON.stringify(this.grants);
    this.persistTail = this.persistTail.then(async () => {
      try {
        await this.adapter.setItem(storageKeyFor(this.wallet), snapshot);
      } catch (error) {
        console.error("PermissionGrantStore: failed to persist", error);
      }
    });
  }

  /** Resolves when the initial hydrate from storage has completed. */
  whenLoaded(): Promise<void> {
    return this.loadPromise;
  }

  /** Resolves when all pending persistence writes have flushed. */
  flushed(): Promise<void> {
    return this.persistTail;
  }

  /** Synchronously add a grant and fire-and-forget persist it. */
  add(grant: PermissionGrant): void {
    if (!walletsEqual(grant.wallet_address, this.wallet)) {
      // Reject cross-wallet writes — the store is wallet-scoped.
      return;
    }
    // Upsert: a new grant for the same scope replaces the old one so users
    // don't accumulate stale permanent/timed grants for the same key.
    this.grants = this.grants.filter((g) => !scopesEqual(g.scope, grant.scope));
    this.grants.push(grant);
    this.schedulePersist();
  }

  /** Remove a grant by reference or scope match. */
  remove(grant: PermissionGrant): void {
    const before = this.grants.length;
    this.grants = this.grants.filter(
      (g) =>
        !(
          scopesEqual(g.scope, grant.scope) &&
          walletsEqual(g.wallet_address, grant.wallet_address)
        ),
    );
    if (this.grants.length !== before) {
      this.schedulePersist();
    }
  }

  /**
   * Find the grant matching the given scope for this wallet. Lazily prunes
   * expired timed grants so callers never see stale entries.
   */
  find(query: {
    scope: GrantScope;
    wallet: `0x${string}`;
  }): PermissionGrant | undefined {
    if (!walletsEqual(query.wallet, this.wallet)) return undefined;

    const now = Date.now();
    let mutated = false;
    const kept: PermissionGrant[] = [];
    let match: PermissionGrant | undefined;

    for (const grant of this.grants) {
      if (isExpired(grant, now)) {
        mutated = true;
        continue;
      }
      kept.push(grant);
      if (
        !match &&
        scopesEqual(grant.scope, query.scope) &&
        walletsEqual(grant.wallet_address, query.wallet)
      ) {
        match = grant;
      }
    }

    if (mutated) {
      this.grants = kept;
      this.schedulePersist();
    }

    return match;
  }

  /** List all grants for the given wallet (after lazy pruning). */
  list(wallet: `0x${string}`): PermissionGrant[] {
    if (!walletsEqual(wallet, this.wallet)) return [];
    this.prune();
    return [...this.grants];
  }

  /** Revoke every grant for the given wallet. */
  revokeAll(wallet: `0x${string}`): void {
    if (!walletsEqual(wallet, this.wallet)) return;
    if (this.grants.length === 0) return;
    this.grants = [];
    this.schedulePersist();
  }

  /** Eagerly drop expired timed grants. Call on app launch. */
  prune(): void {
    const now = Date.now();
    const before = this.grants.length;
    this.grants = this.grants.filter((g) => !isExpired(g, now));
    if (this.grants.length !== before) {
      this.schedulePersist();
    }
  }

  // --- Factories ------------------------------------------------------------

  /**
   * Conservative default: empty grant store. The wallet's ApprovalPolicy
   * will drive the UX treatment for every action.
   */
  static conservative(
    walletAddress: `0x${string}`,
    adapter?: GrantStorageAdapter,
  ): PermissionGrantStore {
    return new PermissionGrantStore(walletAddress, adapter);
  }

  /**
   * Autonomous default: seeded with a global permanent grant so the agent
   * can execute any write silently until the user revokes it.
   */
  static autonomous(
    walletAddress: `0x${string}`,
    adapter?: GrantStorageAdapter,
  ): PermissionGrantStore {
    const seed: PermissionGrant[] = [
      {
        scope: { kind: "global" },
        lifetime: { type: "permanent" },
        wallet_address: walletAddress,
        granted_at: Date.now(),
      },
    ];
    return new PermissionGrantStore(walletAddress, adapter, seed);
  }
}

// --- resolveGrant -----------------------------------------------------------

/**
 * Resolve the effective grant lifetime for a tool invocation.
 *
 * Priority (first match wins): tool-specific > capability-level > global.
 *
 * `always_ask` is a hard override: if encountered at any level (even a
 * tool-level `always_ask` on top of a global permanent grant), the resolver
 * short-circuits and returns `always_ask`. This lets users lock down a
 * single tool even in autonomous mode.
 *
 * Returns `{ type: "once" }` when no active grant matches — callers should
 * fall back to the wallet's `ApprovalPolicy`.
 */
export function resolveGrant(
  toolName: string,
  capability: ToolCapability,
  wallet: `0x${string}`,
  sessionId: string,
  store: PermissionGrantStore,
): GrantLifetime {
  const now = Date.now();
  const candidates = [
    store.find({ scope: { kind: "tool", key: toolName }, wallet }),
    store.find({ scope: { kind: "capability", key: capability }, wallet }),
    store.find({ scope: { kind: "global" }, wallet }),
  ];

  for (const grant of candidates) {
    if (!grant) continue;
    switch (grant.lifetime.type) {
      case "always_ask":
        return { type: "always_ask" };
      case "permanent":
        return grant.lifetime;
      case "session":
        if (grant.lifetime.session_id === sessionId) return grant.lifetime;
        break;
      case "timed":
        if (grant.lifetime.expires_at > now) return grant.lifetime;
        store.remove(grant);
        break;
      case "once":
        // "once" is only the fall-through default — a stored `once` grant
        // behaves the same as no grant.
        break;
    }
  }

  return { type: "once" };
}
