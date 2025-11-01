import { BlurView } from "expo-blur";
import { MenuIcon, SquarePen } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Dimensions,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { DUMMY_CHAT_SESSIONS } from "@/constants/dummyData/conversationHistory";
import ChatInput from "./ChatInput";
import { ChatMessageProps } from "./ChatMessage";
import ConversationBubbles from "./ConversationBubbles";
import ConversationHistory from "./ConversationHistory";

const { width: screenWidth } = Dimensions.get("window");

export default function AgentMode() {
  const [messages, setMessages] = useState<ChatMessageProps[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [chatSessions, setChatSessions] =
    useState<
      Array<{ id: string; title: string; messages: ChatMessageProps[] }>
    >(DUMMY_CHAT_SESSIONS);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  // Scroll to main chat view on mount
  useEffect(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({ x: screenWidth, animated: false });
    }, 0);
  }, []);

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

  const handleNewChat = useCallback(() => {
    // Save current chat to sessions if it has messages
    if (messages.length > 0) {
      const sessionTitle =
        messages[0]?.content?.substring(0, 30) + "..." || "New Chat";
      setChatSessions((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          title: sessionTitle,
          messages: messages,
        },
      ]);
    }

    // Reset for new chat
    setMessages([]);
    setCurrentSessionId(null);
  }, [messages]);

  const handleSelectSession = useCallback(
    (sessionId: string, sessionMessages: ChatMessageProps[]) => {
      // Save current chat if it has messages
      if (messages.length > 0 && currentSessionId === null) {
        const sessionTitle =
          messages[0]?.content?.substring(0, 30) + "..." || "New Chat";
        setChatSessions((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            title: sessionTitle,
            messages: messages,
          },
        ]);
      }

      // Load selected session
      setMessages(sessionMessages);
      setCurrentSessionId(sessionId);

      // Scroll back to main chat view
      scrollViewRef.current?.scrollTo({ x: screenWidth, animated: true });
    },
    [messages, currentSessionId],
  );

  const handleScrollToChat = useCallback(() => {
    scrollViewRef.current?.scrollTo({ x: screenWidth, animated: true });
  }, []);

  const handleScrollToHistory = useCallback(() => {
    scrollViewRef.current?.scrollTo({ x: 0, animated: true });
  }, []);

  return (
    <ScrollView
      ref={scrollViewRef}
      horizontal
      pagingEnabled
      scrollEventThrottle={16}
      showsHorizontalScrollIndicator={false}
      className="flex-1 bg-light-main-container"
    >
      <View style={{ width: screenWidth }}>
        <ConversationHistory
          sessions={chatSessions}
          onSelectSession={handleSelectSession}
          onNewChat={handleNewChat}
          onScrollToChat={handleScrollToChat}
        />
      </View>

      <View
        style={{ width: screenWidth }}
        className="flex-1 bg-light-main-container"
      >
        <View className="flex-row justify-between px-4">
          <BlurView
            intensity={20}
            experimentalBlurMethod="dimezisBlurView"
            className="overflow-hidden rounded-full"
          >
            <TouchableOpacity
              onPress={handleScrollToHistory}
              className="bg-light/60 p-4 aspect-square rounded-full gap-[4px] relative w-[38px]"
            >
              <View className="border border-light-primary-red w-[15px] absolute top-[15px] left-[12px]" />
              <View className="border border-light-primary-red w-[10px] absolute top-[21px] left-[12px]" />
            </TouchableOpacity>
          </BlurView>
          <BlurView
            intensity={20}
            experimentalBlurMethod="dimezisBlurView"
            className="overflow-hidden rounded-full"
          >
            <View className="bg-white/40 px-4 py-2 rounded-full">
              <Text className="font-semibold">Takumi Agent</Text>
            </View>
          </BlurView>
          <BlurView
            intensity={20}
            experimentalBlurMethod="dimezisBlurView"
            className="overflow-hidden rounded-full"
          >
            <TouchableOpacity className="bg-light/60 p-[10px] rounded-full">
              <SquarePen size={20} color="#c71c4b" />
            </TouchableOpacity>
          </BlurView>
        </View>
        <ConversationBubbles
          messages={messages}
          isLoading={isLoading}
          onSelectPrompt={handleSendMessage}
        />

        <ChatInput onSendMessage={handleSendMessage} isLoading={isLoading} />
      </View>
    </ScrollView>
  );
}
