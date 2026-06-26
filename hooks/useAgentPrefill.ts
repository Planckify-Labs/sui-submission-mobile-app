import { useCallback } from "react";
import useRQGlobalState from "./useRQGlobalState";

const AGENT_PREFILL_QUERY_KEY = ["agent-prefill-prompt"] as const;

export interface AgentPrefill {
  /** The prompt text handed to the agent chat. */
  text: string;
  /**
   * When true, `AgentMode` fires the prompt straight into a new turn
   * (capability / spotlight / quick-prompt cards — one-tap actions). When
   * false it only fills the composer for the user to review and send (the
   * voice mic, which prefills the transcript).
   */
  autoSend: boolean;
}

/**
 * One-shot channel for handing a prompt to the Takumi Agent chat from a
 * sibling screen (e.g. the home `TakumiAgentSection` voice bar / cards)
 * without prop-drilling through the home pager.
 *
 * The producer (home section) writes the text via `setPrefill`; the
 * consumer (`AgentMode`) reads it on mount / change. With `autoSend:false`
 * it drops the text into the `ChatInput` value (NOT auto-sent — the user
 * reviews and taps send); with `autoSend:true` it sends the prompt
 * immediately once the wallet/session context is ready. Either way it
 * `clearPrefill`s so a later remount doesn't re-fill / re-send a stale
 * value. Backed by `useRQGlobalState` so both screens share the same
 * React-Query cache entry.
 */
export function useAgentPrefill() {
  const { data, setNewData } = useRQGlobalState<AgentPrefill | null>({
    queryKey: AGENT_PREFILL_QUERY_KEY,
    initialData: null,
  });

  const setPrefill = useCallback(
    (text: string, options?: { autoSend?: boolean }) => {
      setNewData({ text, autoSend: options?.autoSend ?? false });
    },
    [setNewData],
  );

  const clearPrefill = useCallback(() => {
    setNewData(null);
  }, [setNewData]);

  return { prefill: data ?? null, setPrefill, clearPrefill };
}
