import * as SecureStore from "expo-secure-store";
import type { ApprovalDecision, ApprovalIntent } from "./approval";

const STORAGE_KEY = "dapp_bridge.pending_intents";
const STALE_MS = 5 * 60 * 1000;

type Listener = (intents: ApprovalIntent[]) => void;
type ResolveListener = (id: string, decision: ApprovalDecision) => void;

class PendingIntentsStore {
  private intents: ApprovalIntent[] = [];
  private listeners = new Set<Listener>();
  private resolveListeners = new Set<ResolveListener>();
  private hydrated = false;
  private hydratePromise: Promise<void> | null = null;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener([...this.intents]);
    return () => this.listeners.delete(listener);
  }

  onResolve(listener: ResolveListener): () => void {
    this.resolveListeners.add(listener);
    return () => this.resolveListeners.delete(listener);
  }

  get snapshot(): ApprovalIntent[] {
    return [...this.intents];
  }

  push(intent: ApprovalIntent): void {
    this.intents = [...this.intents, intent];
    this.notify();
    void this.persist();
  }

  /**
   * Emits a decision to listeners but does not remove — caller removes after
   * execution completes so UI can show a transient "executing" state.
   */
  resolve(id: string, decision: ApprovalDecision): void {
    for (const l of this.resolveListeners) {
      try {
        l(id, decision);
      } catch (e) {
        if (__DEV__) console.warn("[pendingIntents] resolve listener threw", e);
      }
    }
  }

  remove(id: string): void {
    const before = this.intents.length;
    this.intents = this.intents.filter((i) => i.id !== id);
    if (this.intents.length !== before) {
      this.notify();
      void this.persist();
    }
  }

  private notify(): void {
    const snap = [...this.intents];
    for (const l of this.listeners) {
      try {
        l(snap);
      } catch (e) {
        if (__DEV__) console.warn("[pendingIntents] listener threw", e);
      }
    }
  }

  async hydrate(): Promise<void> {
    if (this.hydrated) return;
    if (this.hydratePromise) return this.hydratePromise;
    this.hydratePromise = (async () => {
      try {
        const raw = await SecureStore.getItemAsync(STORAGE_KEY);
        if (!raw) {
          this.hydrated = true;
          return;
        }
        const parsed = JSON.parse(raw, reviver) as ApprovalIntent[];
        if (Array.isArray(parsed)) {
          const now = Date.now();
          const { stale, fresh } = parsed.reduce<{
            stale: ApprovalIntent[];
            fresh: ApprovalIntent[];
          }>(
            (acc, intent) => {
              if (now - intent.createdAt > STALE_MS) acc.stale.push(intent);
              else acc.fresh.push(intent);
              return acc;
            },
            { stale: [], fresh: [] },
          );
          this.intents = fresh;
          this.notify();
          // Synthesize reject decisions for stale intents so the dApp
          // observer (DappBridge) can post -32002 back to the WebView.
          for (const s of stale) {
            this.resolve(s.id, { id: s.id, outcome: "reject" });
          }
        }
      } catch (e) {
        if (__DEV__) console.warn("[pendingIntents] hydrate failed", e);
      } finally {
        this.hydrated = true;
      }
    })();
    return this.hydratePromise;
  }

  private async persist(): Promise<void> {
    try {
      await SecureStore.setItemAsync(
        STORAGE_KEY,
        JSON.stringify(this.intents, replacer),
      );
    } catch (e) {
      if (__DEV__) console.warn("[pendingIntents] persist failed", e);
    }
  }

  clearAll(): void {
    this.intents = [];
    this.notify();
    void this.persist();
  }
}

// bigint is not JSON-serializable — encode as {__b:"0x…"} on the way out and
// decode on the way in. Intents in flight carry viem bigints in fee fields.
function replacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") {
    return { __b: `0x${value.toString(16)}` };
  }
  return value;
}

function reviver(_key: string, value: unknown): unknown {
  if (
    value &&
    typeof value === "object" &&
    "__b" in value &&
    typeof (value as { __b: unknown }).__b === "string"
  ) {
    return BigInt((value as { __b: string }).__b);
  }
  return value;
}

export const pendingIntentsStore = new PendingIntentsStore();
