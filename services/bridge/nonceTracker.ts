import * as SecureStore from "expo-secure-store";

const STORAGE_KEY = "dapp_bridge.nonce_tracker";

type Key = string; // `${address.toLowerCase()}:${chainId}`

export interface PendingNonce {
  nonce: number;
  hash: `0x${string}`;
  submittedAt: number;
  to: `0x${string}`;
  value?: string; // hex
  data?: `0x${string}`;
  maxFeePerGas?: string; // hex
  maxPriorityFeePerGas?: string; // hex
  gasPrice?: string; // hex
}

interface TrackerState {
  byKey: Record<Key, { nextReserved: number; pending: PendingNonce[] }>;
}

let state: TrackerState = { byKey: {} };
let hydrated = false;

function k(address: string, chainId: number): Key {
  return `${address.toLowerCase()}:${chainId}`;
}

async function persist(): Promise<void> {
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // best effort
  }
}

async function hydrate(): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as TrackerState;
      if (parsed?.byKey) state = parsed;
    }
  } catch {
    // fresh
  }
}

export const NonceTracker = {
  hydrate,

  async reserveNonce(
    address: string,
    chainId: number,
    onChainNext: number,
  ): Promise<number> {
    await hydrate();
    const key = k(address, chainId);
    const entry = state.byKey[key] ?? {
      nextReserved: onChainNext,
      pending: [],
    };
    const next = Math.max(entry.nextReserved, onChainNext);
    entry.nextReserved = next + 1;
    state.byKey[key] = entry;
    await persist();
    return next;
  },

  async markSubmitted(
    address: string,
    chainId: number,
    nonce: number,
    hash: `0x${string}`,
    extra: Partial<PendingNonce> = {},
  ): Promise<void> {
    await hydrate();
    const key = k(address, chainId);
    const entry = state.byKey[key] ?? { nextReserved: nonce + 1, pending: [] };
    entry.pending = [
      ...entry.pending.filter((p) => p.nonce !== nonce),
      {
        nonce,
        hash,
        submittedAt: Date.now(),
        to: extra.to ?? "0x",
        value: extra.value,
        data: extra.data,
        maxFeePerGas: extra.maxFeePerGas,
        maxPriorityFeePerGas: extra.maxPriorityFeePerGas,
        gasPrice: extra.gasPrice,
      },
    ];
    state.byKey[key] = entry;
    await persist();
  },

  async markConfirmed(
    address: string,
    chainId: number,
    nonce: number,
  ): Promise<void> {
    await hydrate();
    const key = k(address, chainId);
    const entry = state.byKey[key];
    if (!entry) return;
    entry.pending = entry.pending.filter((p) => p.nonce !== nonce);
    state.byKey[key] = entry;
    await persist();
  },

  async markFailed(
    address: string,
    chainId: number,
    nonce: number,
  ): Promise<void> {
    return this.markConfirmed(address, chainId, nonce);
  },

  detectStuck(
    address: string,
    chainId: number,
    now = Date.now(),
    thresholdMs = 60_000,
  ): PendingNonce[] {
    const key = k(address, chainId);
    const entry = state.byKey[key];
    if (!entry) return [];
    return entry.pending.filter((p) => now - p.submittedAt > thresholdMs);
  },

  listPending(address: string, chainId: number): PendingNonce[] {
    const key = k(address, chainId);
    return state.byKey[key]?.pending ?? [];
  },
};
