import { UIMessage } from "ai";

export interface ToolCallInfo {
  toolCallId: string;
  toolName: string;
  input?: any;
  output?: any;
  isError?: boolean;
}

function isToolCallPart(part: any): part is {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  args: any;
} {
  return part.type === "tool-call" && "toolName" in part && "args" in part;
}

function isToolResultPart(part: any): part is {
  type: "tool-result";
  toolCallId: string;
  toolName?: string;
  result: any;
  isError?: boolean;
} {
  return part.type === "tool-result" && "result" in part;
}

export const extractToolCalls = (message: UIMessage): ToolCallInfo[] => {
  if (!message.parts || !Array.isArray(message.parts)) {
    return [];
  }

  const partTypes = message.parts.map((p) => p.type).join(", ");
  if (partTypes.includes("tool")) {
    console.log("📋 Message parts found:", partTypes);
    console.log("📋 Full parts:", JSON.stringify(message.parts, null, 2));
  }

  const toolCalls: ToolCallInfo[] = [];
  const toolCallMap = new Map<string, ToolCallInfo>();

  for (const part of message.parts) {
    if (isToolCallPart(part)) {
      console.log("✓ Found tool-call part:", part.toolName);
      const toolCall: ToolCallInfo = {
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        input: part.args,
      };
      toolCallMap.set(part.toolCallId, toolCall);
      toolCalls.push(toolCall);
    } else if (isToolResultPart(part)) {
      console.log("✓ Found tool-result part");
      const existing = toolCallMap.get(part.toolCallId);
      if (existing) {
        existing.output = part.result;
        existing.isError = part.isError;
      } else {
        toolCalls.push({
          toolCallId: part.toolCallId,
          toolName: part.toolName || "Unknown Tool",
          output: part.result,
          isError: part.isError,
        });
      }
    }
  }

  if (toolCalls.length > 0) {
    console.log(`✅ Extracted ${toolCalls.length} tool call(s) for display`);
  }

  return toolCalls;
};
