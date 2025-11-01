import React, { useCallback, useState } from "react";
import { View } from "react-native";

import ChatHistory from "./ChatHistory";
import ChatInput from "./ChatInput";
import { ChatMessageProps } from "./ChatMessage";

export default function AgentMode() {
  const [messages, setMessages] = useState<ChatMessageProps[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSendMessage = useCallback(async (message: string) => {
    const userMessage: ChatMessageProps = {
      id: Date.now().toString(),
      role: "user",
      content: message,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    // TODO: Call Claude API with Vercel AI SDK
    // For now, simulate a response
    setTimeout(() => {
      const agentMessage: ChatMessageProps = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content:
          "I understood you want to transfer 20 USDT to Andre. Let me help you with that!",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, agentMessage]);
      setIsLoading(false);
    }, 1500);
  }, []);

  return (
    <View className="flex-1 bg-light-main-container">
      <ChatHistory
        messages={messages}
        isLoading={isLoading}
        onSelectPrompt={handleSendMessage}
      />

      <ChatInput onSendMessage={handleSendMessage} isLoading={isLoading} />
    </View>
  );
}
