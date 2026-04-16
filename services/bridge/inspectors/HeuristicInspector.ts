import type {
  EvmAddChainPayload,
  EvmSignTypedDataPayload,
} from "@/services/chains/evm/payloads";
import { tryDecodeErc2612, tryDecodePermit2 } from "@/services/decoders";
import { tryParseSiwe } from "@/services/decoders/siwe";
import { originHost } from "@/services/permissions/caip";
import type { ApprovalIntent } from "../approval";
import type { IntentInspector } from "../inspector";

export const HeuristicInspector: IntentInspector = {
  name: "heuristic",
  priority: 10,
  mode: "auto",
  namespaces: ["eip155"],
  async inspect(intent: ApprovalIntent) {
    const annotations = [];
    const url = intent.origin.url ?? "";

    // Legacy eth_sign is a blind-sign footgun — flag every time.
    if (
      intent.kind === "signMessage" &&
      (intent.payload as { method?: string })?.method === "eth_sign"
    ) {
      annotations.push({
        code: "sign.eth_sign_legacy",
        severity: "danger" as const,
        title: "Legacy eth_sign is dangerous",
        detail:
          "This method signs arbitrary hashes and can authorize transactions without your knowledge.",
        source: "heuristic",
      });
    }

    if (intent.kind === "signTypedData") {
      const payload = intent.payload as EvmSignTypedDataPayload;
      const permit =
        tryDecodeErc2612(payload.typedData) ??
        tryDecodePermit2(payload.typedData);
      if (permit?.isUnlimited) {
        annotations.push({
          code: "approval.unlimited",
          severity: "warn" as const,
          title: "Unlimited token approval",
          detail:
            "You're granting the spender permission to move an effectively unlimited amount.",
          source: "heuristic",
          data: permit,
        });
      }
    }

    if (intent.kind === "signMessage") {
      const payload = intent.payload as {
        message: string;
        display: "utf8" | "hex";
      };
      if (payload.display === "utf8") {
        const siwe = tryParseSiwe(payload.message);
        if (siwe) {
          const host = originHost(url);
          const normalizedSiweDomain = siwe.domain
            .toLowerCase()
            .replace(/\.$/, "");
          if (host && normalizedSiweDomain && host !== normalizedSiweDomain) {
            annotations.push({
              code: "siwe.domain-mismatch",
              severity: "danger" as const,
              title: "SIWE domain mismatch",
              detail: `The message claims to be from ${siwe.domain} but the page is ${host}.`,
              source: "heuristic",
              data: { expected: host, got: siwe.domain },
            });
          }
          if (
            intent.wallet &&
            siwe.address.toLowerCase() !== intent.wallet.address.toLowerCase()
          ) {
            annotations.push({
              code: "siwe.address-mismatch",
              severity: "warn" as const,
              title: "SIWE address mismatch",
              detail: `The message is for ${siwe.address} but your active wallet is ${intent.wallet.address}.`,
              source: "heuristic",
            });
          }
        }
      }
    }

    if (intent.kind === "addChain") {
      const payload = intent.payload as EvmAddChainPayload;
      const rpc = payload.rpcUrls?.[0];
      if (rpc && !rpc.startsWith("https://")) {
        annotations.push({
          code: "addChain.insecure-rpc",
          severity: "warn" as const,
          title: "Insecure RPC URL",
          detail: `${rpc} is not https. Transactions may be observed in transit.`,
          source: "heuristic",
        });
      }
      const explorer = payload.blockExplorerUrls?.[0];
      if (rpc && explorer) {
        try {
          const rpcHost = new URL(rpc).hostname;
          const expHost = new URL(explorer).hostname;
          const rpcRoot = rpcHost.split(".").slice(-2).join(".");
          const expRoot = expHost.split(".").slice(-2).join(".");
          if (rpcRoot !== expRoot) {
            annotations.push({
              code: "addChain.domain-mismatch",
              severity: "warn" as const,
              title: "RPC and explorer are different domains",
              detail: `RPC: ${rpcHost}  ·  Explorer: ${expHost}`,
              source: "heuristic",
            });
          }
        } catch {
          // invalid URL — leave it to Zod validation upstream
        }
      }
    }

    return { annotations, verdict: "allow" as const };
  },
};
