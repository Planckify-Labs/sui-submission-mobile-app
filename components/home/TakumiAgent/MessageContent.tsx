import { UIMessage } from "ai";
import React from "react";
import { View } from "react-native";
import { extractTextContent } from "./extractTextContent";
import { extractToolCalls } from "./extractToolCalls";
import MarkdownMessage from "./MarkdownMessage";
import PlainTextMessage from "./PlainTextMessage";
import ToolCallDisplay from "./ToolCallDisplay";

interface MessageContentProps {
  message: UIMessage;
  isUser: boolean;
}

const MessageContent: React.FC<MessageContentProps> = React.memo(
  ({ message, isUser }) => {
    const textContent = extractTextContent(message);
    const toolCalls = extractToolCalls(message);

    if (isUser) {
      return <PlainTextMessage content={textContent} />;
    }

    return (
      <View>
        {/* Show tool calls if any */}
        {toolCalls.length > 0 && (
          <View className="mb-2">
            {toolCalls.map((toolCall) => (
              <ToolCallDisplay
                key={toolCall.toolCallId}
                toolName={toolCall.toolName}
                toolCallId={toolCall.toolCallId}
                input={toolCall.input}
                output={toolCall.output}
                isError={toolCall.isError}
              />
            ))}
          </View>
        )}

        {/* Show text content */}
        {textContent && <MarkdownMessage content={textContent} />}
      </View>
    );
  },
);

MessageContent.displayName = "MessageContent";

export default MessageContent;
