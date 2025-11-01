import { format } from "date-fns";
import React from "react";
import { Text, View } from "react-native";

export interface ChatMessageProps {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp?: Date;
  isLoading?: boolean;
}

export default function ChatMessage({
  role,
  content,
  timestamp,
  isLoading,
}: ChatMessageProps) {
  const isUser = role === "user";

  return (
    <View
      className={`my-2 mx-3 flex-col ${isUser ? "items-end" : "items-start"}`}
    >
      <View
        className={`max-w-[80%] px-3 py-2.5 rounded-2xl ${
          isUser
            ? "bg-light-primary-red rounded-br-none"
            : "bg-light rounded-bl-none"
        }`}
        style={{
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.5,
          shadowRadius: 10,
          elevation: 0.1,
        }}
      >
        {isLoading ? (
          <View className="flex-row gap-1">
            <Text className="text-base font-bold text-light-primary-red">
              ●
            </Text>
            <Text className="text-base font-bold text-light-primary-red">
              ●
            </Text>
            <Text className="text-base font-bold text-light-primary-red">
              ●
            </Text>
          </View>
        ) : (
          <Text
            className={`text-base leading-relaxed ${
              isUser ? "text-white font-medium" : "text-light-matte-black"
            }`}
          >
            {content}
          </Text>
        )}
      </View>

      {timestamp && (
        <Text className="text-xs text-gray-500 mt-1 mx-1">
          {format(timestamp, "HH:mm")}
        </Text>
      )}
    </View>
  );
}
