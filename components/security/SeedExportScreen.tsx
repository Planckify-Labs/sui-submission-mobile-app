import * as Clipboard from "expo-clipboard";
import React, { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { useScreenshotGuard } from "@/services/security/screenshotGuard";

interface SeedExportScreenProps {
  words: string[];
  onClose: () => void;
}

export function SeedExportScreen({ words, onClose }: SeedExportScreenProps) {
  useScreenshotGuard(true, { alertOnScreenshot: true });

  const [currentIndex, setCurrentIndex] = useState(0);

  const groupSize = 3;
  const totalGroups = Math.ceil(words.length / groupSize);
  const currentGroup = Math.floor(currentIndex / groupSize);
  const groupWords = words.slice(
    currentGroup * groupSize,
    (currentGroup + 1) * groupSize,
  );

  const handleCopyAll = async () => {
    await Clipboard.setStringAsync(words.join(" "));
    Alert.alert(
      "Copied",
      "Seed phrase copied to clipboard. It will be cleared in 60 seconds.",
    );
    // Auto-clear clipboard after 60s
    setTimeout(async () => {
      await Clipboard.setStringAsync("");
    }, 60_000);
  };

  return (
    <View className="flex-1 bg-white dark:bg-gray-900 px-6 py-8">
      <Text className="text-xl font-bold text-gray-900 dark:text-white text-center mb-2">
        Your Recovery Phrase
      </Text>
      <Text className="text-sm text-gray-500 dark:text-gray-400 text-center mb-8">
        Write down these words in order. Never share them with anyone.
      </Text>

      {/* Word display */}
      <View className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-6 mb-6">
        {groupWords.map((word, i) => {
          const wordIndex = currentGroup * groupSize + i + 1;
          return (
            <View
              key={wordIndex}
              className="flex-row items-center py-3 border-b border-gray-200 dark:border-gray-700 last:border-b-0"
            >
              <Text className="text-sm text-gray-400 dark:text-gray-500 w-8">
                {wordIndex}.
              </Text>
              <Text className="text-lg font-mono font-semibold text-gray-900 dark:text-white">
                {word}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Progress */}
      <Text className="text-center text-sm text-gray-500 dark:text-gray-400 mb-6">
        Group {currentGroup + 1} of {totalGroups}
      </Text>

      {/* Navigation */}
      <View className="flex-row justify-between mb-6">
        <Pressable
          onPress={() =>
            setCurrentIndex(Math.max(0, (currentGroup - 1) * groupSize))
          }
          disabled={currentGroup === 0}
          className={`px-6 py-3 rounded-xl ${
            currentGroup > 0 ? "bg-gray-200 dark:bg-gray-700" : "opacity-30"
          }`}
        >
          <Text className="text-gray-900 dark:text-white font-medium">
            Previous
          </Text>
        </Pressable>

        {currentGroup < totalGroups - 1 ? (
          <Pressable
            onPress={() => setCurrentIndex((currentGroup + 1) * groupSize)}
            className="bg-blue-600 px-6 py-3 rounded-xl"
          >
            <Text className="text-white font-medium">Next</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={onClose}
            className="bg-green-600 px-6 py-3 rounded-xl"
          >
            <Text className="text-white font-medium">Done</Text>
          </Pressable>
        )}
      </View>

      {/* Copy all */}
      <Pressable onPress={handleCopyAll} className="py-3 items-center">
        <Text className="text-blue-600 dark:text-blue-400 font-medium">
          Copy All (auto-clears in 60s)
        </Text>
      </Pressable>
    </View>
  );
}
