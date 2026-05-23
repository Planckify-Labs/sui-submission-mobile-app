/**
 * Per-wallet transfer auto-approve thresholds.
 *
 * Lives alongside `permissionGrantStore` because both control how much
 * friction the agent applies to a tool call. Grants answer "should we
 * skip the approval sheet entirely?"; thresholds answer "for transfers
 * specifically, how big does the value have to be before we show the
 * sheet?".
 *
 * Mental model surfaced to the user: "default rule + per-token overrides".
 * That single pattern collapses every white-list scenario the user might
 * want — see the file-level comment on `resolveTransferThreshold` for
 * the proof.
 *
 * Storage: same SecureStore + JSON blob pattern as `permissionGrantStore`.
 * One blob per wallet, keyed by lowercased address. Dataset is small
 * (a default + a flat list of overrides) so a single blob is cheaper
 * than a SQLite table for this access pattern.
 */

// --- Types ------------------------------------------------------------------

/**
 * Reserved sentinel for the native currency in `TokenOverride.contractAddress`.
 * Native tokens (ETH, MATIC, BNB, …) don't have a contract address so we
 * use this string to key them in the override map. Lowercased so it
 * sorts before any 0x… address.
 */
export const NATIVE_TOKEN_KEY = "native";

/**
 * `threshold_usd: 0` is the "always ask" sentinel.
 *
 * We deliberately do NOT model "unlimited" as a separate value. A user
 * who wants no upper bound can set a very large number; the alternative
 * (a separate "always allow" mode) would invite users to skip all
 * confirmation on large transfers, which is exactly what "Full auto"
 * mode is for and that path already has the existing destructive
 * confirmation gate.
 */
export interface TokenOverride {
  chainId: number;
  /** Lowercased contract address, or `NATIVE_TOKEN_KEY` for native. */
  contractAddress: string;
  symbol: string;
  isNative: boolean;
  threshold_usd: number;
  /**
   * Optional token logo URL cached with the override so the settings
   * list can render without a second registry lookup. Pulled from
   * `TToken.logoUrl` / `TCryptoAsset.logo` / `ChainConfig.iconUrl`
   * at selection time. Display-only — the resolver never touches it.
   * Safe to be missing on blobs written before this field existed.
   */
  logoUrl?: string;
}

export interface TransferThresholds {
  /** Default threshold in USD for native token transfers. 0 = always ask. */
  default_native_usd: number;
  /** Default threshold in USD for ERC-20 / non-native transfers. 0 = always ask. */
  default_token_usd: number;
  /** Default threshold in USD for DeFi actions. 0 = always ask. */
  defi_per_action_usd: {
    conservative: number;
    balanced: number;
    aggressive: number;
  };
  /** Default daily threshold in USD for DeFi actions. 0 = unlimited. */
  defi_per_day_usd: number;
  /**
   * Per-token overrides. Keyed by `${chainId}:${contractAddressOrNative}`
   * (always lowercased). Wins over the matching default.
   */
  overrides: Record<string, TokenOverride>;
}

/**
 * Default thresholds applied to a fresh wallet. Opt-in model — both
 * defaults are 0 ("always ask") so every transfer hits the approval
 * sheet until the user deliberately raises the threshold. Safer than
 * shipping a non-zero default that silently auto-approves dust.
 */
export const DEFAULT_THRESHOLDS: TransferThresholds = {
  default_native_usd: 0,
  default_token_usd: 0,
  defi_per_action_usd: {
    conservative: 0,
    balanced: 0,
    aggressive: 0,
  },
  defi_per_day_usd: 0,
  overrides: {},
};

/**
 * Result of looking up the effective threshold for a specific transfer.
 * `source` is exposed so the UI / logs can explain WHY a transfer was
 * (or wasn't) auto-approved — debuggability matters when the user
 * wonders "why did the agent ask me about a $3 transfer".
 */
export interface ResolvedThreshold {
  threshold_usd: number;
  source: "override" | "default_native" | "default_token";
}

// --- Storage adapter --------------------------------------------------------

/**
 * Async key/value adapter so the store is unit-testable without
 * SecureStore. Mirrors `GrantStorageAdapter` in `permissionGrantStore`.
 */
export interface ThresholdStorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  deleteItem(key: string): Promise<void>;
}

let secureStoreAdapterSingleton: ThresholdStorageAdapter | null = null;
function getSecureStoreAdapter(): ThresholdStorageAdapter {
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

const STORAGE_KEY_PREFIX = "transfer_thresholds_";

function storageKeyFor(wallet: `0x${string}`): string {
  return `${STORAGE_KEY_PREFIX}${wallet.toLowerCase()}`;
}

function overrideKey(chainId: number, contractAddressOrNative: string): string {
  return `${chainId}:${contractAddressOrNative.toLowerCase()}`;
}

// --- Store ------------------------------------------------------------------

export class TransferThresholdStore {
  private readonly wallet: `0x${string}`;
  private readonly adapter: ThresholdStorageAdapter;
  private thresholds: TransferThresholds = { ...DEFAULT_THRESHOLDS };
  private loadPromise: Promise<void>;
  private persistTail: Promise<void> = Promise.resolve();
  private subscribers = new Set<() => void>();

  constructor(wallet: `0x${string}`, adapter?: ThresholdStorageAdapter) {
    this.wallet = wallet;
    this.adapter = adapter ?? getSecureStoreAdapter();
    this.loadPromise = this.hydrate().then(() => this.notify());
  }

  /**
   * Subscribe to changes (hydrate-completion + every mutation).
   * Returns the unsubscribe function. Used by AgentMode to re-snapshot
   * the wallet's thresholds when the settings screen edits them.
   */
  subscribe(fn: () => void): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  private notify(): void {
    for (const fn of this.subscribers) {
      try {
        fn();
      } catch (err) {
        console.warn("TransferThresholdStore: subscriber threw", err);
      }
    }
  }

  private async hydrate(): Promise<void> {
    try {
      const raw = await this.adapter.getItem(storageKeyFor(this.wallet));
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<TransferThresholds>;
      // Defensive merge — old blobs may be missing fields after a schema
      // change. Always start from DEFAULT_THRESHOLDS so we never end up
      // with NaN/undefined values feeding the resolver.
      this.thresholds = {
        default_native_usd:
          typeof parsed.default_native_usd === "number"
            ? parsed.default_native_usd
            : DEFAULT_THRESHOLDS.default_native_usd,
        default_token_usd:
          typeof parsed.default_token_usd === "number"
            ? parsed.default_token_usd
            : DEFAULT_THRESHOLDS.default_token_usd,
        defi_per_action_usd: {
          conservative:
            typeof parsed.defi_per_action_usd?.conservative === "number"
              ? parsed.defi_per_action_usd.conservative
              : typeof parsed.defi_per_action_usd === "number"
                ? parsed.defi_per_action_usd
                : DEFAULT_THRESHOLDS.defi_per_action_usd.conservative,
          balanced:
            typeof parsed.defi_per_action_usd?.balanced === "number"
              ? parsed.defi_per_action_usd.balanced
              : typeof parsed.defi_per_action_usd === "number"
                ? parsed.defi_per_action_usd
                : DEFAULT_THRESHOLDS.defi_per_action_usd.balanced,
          aggressive:
            typeof parsed.defi_per_action_usd?.aggressive === "number"
              ? parsed.defi_per_action_usd.aggressive
              : typeof parsed.defi_per_action_usd === "number"
                ? parsed.defi_per_action_usd
                : DEFAULT_THRESHOLDS.defi_per_action_usd.aggressive,
        },
        defi_per_day_usd:
          typeof parsed.defi_per_day_usd === "number"
            ? parsed.defi_per_day_usd
            : DEFAULT_THRESHOLDS.defi_per_day_usd,
        overrides:
          parsed.overrides && typeof parsed.overrides === "object"
            ? (parsed.overrides as Record<string, TokenOverride>)
            : {},
      };
    } catch (error) {
      console.error("TransferThresholdStore: failed to hydrate", error);
      this.thresholds = { ...DEFAULT_THRESHOLDS };
    }
  }

  private schedulePersist(): void {
    const snapshot = JSON.stringify(this.thresholds);
    this.persistTail = this.persistTail.then(async () => {
      try {
        await this.adapter.setItem(storageKeyFor(this.wallet), snapshot);
      } catch (error) {
        console.error("TransferThresholdStore: failed to persist", error);
      }
    });
  }

  whenLoaded(): Promise<void> {
    return this.loadPromise;
  }

  flushed(): Promise<void> {
    return this.persistTail;
  }

  /** Snapshot of the current thresholds. Returns a deep copy. */
  snapshot(): TransferThresholds {
    return {
      default_native_usd: this.thresholds.default_native_usd,
      default_token_usd: this.thresholds.default_token_usd,
      defi_per_action_usd: { ...this.thresholds.defi_per_action_usd },
      defi_per_day_usd: this.thresholds.defi_per_day_usd,
      overrides: { ...this.thresholds.overrides },
    };
  }

  /** Update either default — value clamped to [0, ∞). */
  setDefault(kind: "native" | "token", usd: number): void {
    const v = Number.isFinite(usd) && usd >= 0 ? usd : 0;
    if (kind === "native") {
      this.thresholds.default_native_usd = v;
    } else {
      this.thresholds.default_token_usd = v;
    }
    this.schedulePersist();
    this.notify();
  }

  /**
   * Add or replace a per-token override. The caller passes the full
   * override row so we can carry display fields (symbol, isNative)
   * without forcing the screen to look them up again on every render.
   */
  setOverride(override: TokenOverride): void {
    const key = overrideKey(override.chainId, override.contractAddress);
    this.thresholds.overrides[key] = {
      ...override,
      contractAddress: override.contractAddress.toLowerCase(),
      threshold_usd:
        Number.isFinite(override.threshold_usd) && override.threshold_usd >= 0
          ? override.threshold_usd
          : 0,
    };
    this.schedulePersist();
    this.notify();
  }

  removeOverride(chainId: number, contractAddressOrNative: string): void {
    const key = overrideKey(chainId, contractAddressOrNative);
    if (key in this.thresholds.overrides) {
      delete this.thresholds.overrides[key];
      this.schedulePersist();
      this.notify();
    }
  }
}

// --- Resolver ---------------------------------------------------------------

/**
 * Resolve the effective threshold for a specific transfer.
 *
 * Branch summary (the "huge branching logic" from the original ask):
 *
 *   1. Per-token override exists for this chain+token? → use it.
 *      Threshold = `override.threshold_usd`. Source = "override".
 *
 *   2. No override? → use the relevant default:
 *      - native transfer → `default_native_usd`. Source = "default_native".
 *      - non-native      → `default_token_usd`.  Source = "default_token".
 *
 * That's it. The user-facing "white-list" scenarios all derive from
 * this one rule:
 *
 *   - "Auto-approve only USDC"        — set both defaults to 0,
 *                                       add override for USDC at $N.
 *   - "Auto-approve everything except USDC" — set defaults to $N,
 *                                       add override for USDC at 0.
 *   - "Auto-approve a list of tokens" — set defaults to 0,
 *                                       add overrides for each at $N.
 *
 * No special-case flags or "mode" enum — the data structure encodes
 * intent directly. Callers compare `amountUsd` against
 * `result.threshold_usd`: if `amountUsd < threshold_usd` the transfer
 * may be auto-approved, otherwise the approval sheet must show.
 *
 * `threshold_usd === 0` always falls through to the approval sheet
 * (no `amountUsd` is strictly less than 0), which is exactly what
 * "always ask" means.
 */
export function resolveTransferThreshold(
  thresholds: TransferThresholds,
  chainId: number,
  contractAddressOrNative: string,
  isNative: boolean,
): ResolvedThreshold {
  const key = overrideKey(chainId, contractAddressOrNative);
  const override = thresholds.overrides[key];
  if (override) {
    return { threshold_usd: override.threshold_usd, source: "override" };
  }
  if (isNative) {
    return {
      threshold_usd: thresholds.default_native_usd,
      source: "default_native",
    };
  }
  return {
    threshold_usd: thresholds.default_token_usd,
    source: "default_token",
  };
}

export type DefiTier = "conservative" | "balanced" | "aggressive";

export interface DefiInfo {
  tier: DefiTier;
  protocolSlug: string;
  chainId: number;
}

export function resolveDefiThreshold(
  thresholds: TransferThresholds,
  info: DefiInfo,
): ResolvedThreshold {
  // Use the tier-specific threshold
  const threshold_usd = thresholds.defi_per_action_usd[info.tier];

  // Note: defi_overrides could be added here in Phase 3.5 if needed,
  // but for now we follow Task 18's per-tier focus.

  return {
    threshold_usd,
    source: "default_token", // Reusing source for now or could add "default_defi"
  };
}

// --- Store cache ------------------------------------------------------------

/**
 * Per-wallet store cache. Mirrors the same pattern in
 * `app/agent-permissions.tsx` for `PermissionGrantStore` — the screen,
 * the dispatcher, and the resolver all need to observe the same store
 * instance per wallet so writes from the settings screen show up
 * immediately in the agent's runtime decisions.
 */
const storeCache = new Map<string, TransferThresholdStore>();

export function getTransferThresholdStore(
  wallet: `0x${string}`,
): TransferThresholdStore {
  const key = wallet.toLowerCase();
  let store = storeCache.get(key);
  if (!store) {
    store = new TransferThresholdStore(wallet);
    storeCache.set(key, store);
  }
  return store;
}

// --- Cross-wallet helpers --------------------------------------------------

/**
 * Apply the same override to every provided wallet. Used by the
 * "Apply to all wallets" per-action toggle on the settings screen.
 *
 * Keeping this as a free function (rather than a static method) so
 * callers can inject the wallet list from their own source of truth
 * (`useWallet().wallets`) — the store module doesn't know about the
 * app-level wallet registry.
 */
export function setOverrideOnWallets(
  wallets: ReadonlyArray<`0x${string}`>,
  override: TokenOverride,
): void {
  for (const w of wallets) {
    getTransferThresholdStore(w).setOverride(override);
  }
}

/**
 * Broadcast a default to every provided wallet. Used by the "Copy
 * defaults to all wallets" action.
 */
export function setDefaultOnWallets(
  wallets: ReadonlyArray<`0x${string}`>,
  kind: "native" | "token",
  usd: number,
): void {
  for (const w of wallets) {
    getTransferThresholdStore(w).setDefault(kind, usd);
  }
}
