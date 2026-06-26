/**
 * Sui simulation inspector — runs `dryRunTransactionBlock` and emits
 * balance-change / object-change warnings.
 *
 * Spec reference: `docs/sui-dapp-bridge-spec.md` §8.2.
 *
 * Runs at priority 20 (after the PTB decoder at 15) so simulation
 * warnings can be derived against decoder-patched fields like
 * `payload.sender`.
 */

import { SuiJsonRpcClient as SuiClient } from "@mysten/sui/jsonRpc";
import type {
  SuiNetwork,
  SuiSignTxPayload,
} from "@/services/chains/sui/payloads";
import { simulateSuiTransaction } from "@/services/chains/sui/simulation";
import type { ApprovalIntent } from "../approval";
import type { IntentAnnotation, IntentInspector } from "../inspector";

const PUBLIC_RPC: Record<SuiNetwork, string> = {
  mainnet: "https://fullnode.mainnet.sui.io:443",
  testnet: "https://fullnode.testnet.sui.io:443",
  devnet: "https://fullnode.devnet.sui.io:443",
};

const clientCache = new Map<SuiNetwork, SuiClient>();
function getClient(network: SuiNetwork): SuiClient {
  let c = clientCache.get(network);
  if (!c) {
    c = new SuiClient({ url: PUBLIC_RPC[network], network });
    clientCache.set(network, c);
  }
  return c;
}

/** Test-only escape hatch — clear the per-network client cache. */
export function __clearSuiSimulationClientCache(): void {
  clientCache.clear();
}

/** Test-only override — inject a stub client for a given network. */
export function __setSuiSimulationClientForTesting(
  network: SuiNetwork,
  client: SuiClient,
): void {
  clientCache.set(network, client);
}

export const SuiSimulationInspector: IntentInspector = {
  name: "sui-simulation",
  priority: 20,
  mode: "auto",
  namespaces: ["sui"],
  async inspect(intent: ApprovalIntent) {
    if (intent.kind !== "signTransaction") {
      return { annotations: [], verdict: "allow" };
    }
    const payload = intent.payload as SuiSignTxPayload;
    if (!payload.transaction || !payload.network) {
      return { annotations: [], verdict: "allow" };
    }

    const client = getClient(payload.network);
    const summary = await simulateSuiTransaction(client, {
      txBase64: payload.transaction,
      sender: payload.sender ?? payload.address,
    });
    if (!summary) {
      return { annotations: [], verdict: "allow" };
    }

    const annotations: IntentAnnotation[] = [];
    for (const w of summary.warnings) {
      switch (w.code) {
        case "object.delete":
          annotations.push({
            code: "simulation.object.delete",
            severity: "danger",
            title: "Object will be deleted",
            detail: `Object ${w.objectId} is deleted by this transaction.`,
            source: "sui-simulation",
          });
          break;
        case "ownership.transfer-out":
          annotations.push({
            code: "simulation.ownership.transfer-out",
            severity: "warn",
            title: "Coin transfer out",
            detail: `${w.coinType}: ${w.amount.toString()} MIST leaves your wallet.`,
            source: "sui-simulation",
          });
          break;
        case "object.transfer-out":
          annotations.push({
            code: "simulation.object.transfer-out",
            severity: "warn",
            title: "Object transfer out",
            detail: `An object of type ${w.objectType} is transferred to a different recipient.`,
            source: "sui-simulation",
          });
          break;
        default:
          break;
      }
    }

    if (summary.status !== "success") {
      // `summary.status` carries the raw Sui Move/VM abort string on
      // failure — that must never reach the user-facing RiskBanner.
      if (__DEV__) {
        console.warn(
          "[SuiSimulationInspector] simulation failed:",
          summary.status,
        );
      }
      annotations.push({
        code: "simulation.failed",
        severity: "danger",
        title: "Simulation failed",
        detail:
          "This transaction is expected to fail if you continue. Proceed with caution.",
        source: "sui-simulation",
      });
    }

    return {
      annotations,
      verdict: annotations.some((a) => a.severity === "danger")
        ? "require-extra-confirmation"
        : "allow",
      patch: {
        ...(payload as object),
        simulation: summary,
      } as Partial<ApprovalIntent["payload"]>,
    };
  },
};
