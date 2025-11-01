import React, { useEffect, useRef } from "react";
import { ActivityIndicator, FlatList, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";

import ChatMessage, { ChatMessageProps } from "./ChatMessage";
import QuickPrompts from "./QuickPrompts";

export interface ConversationBubbles {
  messages: ChatMessageProps[];
  isLoading?: boolean;
  emptyMessage?: string;
  onSelectPrompt?: (prompt: string) => void;
}

export default function ConversationBubbles({
  messages,
  isLoading = false,
  emptyMessage = "Start a conversation with the AI agent",
  onSelectPrompt,
}: ConversationBubbles) {
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  if (messages.length === 0 && !isLoading) {
    return (
      <KeyboardAwareScrollView
        className="flex-1 bg-light-main-container"
        contentContainerStyle={{ flexGrow: 1 }}
        enableOnAndroid
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-1 justify-center items-center px-6 py-10">
          <Text className="text-lg font-semibold text-light-matte-black text-center">
            {emptyMessage}
          </Text>
        </View>

        {onSelectPrompt && <QuickPrompts onSelectPrompt={onSelectPrompt} />}
      </KeyboardAwareScrollView>
    );
  }

  return (
    <KeyboardAwareScrollView
      className="flex-1 bg-light-main-container"
      contentContainerStyle={{ flexGrow: 1 }}
      enableOnAndroid
      keyboardShouldPersistTaps="handled"
    >
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ChatMessage {...item} />}
        scrollEnabled={false}
        contentContainerStyle={{ paddingVertical: 12 }}
      />

      {isLoading && (
        <View className="py-5 items-center gap-3">
          <ActivityIndicator size="large" color="#c71c4b" />
          <Text className="text-sm text-gray-500 italic">
            Agent is thinking...
          </Text>
        </View>
      )}
    </KeyboardAwareScrollView>
  );
}
