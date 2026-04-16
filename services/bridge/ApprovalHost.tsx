import React, { useEffect, useState } from "react";
import type { ApprovalIntent } from "./approval";
import { getDappBridge } from "./DappBridge";
import { pendingIntentsStore } from "./pendingIntents";
import { getRenderers } from "./renderers";

export function ApprovalHost(): React.ReactElement | null {
  const [intents, setIntents] = useState<ApprovalIntent[]>([]);

  useEffect(() => {
    const unsub = pendingIntentsStore.subscribe(setIntents);
    void pendingIntentsStore.hydrate();
    return unsub;
  }, []);

  if (intents.length === 0) return null;
  // Oldest first, one active sheet.
  const intent = intents[0];
  const renderers = getRenderers();
  const match = renderers.find((r) => {
    try {
      return r.canHandle(intent);
    } catch {
      return false;
    }
  });

  if (!match) {
    // No renderer matched — dev-time bug. Auto-reject after 100ms so the dApp
    // isn't left hanging.
    setTimeout(() => {
      const bridge = getDappBridge();
      bridge?.resolve(intent.id, { id: intent.id, outcome: "reject" });
    }, 100);
    if (__DEV__) {
      console.warn(
        "[ApprovalHost] no renderer for intent",
        intent.namespace,
        intent.kind,
      );
    }
    return null;
  }

  const Component = match.Component;
  return (
    <Component
      intent={intent}
      onDecision={(d) => {
        const bridge = getDappBridge();
        bridge?.resolve(intent.id, d);
      }}
    />
  );
}
