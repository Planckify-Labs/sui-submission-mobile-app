import type React from "react";
import type { AgentMessagePart } from "@/services/agent-messages/types";

export type ToolComponentProps<Input, Output> = {
  state: Extract<AgentMessagePart, { type: "tool" }>["state"];
  input: Input;
  output?: Output;
  error?: string;
  mode: "live" | "historical";
  addToolResult?: (output: Output) => void;
  // Inline shortcut: a card can send a fresh user message to the
  // agent (e.g. OpportunityListCard's "Let Takumi pick for you"
  // footer). Undefined in historical mode so frozen cards stay inert.
  onUserPrompt?: (prompt: string) => void;
};

export type ToolComponent<Input, Output> = React.ComponentType<
  ToolComponentProps<Input, Output>
>;
