import type { WebView } from "react-native-webview";
import { toRpcErrorPayload } from "@/services/chains/evm/errors";
import { ChainAdapterRegistry } from "@/services/chains/registry";
import type {
  AdapterContext,
  ChainRequest,
  Namespace,
  Origin,
} from "@/services/chains/types";
import { originKey } from "@/services/permissions/caip";
import type { ApprovalDecision, ApprovalIntent } from "./approval";
import { bridgeEventBus } from "./events";
import { runPipeline, runSingleInspector } from "./inspector";
import { pendingIntentsStore } from "./pendingIntents";
import { redactParams } from "./redact";

interface InFlight {
  resolve: (result: unknown) => void;
  reject: (code: number, message: string, data?: unknown) => void;
  origin: Origin;
  namespace: Namespace;
  method: string;
  startedAt: number;
}

export type ContextProvider = () => AdapterContext;

export interface DappBridgeOpts {
  getContext: ContextProvider;
  getWebView: () => WebView | null;
}

export class DappBridge {
  private inFlight = new Map<string, InFlight>();
  private pendingByOrigin = new Map<string, string>();
  private opts: DappBridgeOpts;

  constructor(opts: DappBridgeOpts) {
    this.opts = opts;
    pendingIntentsStore.onResolve((id, decision) => {
      void this.handleDecision(id, decision);
    });
  }

  /**
   * Rebind opts without touching subscriptions. The screen re-creates the
   * closures backing \`getContext\` and \`getWebView\` on every render; this
   * lets us pick up the fresh closures without ever creating a second
   * bridge (which would stack listeners on \`pendingIntentsStore\` and
   * cause duplicate \`executeApproval\` runs per decision).
   */
  updateOpts(opts: DappBridgeOpts): void {
    this.opts = opts;
  }

  async dispatch(rawMessage: unknown): Promise<void> {
    const parsed = parseMessage(rawMessage);
    if (!parsed) return;
    const { id, namespace, method, params, origin } = parsed;

    const adapter = ChainAdapterRegistry.get(namespace);
    if (!adapter) {
      this.postError(id, 4200, `namespace ${namespace} not supported`);
      return;
    }

    const startedAt = Date.now();
    // Register in-flight so approval path can resolve it.
    this.inFlight.set(id, {
      resolve: (value) => this.postResult(id, value),
      reject: (code, message, data) => this.postError(id, code, message, data),
      origin,
      namespace,
      method,
      startedAt,
    });

    bridgeEventBus.emit({
      kind: "request",
      at: startedAt,
      id,
      namespace,
      method,
      origin,
      params: redactParams(method, params),
    });

    try {
      const ctx = this.opts.getContext();
      const req: ChainRequest = {
        id,
        namespace,
        method,
        params,
        origin,
      };
      const result = await adapter.handleRequest(req, ctx);
      if (result.status === "resolved") {
        this.postResult(id, result.value);
        return;
      }
      if (result.status === "error") {
        this.postError(id, result.code, result.message, result.data);
        return;
      }
      await this.enqueue(result.intent);
    } catch (e) {
      const { code, message, data } = toRpcErrorPayload(e);
      this.postError(id, code, message, data);
    }
  }

  async enqueue(intent: ApprovalIntent): Promise<void> {
    const originHost = originKey(intent.origin.url);
    const existing = this.pendingByOrigin.get(originHost);
    if (existing && existing !== intent.id) {
      this.postError(
        intent.id,
        -32002,
        "Resource unavailable — another approval from this origin is pending",
      );
      return;
    }
    this.pendingByOrigin.set(originHost, intent.id);

    const controller = new AbortController();
    const pipeline = await runPipeline(intent, "auto", controller.signal);
    const merged: ApprovalIntent = {
      ...intent,
      annotations: [...intent.annotations, ...pipeline.annotations],
      payload: pipeline.patch
        ? ({
            ...(intent.payload as object),
            ...pipeline.patch,
          } as ApprovalIntent["payload"])
        : intent.payload,
    };

    bridgeEventBus.emit({
      kind: "intent",
      at: Date.now(),
      intent: merged,
      annotations: merged.annotations,
      verdict: pipeline.verdict,
    });

    if (pipeline.verdict === "block") {
      this.pendingByOrigin.delete(originHost);
      this.postError(intent.id, 4001, "Request blocked by wallet policy");
      return;
    }

    pendingIntentsStore.push(merged);
  }

  /** Called by the screen on WebView navigation — enforces §10.4 inv 5. */
  onNavigate(url: string, title?: string): void {
    bridgeEventBus.emit({
      kind: "navigate",
      at: Date.now(),
      url,
      title,
    });
    const newHost = originKey(url);
    for (const intent of pendingIntentsStore.snapshot) {
      const intentHost = originKey(intent.origin.url);
      if (intentHost !== newHost) {
        this.resolve(intent.id, { id: intent.id, outcome: "reject" });
      }
    }
  }

  /**
   * External entry — UI layer (ApprovalHost) delivers the user decision
   * here, which fans out to the adapter's executeApproval.
   */
  resolve(id: string, decision: ApprovalDecision): void {
    pendingIntentsStore.resolve(id, decision);
  }

  /**
   * Agent entry — lets the agent submit its own intent through the same
   * pipeline. Returns the terminal decision.
   */
  async submitAgentIntent(
    intent: Omit<ApprovalIntent, "annotations"> & {
      annotations?: ApprovalIntent["annotations"];
    },
  ): Promise<{ result?: unknown; error?: { code: number; message: string } }> {
    const agentOrigin: Origin = {
      ...intent.origin,
      via: "agent",
    };
    const fullIntent: ApprovalIntent = {
      ...intent,
      annotations: intent.annotations ?? [],
      origin: agentOrigin,
    };
    return new Promise((resolve) => {
      this.inFlight.set(intent.id, {
        resolve: (value) => resolve({ result: value }),
        reject: (code, message) => resolve({ error: { code, message } }),
        origin: agentOrigin,
        namespace: intent.namespace,
        method: `agent:${intent.kind}`,
        startedAt: Date.now(),
      });
      bridgeEventBus.emit({
        kind: "request",
        at: Date.now(),
        id: intent.id,
        namespace: intent.namespace,
        method: `agent:${intent.kind}`,
        origin: agentOrigin,
        params: redactParams("agent", intent.payload),
      });
      void this.enqueue(fullIntent);
    });
  }

  async runOnDemandInspector(name: string, intentId: string): Promise<void> {
    const intent = pendingIntentsStore.snapshot.find((i) => i.id === intentId);
    if (!intent) return;
    const controller = new AbortController();
    const res = await runSingleInspector(name, intent, controller.signal);
    if (!res) return;
    // Mutate via a remove+push so subscribers see the update.
    pendingIntentsStore.remove(intentId);
    pendingIntentsStore.push({
      ...intent,
      annotations: [...intent.annotations, ...res.annotations],
    });
  }

  private pushPostDecisionUpdate(
    intent: ApprovalIntent,
    value: unknown,
    adapter: ReturnType<typeof ChainAdapterRegistry.get>,
  ): void {
    if (!adapter) return;
    const wv = this.opts.getWebView();
    if (!wv) return;

    // Fast path — connect returns [address]; inject the state update
    // directly from that so we don't need to wait for React to re-render.
    if (
      intent.kind === "connect" &&
      intent.namespace === "eip155" &&
      Array.isArray(value) &&
      typeof value[0] === "string"
    ) {
      const addr = value[0];
      const chainId = (intent.payload as { chainId?: number }).chainId ?? 1;
      const chainIdHex = `0x${chainId.toString(16)}`;
      wv.injectJavaScript(`
        (function(){
          try {
            window._updateEthereumProvider && window._updateEthereumProvider({
              selectedAddress: ${JSON.stringify(addr)},
              chainId: ${JSON.stringify(chainIdHex)},
              networkVersion: ${JSON.stringify(String(chainId))}
            });
          } catch (e) {}
        })();
        true;
      `);
      return;
    }

    // Slow path — delay one tick so setActiveWallet / setActiveChain
    // mutations have a chance to settle before we re-read ctx.
    setTimeout(() => {
      const freshCtx = this.opts.getContext();
      const state = adapter.onStateChange?.(freshCtx);
      const wv2 = this.opts.getWebView();
      if (state?.injectedJs && wv2) wv2.injectJavaScript(state.injectedJs);
    }, 100);
  }

  private async handleDecision(
    id: string,
    decision: ApprovalDecision,
  ): Promise<void> {
    const intent = pendingIntentsStore.snapshot.find((i) => i.id === id);
    if (!intent) return;
    const inflight = this.inFlight.get(id);
    const latency = inflight ? Date.now() - inflight.startedAt : 0;

    bridgeEventBus.emit({
      kind: "decision",
      at: Date.now(),
      id,
      outcome: decision.outcome,
      latencyMs: latency,
    });

    const originHost = originKey(intent.origin.url);
    this.pendingByOrigin.delete(originHost);

    if (decision.outcome === "reject") {
      pendingIntentsStore.remove(id);
      this.postError(id, 4001, "User rejected the request");
      return;
    }

    const ctx = this.opts.getContext();
    const adapter = ChainAdapterRegistry.get(intent.namespace);
    if (!adapter) {
      pendingIntentsStore.remove(id);
      this.postError(id, 4200, "adapter not available");
      return;
    }
    try {
      const value = await adapter.executeApproval(intent, decision, ctx);
      pendingIntentsStore.remove(id);
      this.postResult(id, value);
      // Push post-decision provider state into the WebView. For connect
      // specifically we build the update from the returned address rather
      // than the captured ctx — `ctx.activeWallet` reflects the pre-click
      // state until React re-renders, so reading from ctx would inject the
      // OLD address and the dApp would never see `accountsChanged`. The
      // fresh-ctx onStateChange path still runs a tick later to cover
      // chain changes that flow through app-level state.
      this.pushPostDecisionUpdate(intent, value, adapter);
    } catch (e) {
      pendingIntentsStore.remove(id);
      const { code, message, data } = toRpcErrorPayload(e);
      this.postError(id, code, message, data);
    }
  }

  private postResult(id: string, value: unknown): void {
    const inflight = this.inFlight.get(id);
    this.inFlight.delete(id);
    if (inflight?.resolve) {
      bridgeEventBus.emit({
        kind: "result",
        at: Date.now(),
        id,
        ok: true,
        value,
      });
    }
    this.post({ type: "bridge_response", id, result: value, error: null });
  }

  private postError(
    id: string,
    code: number,
    message: string,
    data?: unknown,
  ): void {
    const inflight = this.inFlight.get(id);
    this.inFlight.delete(id);
    if (inflight?.reject) {
      bridgeEventBus.emit({
        kind: "result",
        at: Date.now(),
        id,
        ok: false,
        error: { code, message },
      });
    }
    this.post({
      type: "bridge_response",
      id,
      result: null,
      error: { code, message, data },
    });
  }

  private post(payload: Record<string, unknown>): void {
    const wv = this.opts.getWebView();
    if (!wv) return;
    const json = JSON.stringify(payload);
    // Legacy path — for provider scripts that only listen on
    // _handleEthereumResponse via injection.
    wv.postMessage(json);
    wv.injectJavaScript(`
      try { window._handleEthereumResponse && window._handleEthereumResponse(${json}); } catch (e) {}
      true;
    `);
  }
}

function parseMessage(raw: unknown): {
  id: string;
  namespace: Namespace;
  method: string;
  params: unknown;
  origin: Origin;
} | null {
  try {
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!data || typeof data !== "object") return null;
    const d = data as Record<string, unknown>;
    // Support legacy ethereum_request shape as well as new bridge_request
    if (d.type !== "ethereum_request" && d.type !== "bridge_request")
      return null;
    const id = String(d.id ?? `${Date.now()}-${Math.random()}`);
    const namespace: Namespace =
      (d.namespace as Namespace) ?? ("eip155" as Namespace);
    const method = String(d.method ?? "");
    const params = d.params ?? [];
    const origin = (d.origin as Origin) ?? ({ url: "" } as Origin);
    if (!method) return null;
    return { id, namespace, method, params, origin };
  } catch {
    return null;
  }
}

let bridgeSingleton: DappBridge | null = null;

export function initDappBridge(opts: DappBridgeOpts): DappBridge {
  // Singleton — re-initializing just rebinds opts. Creating a new
  // instance would add a second resolve-listener to pendingIntentsStore
  // and cause every approval to fire executeApproval N times.
  if (bridgeSingleton) {
    bridgeSingleton.updateOpts(opts);
    return bridgeSingleton;
  }
  bridgeSingleton = new DappBridge(opts);
  return bridgeSingleton;
}

export function getDappBridge(): DappBridge | null {
  return bridgeSingleton;
}
