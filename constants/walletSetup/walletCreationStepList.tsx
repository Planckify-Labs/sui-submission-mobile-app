import { router } from "expo-router";
import {
  ArrowLeftRight,
  Check,
  ChevronRight,
  Info,
  Shield,
  Wallet,
} from "lucide-react-native";
import React from "react";
import { Alert, Pressable, Text, View } from "react-native";
import SeedPhraseGrid from "@/components/common/SeedPhraseGrid";

export type WalletCreationStep = {
  title: string;
  content: React.ReactNode;
  buttonText: string;
  onButtonPress: () => void;
};

export const createWalletSteps = (
  mnemonic: string[],
  setCurrentStep: (step: number) => void,
  isChecked: boolean,
  setIsChecked: (checked: boolean) => void,
  verificationIndices: number[],
  wordOptions: { [key: number]: string[] },
  selectedWords: { [key: number]: string },
  handleSelectWord: (wordIndex: number, word: string) => void,
): WalletCreationStep[] => [
  {
    title: "Let's Set Up Your Wallet",
    content: (
      <>
        <View className="bg-light flex-1 rounded-xl p-4 mb-6 shadow-sm">
          <View className="flex-row items-center mb-4">
            <Shield color="#c71c4b" size={24} className="mr-2" />
            <Text className="text-light-matte-black font-medium">
              TakumiPay Setup
            </Text>
          </View>
          <Text className="text-light-matte-black mb-4">
            TakumiPay provides you with a self-custodial wallet — a private
            vault for your tokens and digital assets.
          </Text>

          <Text className="text-light-matte-black mb-4">
            No signup, no bank, no middlemen. Just you and your crypto.
          </Text>
        </View>

        <View className="bg-light rounded-xl p-4 shadow-sm">
          <Text className="text-light-matte-black">
            By the end of this short process, you'll have a secure wallet that
            gives you full control.
          </Text>
        </View>
      </>
    ),
    buttonText: "Get Started",
    onButtonPress: () => setCurrentStep(1),
  },
  {
    title: "What Is a Wallet, Really?",
    content: (
      <>
        <View className="bg-light rounded-xl p-4 mb-6 shadow-sm">
          <Text className="text-light-matte-black mb-4">
            A crypto wallet stores the private keys that control your assets.
            Think of it as your bank vault, but only you have the key.
          </Text>

          <Text className="text-light-matte-black font-medium mb-2">
            Your wallet lets you:
          </Text>

          <View className="mb-2">
            <View className="flex-row mb-2">
              <Text className="text-light-primary-red mr-2">•</Text>
              <Text className="text-light-matte-black">
                Receive and send tokens
              </Text>
            </View>

            <View className="flex-row mb-2">
              <Text className="text-light-primary-red mr-2">•</Text>
              <Text className="text-light-matte-black">
                Swap assets on TakumiPay
              </Text>
            </View>

            <View className="flex-row mb-2">
              <Text className="text-light-primary-red mr-2">•</Text>
              <Text className="text-light-matte-black">
                Purchase data package,Pulsa, electricity, and more
              </Text>
            </View>

            <View className="flex-row mb-2">
              <Text className="text-light-primary-red mr-2">•</Text>
              <Text className="text-light-matte-black">
                Participate in governance with $TKMY
              </Text>
            </View>
          </View>
        </View>

        <View className="bg-light rounded-xl p-4 shadow-sm">
          <Text className="text-light-matte-black mb-2">
            And most importantly: You own everything in it.
          </Text>

          <Text className="text-light-matte-black">
            No email. No username. Just a secret phrase only you will see.
          </Text>
        </View>
      </>
    ),
    buttonText: "Continue",
    onButtonPress: () => setCurrentStep(2),
  },
  {
    title: "Your Secret Recovery Phrase",
    content: (
      <>
        <Text className="bg-light rounded-xl p-5 mb-6 text-light-matte-black text-base font-medium">
          Your secret recovery phrase is the only way to recover your wallet if
          you lose your device. Without it, there's no way to access your funds.
        </Text>
        <SeedPhraseGrid mnemonic={mnemonic} />

        <View className="bg-light-primary-red/10 rounded-xl p-4 mb-6">
          <View className="flex-row items-start gap-2">
            <Info size={22} color="#c71c4b" className="mr-3 mt-0.5" />
            <Text className="text-light-matte-black flex-1 font-medium">
              Never share this phrase with anyone. TakumiPay will never ask
              for it.
            </Text>
          </View>
        </View>

        <Pressable
          className="flex-row items-center mb-6 p-2"
          onPress={() => setIsChecked(!isChecked)}
        >
          <View
            className={`w-8 h-8 aspect-square rounded-lg mr-3 ${isChecked ? "bg-light-primary-red" : "border-2 border-gray-400"} items-center justify-center`}
          >
            {isChecked && <Check size={18} color="white" strokeWidth={3} />}
          </View>
          <Text className="text-light-matte-black font-medium flex-1">
            I have written down my secret phrase in a secure location
          </Text>
        </Pressable>
      </>
    ),
    buttonText: "Continue",
    onButtonPress: () => {
      if (!isChecked) {
        Alert.alert(
          "Confirmation Required",
          "Please confirm you've saved your secret phrase somewhere safe",
          [
            {
              text: "Cancel",
              style: "cancel",
            },
          ],
        );
      } else {
        setCurrentStep(3);
      }
    },
  },
  {
    title: "Confirm Secret Phrase",
    content: (
      <>
        <View className="bg-light rounded-xl p-4 mb-6 shadow-sm">
          <Text className="text-light-matte-black mb-4">
            Please tap on the correct answer below.
          </Text>

          {verificationIndices.map((wordIndex, i) => (
            <VerificationRow
              key={i}
              wordIndex={wordIndex}
              options={wordOptions[wordIndex] || []}
              selectedWord={selectedWords[wordIndex]}
              onSelectWord={(word) => handleSelectWord(wordIndex, word)}
            />
          ))}
        </View>
      </>
    ),
    buttonText: "Confirm",
    onButtonPress: () => {
      const allCorrect = verificationIndices.every(
        (index) => selectedWords[index] === mnemonic[index],
      );

      if (!allCorrect) {
        Alert.alert(
          "Incorrect Words",
          "Please select the correct words from your secret phrase",
          [
            {
              text: "Cancel",
              style: "cancel",
            },
          ],
        );
      } else {
        setCurrentStep(4);
      }
    },
  },
  {
    title: "Wallet Created!",
    content: (
      <>
        <View className="items-center mb-6">
          <View className="rounded-3xl items-center justify-center mb-5">
            <Check size={142} color="#c71c4b" strokeWidth={3} />
          </View>

          <Text className="text-light-matte-black text-2xl font-bold mb-2">
            Your wallet is ready!
          </Text>
          <Text className="text-light-matte-black/80 text-center mb-6">
            You now have full control of your digital assets
          </Text>

          <View className="w-full bg-light rounded-xl overflow-hidden mb-6">
            <View className="bg-light-primary-red/10 p-4">
              <Text className="text-light-matte-black font-bold">
                Next Steps
              </Text>
            </View>

            <Pressable className="p-4 flex-row items-center">
              <View className="w-8 h-8 rounded-full bg-light-primary-red/10 items-center justify-center mr-3">
                <Wallet size={16} color="#c71c4b" />
              </View>
              <Text className="text-light-matte-black flex-1">
                Fund your wallet
              </Text>
              <ChevronRight size={16} color="#c71c4b" />
            </Pressable>

            <Pressable className="p-4 flex-row items-center">
              <View className="w-8 h-8 rounded-full bg-light-primary-red/10 items-center justify-center mr-3">
                <ArrowLeftRight size={16} color="#c71c4b" />
              </View>
              <Text className="text-light-matte-black flex-1">Swap tokens</Text>
              <ChevronRight size={16} color="#c71c4b" />
            </Pressable>
          </View>

          <View className="bg-light-primary-red/10 p-4 rounded-lg w-full">
            <View className="flex-row items-start gap-2">
              <Info size={18} color="#c71c4b" className="mr-2 mt-0.5" />
              <Text className="text-light-matte-black/80 text-sm flex-1">
                Remember to keep your recovery phrase safe. It's the only way to
                recover your wallet.
              </Text>
            </View>
          </View>
        </View>
      </>
    ),
    buttonText: "Start Using My Wallet",
    onButtonPress: () => router.push("/"),
  },
];

const VerificationRow = ({
  wordIndex,
  options,
  selectedWord,
  onSelectWord,
}: {
  wordIndex: number;
  options: string[];
  selectedWord: string | undefined;
  onSelectWord: (word: string) => void;
}) => {
  return (
    <View className="mb-6">
      <Text className="text-light-matte-black font-medium mb-2">
        Word #{wordIndex + 1}
      </Text>
      <View className="flex-row gap-2">
        {options.map((word, optionIndex) => (
          <WordOption
            key={optionIndex}
            word={word}
            isSelected={selectedWord === word}
            onSelect={() => onSelectWord(word)}
          />
        ))}
      </View>
    </View>
  );
};

const WordOption = ({
  word,
  isSelected,
  onSelect,
}: {
  word: string;
  isSelected: boolean;
  onSelect: () => void;
}) => {
  return (
    <Pressable
      className={`flex-1 py-3- px-2- p-4 rounded-xl bg-light-main-container items-center justify-center ${
        isSelected
          ? "border-2 border-light-primary-red"
          : "border-light- text-light-matte-black"
      }`}
      onPress={onSelect}
    >
      <Text
        className={`${
          isSelected
            ? "text-light-primary-red font-bold"
            : "text-light-matte-black"
        }`}
      >
        {word}
      </Text>
    </Pressable>
  );
};
