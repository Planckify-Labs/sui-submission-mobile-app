import type {
  ApprovalDecision,
  ApprovalIntent,
} from "@/services/bridge/approval";
import type {
  AdapterContext,
  ChainAdapter,
  ChainRequest,
  ChainResult,
} from "@/services/chains/types";
import type {
  SolanaConnectPayload,
  SolanaSignMessagePayload,
  SolanaSignTxPayload,
} from "./payloads";

/**
 * Minimal Solana adapter scaffold — the Wallet Standard injection
 * announces a wallet to the WebView, and the RPC dispatch maps the
 * standard methods to `ApprovalIntent`. Signing itself delegates to a
 * pluggable `signer` callback so the adapter doesn't hard-depend on
 * `@solana/web3.js` (which we add to the mobile-app package when we
 * mint Solana wallets — tracked as a follow-up).
 */
export interface SolanaSignerFns {
  signMessage: (address: string, message: string) => Promise<string>;
  signTransaction: (address: string, txBase64: string) => Promise<string>;
  signAndSendTransaction: (
    address: string,
    txBase64: string,
    cluster: string,
  ) => Promise<string>;
}

let signerImpl: SolanaSignerFns | null = null;

export function registerSolanaSigner(signer: SolanaSignerFns): void {
  signerImpl = signer;
}

class SolanaAdapter implements ChainAdapter {
  readonly namespace = "solana" as const;

  getInjectedScript(ctx: AdapterContext): string {
    const solWallet = ctx.wallets.find((w) => w.namespace === "solana");
    const address = solWallet?.address ?? null;
    return `
(function() {
  if (window.__takumi_solana_installed) return;
  window.__takumi_solana_installed = true;

  var handlers = { connect: new Set(), disconnect: new Set(), accountChanged: new Set() };
  var pub = ${JSON.stringify(address)};

  function request(method, params) {
    return new Promise(function(resolve, reject) {
      var id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
      window._pendingRequests = window._pendingRequests || new Map();
      window._pendingRequests.set(id, { resolve: resolve, reject: reject });
      try {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'bridge_request',
          namespace: 'solana',
          id: id,
          method: method,
          params: params
        }));
      } catch (e) {
        window._pendingRequests.delete(id);
        reject(new Error('bridge transport failed'));
      }
    });
  }

  var solana = {
    publicKey: pub ? { toString: function() { return pub; } } : null,
    isConnected: !!pub,
    isTakumi: true,
    connect: function(opts) { return request('solana:standard:connect', [opts || {}]); },
    disconnect: function() { return request('solana:standard:disconnect', []); },
    signMessage: function(message) { return request('solana:signMessage', [message]); },
    signTransaction: function(tx) { return request('solana:signTransaction', [tx]); },
    signAndSendTransaction: function(tx, opts) {
      return request('solana:signAndSendTransaction', [tx, opts || {}]);
    },
    on: function(event, cb) { (handlers[event] || (handlers[event] = new Set())).add(cb); },
    off: function(event, cb) { handlers[event] && handlers[event].delete(cb); }
  };

  window.solana = solana;

  // Wallet Standard minimal announce.
  try {
    window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', {
      detail: { name: 'TakumiAI Wallet', chains: ['solana:mainnet', 'solana:devnet'] }
    }));
  } catch (e) {}
})();
`;
  }

  async handleRequest(
    req: ChainRequest,
    ctx: AdapterContext,
  ): Promise<ChainResult> {
    const solWallet = ctx.wallets.find((w) => w.namespace === "solana");
    switch (req.method) {
      case "solana:standard:connect": {
        return {
          status: "needs-approval",
          intent: makeIntent<SolanaConnectPayload>(
            req,
            "connect",
            { cluster: "mainnet-beta" },
            solWallet ?? null,
          ),
        };
      }
      case "solana:signMessage": {
        const [message] = (req.params as unknown[]) ?? [];
        if (!solWallet)
          return {
            status: "error",
            code: 4100,
            message: "Solana wallet not available",
          };
        return {
          status: "needs-approval",
          intent: makeIntent<SolanaSignMessagePayload>(
            req,
            "signMessage",
            {
              message: typeof message === "string" ? message : "",
              address: solWallet.address,
            },
            solWallet,
          ),
        };
      }
      case "solana:signTransaction":
      case "solana:signAndSendTransaction": {
        const [tx, opts] = (req.params as unknown[]) ?? [];
        if (!solWallet)
          return {
            status: "error",
            code: 4100,
            message: "Solana wallet not available",
          };
        const cluster =
          (opts as { cluster?: string })?.cluster ?? "mainnet-beta";
        return {
          status: "needs-approval",
          intent: makeIntent<SolanaSignTxPayload>(
            req,
            "signTransaction",
            {
              transaction: typeof tx === "string" ? tx : "",
              cluster: cluster as SolanaSignTxPayload["cluster"],
              address: solWallet.address,
            },
            solWallet,
          ),
        };
      }
      case "solana:standard:disconnect":
        return { status: "resolved", value: null };
      default:
        return {
          status: "error",
          code: 4200,
          message: `Method ${req.method} not supported`,
        };
    }
  }

  async executeApproval(
    intent: ApprovalIntent,
    decision: ApprovalDecision,
    _ctx: AdapterContext,
  ): Promise<unknown> {
    if (decision.outcome === "reject") {
      throw Object.assign(new Error("User rejected"), { code: 4001 });
    }
    if (!signerImpl) {
      throw Object.assign(new Error("No Solana signer registered"), {
        code: -32603,
      });
    }
    switch (intent.kind) {
      case "connect": {
        const payload = intent.payload as SolanaConnectPayload;
        const wallet = intent.wallet;
        return {
          publicKey: wallet?.address ?? null,
          cluster: payload.cluster,
        };
      }
      case "signMessage": {
        const p = intent.payload as SolanaSignMessagePayload;
        return signerImpl.signMessage(p.address, p.message);
      }
      case "signTransaction": {
        const p = intent.payload as SolanaSignTxPayload;
        // Default to sign-and-send since Wallet Standard dApps mostly want this.
        return signerImpl.signAndSendTransaction(
          p.address,
          p.transaction,
          p.cluster,
        );
      }
      default:
        throw Object.assign(new Error("Unsupported"), { code: 4200 });
    }
  }
}

function makeIntent<P>(
  req: ChainRequest,
  kind: ApprovalIntent["kind"],
  payload: P,
  wallet: ApprovalIntent["wallet"],
): ApprovalIntent<P> {
  return {
    id: req.id,
    namespace: "solana",
    kind,
    origin: req.origin,
    wallet,
    payload,
    annotations: [],
    createdAt: Date.now(),
  };
}

export function createSolanaAdapter(): ChainAdapter {
  return new SolanaAdapter();
}
