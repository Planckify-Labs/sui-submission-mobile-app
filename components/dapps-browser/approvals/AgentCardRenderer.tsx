import React from "react";
import type {
  ApprovalDecision,
  ApprovalIntent,
} from "@/services/bridge/approval";
import { ConnectSheet } from "./ConnectSheet";
import { EvmBatchCallsSheet } from "./EvmBatchCallsSheet";
import { EvmSignMessageSheet } from "./EvmSignMessageSheet";
import { EvmTransactionSheet } from "./EvmTransactionSheet";

interface Props {
  intent: ApprovalIntent;
  onDecision: (d: ApprovalDecision) => void;
}

/**
 * Agent-origin renderer. Phase 1a reuses the EVM sheet components so the
 * agent path produces behaviorally identical chrome. Phase 2's product goal
 * is an in-chat card — that will migrate the actual surface without
 * touching the adapter or the intent shape.
 */
export function AgentCardRenderer({
  intent,
  onDecision,
}: Props): React.ReactElement | null {
  if (intent.kind === "connect") {
    return <ConnectSheet intent={intent as any} onDecision={onDecision} />;
  }
  if (intent.kind === "signMessage" || intent.kind === "signTypedData") {
    return (
      <EvmSignMessageSheet intent={intent as any} onDecision={onDecision} />
    );
  }
  if (intent.kind === "sendTransaction") {
    return (
      <EvmTransactionSheet intent={intent as any} onDecision={onDecision} />
    );
  }
  if (intent.kind === "sendCalls") {
    return (
      <EvmBatchCallsSheet intent={intent as any} onDecision={onDecision} />
    );
  }
  return null;
}
