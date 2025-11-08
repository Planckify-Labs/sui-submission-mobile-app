import { useChat } from "@ai-sdk/react";
import { FlashList, ListRenderItemInfo } from "@shopify/flash-list";
import { DefaultChatTransport } from "ai";
import { fetch as expoFetch } from "expo/fetch";
import { BlurView } from "expo-blur";
import { SquarePen } from "lucide-react-native";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Dimensions,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import { generateAPIUrl } from "@/utils/helperUtils";
import ChatInput from "./ChatInput";
import ConversationHistory from "./ConversationHistory";
import QuickPrompts from "./QuickPrompts";

const { width: screenWidth } = Dimensions.get("window");

export default function AgentMode() {
  const scrollViewRef = useRef<ScrollView>(null);
  const [input, setInput] = useState("");
  const lastSendTimeRef = useRef<number>(0);

  const { messages, error, sendMessage, status, clearError } = useChat({
    transport: new DefaultChatTransport({
      fetch: expoFetch as unknown as typeof globalThis.fetch,
      api: generateAPIUrl("/api/chat"),
    }),
    onError: (chatError) => {
      console.error(chatError, "Takumi agent chat error");
    },
  });

  type ChatMessage = (typeof messages)[number];

  const chatListRef = useRef<any>(null);

  useEffect(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({ x: screenWidth, animated: false });
    }, 0);
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      chatListRef.current?.scrollToEnd({ animated: true });
    }, 50);

    return () => clearTimeout(timeout);
  }, [messages.length]);

  const handleScrollToChat = useCallback(() => {
    scrollViewRef.current?.scrollTo({ x: screenWidth, animated: true });
  }, []);

  const handleScrollToHistory = useCallback(() => {
    scrollViewRef.current?.scrollTo({ x: 0, animated: true });
  }, []);

  const handleInputChange = useCallback(
    (text: string) => {
      if (error) {
        clearError();
      }
      setInput(text);
    },
    [clearError, error],
  );

  const sendTextMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      // Prevent rapid-fire requests (minimum 1 second between messages)
      const now = Date.now();
      const timeSinceLastSend = now - lastSendTimeRef.current;
      if (timeSinceLastSend < 1000) {
        console.log("Please wait before sending another message");
        return;
      }

      lastSendTimeRef.current = now;

      try {
        await sendMessage({ text: trimmed });
      } catch (sendError) {
        console.error(sendError, "Failed to send chat message");
        throw sendError;
      }
    },
    [sendMessage],
  );

  const handleSend = useCallback(async () => {
    const pending = input.trim();
    if (!pending) return;

    await sendTextMessage(pending);
    setInput("");
  }, [input, sendTextMessage]);

  const handlePromptSelect = useCallback(
    async (prompt: string) => {
      await sendTextMessage(prompt);
    },
    [sendTextMessage],
  );

  const chatMessages = useMemo(
    () => messages.filter((message) => message.role !== "system"),
    [messages],
  );

  const chatContentContainerStyle = useMemo(
    () => ({
      paddingBottom: 24,
      flexGrow: 1,
      justifyContent: chatMessages.length === 0 ? "center" : "flex-start",
    }),
    [chatMessages.length],
  );

  const renderChatMessage = useCallback(
    ({ item }: ListRenderItemInfo<ChatMessage>) => {
      const isUser = item.role === "user";
      const textContent = item.parts
        .map((part) => {
          switch (part.type) {
            case "text":
            case "reasoning":
              return part.text;
            default:
              return undefined;
          }
        })
        .filter(Boolean)
        .join("\n\n");

      const hasContent = Boolean(textContent.trim().length);

      return (
        <View className={`w-full mb-4 ${isUser ? "items-end" : "items-start"}`}>
          <Text
            className={`text-[10px] font-semibold mb-1 ${
              isUser ? "text-light-primary-red/80" : "text-light-matte-black/60"
            }`}
          >
            {isUser ? "You" : "Takumi Agent"}
          </Text>
          <View
            className={`max-w-[85%] rounded-3xl px-4 py-3 ${
              isUser
                ? "bg-light-primary-red"
                : "bg-white border border-light-primary-red/10"
            }`}
          >
            <Text
              className={`text-sm leading-5 ${
                isUser ? "text-white" : "text-light-matte-black"
              }`}
            >
              {hasContent
                ? textContent
                : "This message includes content we can't display yet."}
            </Text>
          </View>
        </View>
      );
    },
    [],
  );

  const isLoading = status === "streaming" || status === "submitted";

  const listFooterComponent = useMemo(() => {
    if (!isLoading && !error) {
      return null;
    }

    return (
      <View className="gap-2">
        {isLoading && (
          <View className="self-start mt-2 bg-white/80 border border-light-primary-red/10 rounded-3xl px-4 py-2 flex-row items-center gap-2">
            <ActivityIndicator size="small" color="#c71c4b" />
            <Text className="text-xs text-light-matte-black">
              Takumi is thinking...
            </Text>
          </View>
        )}

        {error && (
          <View className="mt-2 bg-light-primary-red/10 border border-light-primary-red/40 rounded-3xl px-4 py-3">
            <Text className="text-xs text-light-primary-red font-semibold mb-1">
              {error.message.includes("overloaded") ||
              error.message.includes("Overloaded")
                ? "Service is busy right now"
                : "Something went wrong"}
            </Text>
            <Text className="text-xs text-light-matte-black/70">
              {error.message.includes("overloaded") ||
              error.message.includes("Overloaded")
                ? "The AI service is experiencing high demand. Please wait a moment and try again."
                : "Please try sending your message again."}
            </Text>
          </View>
        )}
      </View>
    );
  }, [error, isLoading]);

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
        <ConversationHistory onScrollToChat={handleScrollToChat} />
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

        <View className="flex-1 pt-6">
          <View className="flex-1 px-4">
            <FlashList
              ref={chatListRef}
              data={chatMessages}
              renderItem={renderChatMessage}
              keyExtractor={(item) => item.id}
              contentContainerStyle={chatContentContainerStyle as ViewStyle}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View className="items-center px-4">
                  <Text className="text-sm text-light-matte-black/70 text-center mt-3">
                    Welcome to Takumi Agent!
                  </Text>
                </View>
              }
              ListFooterComponent={listFooterComponent}
            />
          </View>

          {chatMessages.length === 0 && (
            <QuickPrompts onSelectPrompt={handlePromptSelect} />
          )}

          <ChatInput
            value={input}
            onChangeText={handleInputChange}
            onSend={handleSend}
            isLoading={isLoading}
            placeholder="Ask me anything..."
          />
        </View>
      </View>
    </ScrollView>
  );
}
