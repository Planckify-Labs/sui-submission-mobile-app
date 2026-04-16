import type { BridgeEventSink } from "../events";

export const ConsoleSink: BridgeEventSink = {
  emit(e) {
    if (!__DEV__) return;
    console.debug("[bridge]", e.kind, e);
  },
};
