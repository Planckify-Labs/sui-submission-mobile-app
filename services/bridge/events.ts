import type { Namespace, Origin } from "@/services/chains/types";
import type { ApprovalIntent } from "./approval";
import type { InspectorVerdict, IntentAnnotation } from "./inspector";

export type BridgeEvent =
  | {
      kind: "request";
      at: number;
      id: string;
      namespace: Namespace;
      method: string;
      origin: Origin;
      params: unknown;
    }
  | {
      kind: "intent";
      at: number;
      intent: ApprovalIntent;
      annotations: IntentAnnotation[];
      verdict: InspectorVerdict;
    }
  | {
      kind: "decision";
      at: number;
      id: string;
      outcome: "approve" | "reject";
      latencyMs: number;
    }
  | {
      kind: "result";
      at: number;
      id: string;
      ok: boolean;
      value?: unknown;
      error?: { code: number; message: string };
    }
  | { kind: "navigate"; at: number; url: string; title?: string };

export interface BridgeEventSink {
  emit(e: BridgeEvent): void;
}

const DEFAULT_RING_SIZE = 200;

export class BridgeEventBus {
  private sinks = new Set<BridgeEventSink>();
  private ring: BridgeEvent[] = [];
  private size: number;

  constructor(size = DEFAULT_RING_SIZE) {
    this.size = size;
  }

  subscribe(sink: BridgeEventSink): () => void {
    this.sinks.add(sink);
    return () => this.sinks.delete(sink);
  }

  emit(e: BridgeEvent): void {
    this.ring.push(e);
    if (this.ring.length > this.size) this.ring.shift();
    for (const sink of this.sinks) {
      try {
        sink.emit(e);
      } catch (err) {
        if (__DEV__) console.warn("[bridge-event-bus] sink threw", err);
      }
    }
  }

  recent(n?: number): BridgeEvent[] {
    if (!n || n >= this.ring.length) return [...this.ring];
    return this.ring.slice(-n);
  }

  clear(): void {
    this.ring.length = 0;
  }
}

export const bridgeEventBus = new BridgeEventBus();
