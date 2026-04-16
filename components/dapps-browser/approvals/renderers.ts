import type { ApprovalRenderer } from "@/services/bridge/approval";
import { AddChainSheet } from "./AddChainSheet";
import { AgentCardRenderer } from "./AgentCardRenderer";
import { AuthorizationSheet } from "./AuthorizationSheet";
import { ConnectSheet } from "./ConnectSheet";
import { EvmBatchCallsSheet } from "./EvmBatchCallsSheet";
import { EvmSignMessageSheet } from "./EvmSignMessageSheet";
import { EvmTransactionSheet } from "./EvmTransactionSheet";
import { SolanaSignMessageSheet } from "./SolanaSignMessageSheet";
import { SolanaTransactionSheet } from "./SolanaTransactionSheet";
import { SwitchChainSheet } from "./SwitchChainSheet";
import { WatchAssetSheet } from "./WatchAssetSheet";

export const evmRenderers: ApprovalRenderer[] = [
  // Agent-origin takes precedence so intents tagged `origin.via === "agent"`
  // render via the agent renderer instead of the default chain sheets.
  {
    canHandle: (i) => i.origin?.via === "agent",
    Component: AgentCardRenderer as ApprovalRenderer["Component"],
  },
  {
    canHandle: (i) => i.namespace === "eip155" && i.kind === "connect",
    Component: ConnectSheet as ApprovalRenderer["Component"],
  },
  {
    canHandle: (i) =>
      i.namespace === "eip155" &&
      (i.kind === "signMessage" || i.kind === "signTypedData"),
    Component: EvmSignMessageSheet as ApprovalRenderer["Component"],
  },
  {
    canHandle: (i) => i.namespace === "eip155" && i.kind === "sendTransaction",
    Component: EvmTransactionSheet as ApprovalRenderer["Component"],
  },
  {
    canHandle: (i) => i.namespace === "eip155" && i.kind === "addChain",
    Component: AddChainSheet as ApprovalRenderer["Component"],
  },
  {
    canHandle: (i) => i.namespace === "eip155" && i.kind === "switchChain",
    Component: SwitchChainSheet as ApprovalRenderer["Component"],
  },
  {
    canHandle: (i) => i.namespace === "eip155" && i.kind === "watchAsset",
    Component: WatchAssetSheet as ApprovalRenderer["Component"],
  },
  {
    canHandle: (i) => i.namespace === "eip155" && i.kind === "sendCalls",
    Component: EvmBatchCallsSheet as ApprovalRenderer["Component"],
  },
  {
    canHandle: (i) =>
      i.namespace === "eip155" && i.kind === "signAuthorization",
    Component: AuthorizationSheet as ApprovalRenderer["Component"],
  },
  {
    canHandle: (i) => i.namespace === "solana" && i.kind === "connect",
    Component: ConnectSheet as ApprovalRenderer["Component"],
  },
  {
    canHandle: (i) => i.namespace === "solana" && i.kind === "signMessage",
    Component: SolanaSignMessageSheet as ApprovalRenderer["Component"],
  },
  {
    canHandle: (i) => i.namespace === "solana" && i.kind === "signTransaction",
    Component: SolanaTransactionSheet as ApprovalRenderer["Component"],
  },
];
