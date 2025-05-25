import SeedPhraseGrid from "@/components/common/SeedPhraseGrid";
import { useWallet } from "@/hooks/useWallet";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { ArrowLeft, Clipboard as ClipboardIcon } from "lucide-react-native";
import React, { useRef, useState } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ImportWalletScreen() {
  const [seedPhraseArray, setSeedPhraseArray] = useState<string[]>(
    Array(12).fill(""),
  );
  const [currentWordIndex, setCurrentWordIndex] = useState<number | null>(null);
  const [currentWord, setCurrentWord] = useState<string>("");
  const scrollViewRef = useRef<ScrollView>(null);

  const { addWallet } = useWallet();

  const handleWordChange = (index: number, word: string) => {
    const newArray = [...seedPhraseArray];
    newArray[index] = word;
    setSeedPhraseArray(newArray);
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      const words = text.trim().split(/\s+/);

      if (words.length !== 12 && words.length !== 24) {
        Alert.alert(
          "Invalid Seed Phrase",
          "Please paste a valid 12 or 24-word seed phrase",
        );
        return;
      }

      setSeedPhraseArray(words);
    } catch (error) {
      console.log(error);
      Alert.alert("Error", "Failed to paste from clipboard");
    }
  };

  const handleImport = () => {
    const seedPhrase = seedPhraseArray.join(" ").trim();
    const words = seedPhrase.split(/\s+/);

    if (words.length !== 12 && words.length !== 24) {
      Alert.alert(
        "Invalid Seed Phrase",
        "Please enter a valid 12 or 24-word seed phrase",
      );
      return;
    }

    addWallet({
      source: "SeedPhrase",
      seedPhrase: seedPhrase,
      name: "My Wallet",
    }).then((success) => {
      if (success) {
        Alert.alert("Success", "Wallet imported successfully", [
          { text: "OK", onPress: () => router.replace("/") },
        ]);
      } else {
        Alert.alert("Error", "Failed to import wallet");
      }
    });
  };

  const scrollToInput = (index: number) => {
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({
        y: 300 + index * 20,
        animated: true,
      });
    }, 300);
  };

  return (
    <>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView className="flex-1 bg-light-main-container" edges={["top"]}>
        <View className="flex-1">
          <ScrollView
            ref={scrollViewRef}
            className="flex-1 p-6"
            contentContainerStyle={{ paddingBottom: 20 }}
            keyboardShouldPersistTaps="always"
            keyboardDismissMode="interactive"
          >
            <Pressable
              onPress={() => {
                Keyboard.dismiss();
                router.back();
              }}
              className="mb-6"
            >
              <ArrowLeft color="#c71c4b" size={24} />
            </Pressable>

            <Text className="text-light-matte-black text-3xl font-bold mb-6">
              Import Wallet
            </Text>

            <View className="bg-light rounded-xl p-5 mb-6">
              <View className="flex-row justify-between items-center mb-4">
                <Text className="text-light-matte-black font-medium">
                  Enter your seed phrase
                </Text>
                <Pressable
                  className="flex-row items-center bg-light-primary-red/10 px-3 py-2 rounded-lg"
                  onPress={handlePasteFromClipboard}
                >
                  <ClipboardIcon size={16} color="#c71c4b" className="mr-2" />
                  <Text className="text-light-primary-red font-medium">
                    Paste
                  </Text>
                </Pressable>
              </View>

              <SeedPhraseGrid
                mnemonic={seedPhraseArray}
                showCopyButton={false}
                editable={true}
                onWordPress={(index: number) => {
                  setCurrentWordIndex(index);
                  setCurrentWord(seedPhraseArray[index]);
                  scrollToInput(index);
                }}
              />

              {currentWordIndex !== null && (
                <KeyboardAvoidingView behavior="position">
                  <View className="bg-light-main-container p-4 rounded-xl mb-4">
                    <Text className="text-light-matte-black mb-2">
                      Word #{currentWordIndex + 1}
                    </Text>
                    <TextInput
                      className="bg-light p-3 rounded-lg text-light-matte-black border border-light-matte-black/10"
                      value={currentWord}
                      onChangeText={setCurrentWord}
                      autoFocus
                      returnKeyType="done"
                      onSubmitEditing={() => {
                        if (currentWord.trim()) {
                          handleWordChange(
                            currentWordIndex,
                            currentWord.trim(),
                          );
                          setCurrentWordIndex(null);
                          setCurrentWord("");
                          Keyboard.dismiss();
                        }
                      }}
                    />
                    <View className="flex-row justify-end mt-2">
                      <Pressable
                        className="bg-light-primary-red px-4 py-2 rounded-lg"
                        onPress={() => {
                          if (currentWord.trim()) {
                            handleWordChange(
                              currentWordIndex,
                              currentWord.trim(),
                            );
                            setCurrentWordIndex(null);
                            setCurrentWord("");
                            Keyboard.dismiss();
                          }
                        }}
                      >
                        <Text className="text-light font-medium">Save</Text>
                      </Pressable>
                    </View>
                  </View>
                </KeyboardAvoidingView>
              )}
            </View>
            <View className="pb-2 bg-light-main-container">
              <Pressable
                className="bg-light-primary-red py-4 rounded-full items-center"
                onPress={handleImport}
              >
                <Text className="text-light font-bold text-lg">
                  Import Wallet
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </SafeAreaView>
    </>
  );
}
