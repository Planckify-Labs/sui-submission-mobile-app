import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useState } from "react";

const PIN_KEY = "takumipay_user_pin";

interface UsePinReturn {
  hasPin: boolean;
  isLoading: boolean;
  verifyPin: (pin: string) => Promise<boolean>;
  setPin: (pin: string) => Promise<void>;
  resetPin: () => Promise<void>;
}

export function usePin(): UsePinReturn {
  const [hasPin, setHasPin] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const checkForExistingPin = useCallback(async () => {
    try {
      setIsLoading(true);
      const storedPin = await SecureStore.getItemAsync(PIN_KEY);
      setHasPin(!!storedPin);
    } catch (error) {
      console.error("Error checking for PIN:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkForExistingPin();
  }, [checkForExistingPin]);

  const verifyPin = async (pin: string): Promise<boolean> => {
    try {
      const storedPin = await SecureStore.getItemAsync(PIN_KEY);
      return storedPin === pin;
    } catch (error) {
      console.error("Error verifying PIN:", error);
      return false;
    }
  };

  const setPin = async (pin: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(PIN_KEY, pin);
      setHasPin(true);
    } catch (error) {
      console.error("Error setting PIN:", error);
      throw new Error("Failed to save PIN");
    }
  };

  const resetPin = async (): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(PIN_KEY);
      setHasPin(false);
    } catch (error) {
      console.error("Error resetting PIN:", error);
      throw new Error("Failed to reset PIN");
    }
  };

  return {
    hasPin,
    isLoading,
    verifyPin,
    setPin,
    resetPin,
  };
}
