import type { ComponentType } from "react";
import type { TWallet } from "@/constants/types/walletTypes";
import type { Namespace, Origin } from "@/services/chains/types";
import type { IntentAnnotation } from "./inspector";

export type ApprovalKind =
  | "connect"
  | "signMessage"
  | "signTypedData"
  | "signTransaction"
  | "sendTransaction"
  | "switchChain"
  | "addChain"
  | "watchAsset"
  | "sendCalls"
  | "signAuthorization";

export interface ApprovalIntent<P = unknown> {
  id: string;
  namespace: Namespace;
  kind: ApprovalKind;
  origin: Origin;
  wallet: TWallet | null;
  payload: P;
  annotations: IntentAnnotation[];
  createdAt: number;
}

export interface ApprovalDecision {
  id: string;
  outcome: "approve" | "reject";
  data?: unknown;
}

export interface ApprovalRenderer {
  canHandle(intent: ApprovalIntent): boolean;
  Component: ComponentType<{
    intent: ApprovalIntent;
    onDecision: (d: ApprovalDecision) => void;
  }>;
}
