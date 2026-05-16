export type AgentMessagePart =
  | { type: "text"; text: string }
  | {
      type: "tool";
      toolName: string;
      toolCallId: string;
      input: unknown;
      output?: unknown;
      state:
        | "input-streaming"
        | "input-available"
        | "output-available"
        | "output-error";
      error?: string;
    };

export type AgentMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  parts: AgentMessagePart[];
  createdAt: string;
  /**
   * Optional id of the specialist agent that authored this assistant
   * message (e.g. "defi"). Set only on `core_handoff conversational:
   * true` (spec §6.4). Drives the "via {displayName}" badge in
   * `MessageContent.tsx` — omitted means render with the default Core
   * voice (no badge).
   *
   * Additive — pre-existing MMKV-cached conversations open without
   * migration.
   */
  originAgentId?: string;
};

type _AssertRoleNarrowed = AgentMessage["role"] extends
  | "user"
  | "assistant"
  | "system"
  ? true
  : false;
type _AssertStateNarrowed = Extract<
  AgentMessagePart,
  { type: "tool" }
>["state"] extends
  | "input-streaming"
  | "input-available"
  | "output-available"
  | "output-error"
  ? true
  : false;

const _roleCheck: _AssertRoleNarrowed = true;
const _stateCheck: _AssertStateNarrowed = true;
void _roleCheck;
void _stateCheck;
