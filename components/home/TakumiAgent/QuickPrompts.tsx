import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

import { AGENT_QUICK_PROMPTS } from "@/constants/agent";

export interface QuickPromptsProps {
  onSelectPrompt: (prompt: string) => void;
}

export default function QuickPrompts({ onSelectPrompt }: QuickPromptsProps) {
  return (
    <View className="py-5 bg-light-main-container">
      <Text className="text-lg font-semibold text-light-matte-black mx-4 mb-4">
        What can I help you with?
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 12, paddingRight: 16, paddingLeft: 16 }}
      >
        {AGENT_QUICK_PROMPTS.map((item) => (
          <TouchableOpacity
            key={item.id}
            className="min-w-[140px] border-2 border-light-primary-red max-w-[200px] px-3 py-3 rounded-full bg-light/10 justify-center items-center"
            onPress={() => onSelectPrompt(item.prompt)}
          >
            <Text
              className="text-sm font-bold text-light-primary-red text-center leading-tight"
              numberOfLines={2}
            >
              {item.prompt}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}
