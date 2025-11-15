import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useNavigation } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { BackHandler, Platform, StatusBar } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { english, generateMnemonic } from "viem/accounts";
import LoadinngSpinnerPopup from "@/components/common/LoadinngSpinnerPopup";
import {
  TSelectedWords,
  TSetupProgress,
  TWalletCreationParams,
  TWordOptions,
  WALLET_SETUP_PROGRESS_KEY,
} from "@/constants/types/walletTypes";
import { createWalletSteps } from "@/constants/walletSetup/walletCreationStepList";
import { useWallet } from "@/hooks/useWallet";
import WalletSetupSteps from "./WalletSetupSteps";

export default function WalletSetup() {
  const [currentStep, setCurrentStep] = useState(0);
  const [isTermsAccepted, setIsTermsAccepted] = useState(false);
  const [mnemonic, setMnemonic] = useState<string[]>([]);
  const [selectedWords, setSelectedWords] = useState<TSelectedWords>({});
  const [wordOptions, setWordOptions] = useState<TWordOptions>({});
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [isInitialized, setIsInitialized] = useState(false);
  const navigation = useNavigation();
  const { addWallet } = useWallet();

  const verificationIndices = [1, 3, 7, 11];

  const getWordOptions = useCallback(
    (mnemonicWords: string[], wordIndex: number) => {
      const correctWord = mnemonicWords[wordIndex];
      if (!correctWord) return [];

      const otherWords = mnemonicWords
        .filter((_, i) => i !== wordIndex)
        .sort(() => 0.5 - Math.random())
        .slice(0, 2);

      return [correctWord, ...otherWords].sort(() => 0.5 - Math.random());
    },
    [],
  );

  const generateWordOptions = useCallback(
    (mnemonicWords: string[]) => {
      const options: TWordOptions = {};
      verificationIndices.forEach((index) => {
        options[index] = getWordOptions(mnemonicWords, index);
      });
      setWordOptions(options);
    },
    [getWordOptions],
  );

  const handleSelectWord = useCallback((wordIndex: number, word: string) => {
    setSelectedWords((prev) => ({
      ...prev,
      [wordIndex]: word,
    }));
  }, []);

  const saveProgress = useCallback(async () => {
    if (!isInitialized || currentStep === 0) return;

    try {
      const progressData: TSetupProgress = {
        step: currentStep,
        mnemonic,
        selectedWords,
      };

      await AsyncStorage.setItem(
        WALLET_SETUP_PROGRESS_KEY,
        JSON.stringify(progressData),
      );
    } catch (error) {
      console.error("Failed to save progress:", error);
    }
  }, [currentStep, mnemonic, selectedWords, isInitialized]);

  const clearProgress = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(WALLET_SETUP_PROGRESS_KEY);
      console.log("Wallet setup progress cleared successfully");
    } catch (error) {
      console.error("Failed to clear wallet setup progress:", error);
    }
  }, []);

  const createDelay = useCallback((ms: number, timeouts: number[]) => {
    return new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        resolve();
      }, ms);
      timeouts.push(timeout);
    });
  }, []);

  useEffect(() => {
    const loadProgress = async () => {
      try {
        const savedProgress = await AsyncStorage.getItem(
          WALLET_SETUP_PROGRESS_KEY,
        );

        if (savedProgress) {
          const progress: TSetupProgress = JSON.parse(savedProgress);

          setCurrentStep(progress.step);
          setMnemonic(progress.mnemonic);

          if (progress.step === 3) {
            setSelectedWords({});
            console.log(
              "Verification Required: For security reasons, you'll need to verify your seed phrase again.",
            );
          } else {
            setSelectedWords(progress.selectedWords || {});
          }

          generateWordOptions(progress.mnemonic);

          console.log(
            "Setup Resumed: Your previous wallet setup has been restored.",
          );
        } else {
          const generatedMnemonic = generateMnemonic(english).split(" ");
          setMnemonic(generatedMnemonic);
          generateWordOptions(generatedMnemonic);
        }

        setIsInitialized(true);
      } catch (error) {
        console.error("Failed to load progress:", error);

        const generatedMnemonic = generateMnemonic(english).split(" ");
        setMnemonic(generatedMnemonic);
        generateWordOptions(generatedMnemonic);

        setIsInitialized(true);
      }
    };

    loadProgress();
  }, [generateWordOptions]);

  useEffect(() => {
    saveProgress();
  }, [saveProgress]);

  useEffect(() => {
    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      () => isLoading,
    );

    if (isLoading) {
      navigation.setOptions({ gestureEnabled: false });
    } else {
      navigation.setOptions({ gestureEnabled: true });
    }

    return () => {
      backHandler.remove();
    };
  }, [isLoading, navigation]);

  const finalizeWalletSetup = useCallback(async () => {
    setIsLoading(true);
    setLoadingMessage("Building your secure digital vault...");

    const mnemonicString = mnemonic.join(" ");
    const timeouts: number[] = [];

    try {
      const delay = (ms: number) => createDelay(ms, timeouts);

      await delay(2500);
      setLoadingMessage("Securing your recovery phrase with encryption...");

      await delay(2500);
      setLoadingMessage("Almost there! Finalizing your wallet setup...");

      await delay(2000);

      const walletParams: TWalletCreationParams = {
        source: "SeedPhrase",
        seedPhrase: mnemonicString,
        name: "My Wallet",
      };

      const success = await addWallet(walletParams);

      if (success) {
        setLoadingMessage(
          "Success! Your wallet is ready. Redirecting to home...",
        );
        await delay(2000);

        timeouts.forEach(clearTimeout);
        await clearProgress();

        setIsLoading(false);
        router.replace("/");
      } else {
        timeouts.forEach(clearTimeout);
        setIsLoading(false);
        console.error("Error: Failed to create wallet");
      }
    } catch (error) {
      timeouts.forEach(clearTimeout);
      console.error("Wallet creation error:", error);
      setIsLoading(false);
      console.error(
        "Error: An unexpected error occurred while creating the wallet",
      );
    }
  }, [mnemonic, addWallet, clearProgress, createDelay]);

  const handleBackPress = useCallback(() => {
    if (isLoading) return;

    if (currentStep === 0) {
      console.log(
        "Exit Setup?: Are you sure you want to exit wallet setup? Your progress will be lost.",
      );
      router.back();
    } else {
      setCurrentStep(currentStep - 1);
    }
  }, [currentStep, isLoading]);

  const steps = createWalletSteps(
    mnemonic,
    setCurrentStep,
    isTermsAccepted,
    setIsTermsAccepted,
    verificationIndices,
    wordOptions,
    selectedWords,
    handleSelectWord,
  );

  if (steps.length > 0) {
    const lastStepIndex = steps.length - 1;
    const lastStep = steps[lastStepIndex];
    steps[lastStepIndex] = {
      ...lastStep,
      onButtonPress: finalizeWalletSetup,
    };
  }

  const { bottom } = useSafeAreaInsets();
  const bottomOffset = Platform.OS === "ios" ? 0 : bottom > 0 ? bottom : 0;
  return (
    <>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView
        className="flex-1 bg-light-main-container"
        edges={["top"]}
        style={{ paddingBottom: bottomOffset }}
      >
        <WalletSetupSteps
          currentStep={currentStep}
          steps={steps}
          onBackPress={handleBackPress}
          disableBackButton={isLoading}
        />
        <LoadinngSpinnerPopup
          visible={isLoading}
          title="Setting Up Your Wallet"
          message={loadingMessage}
        />
      </SafeAreaView>
    </>
  );
}
