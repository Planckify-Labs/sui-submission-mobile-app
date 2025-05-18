import { type TWallet, mockWallets } from "@/constants/walletData";
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useState } from "react";
import { Alert } from "react-native";

export function useWallet() {
  const [wallets, setWallets] = useState<TWallet[]>([]);
  const [activeWalletIndex, setActiveWalletIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const activeWallet = wallets[activeWalletIndex] || ({} as TWallet);

  const loadWallets = useCallback(async () => {
    try {
      setIsLoading(true);
      const walletsData = await SecureStore.getItemAsync("user_wallets");
      if (walletsData) {
        setWallets(JSON.parse(walletsData));
      } else {
        setWallets(mockWallets);
      }
    } catch (error) {
      console.error("Failed to load wallets:", error);
      Alert.alert("Error", "Failed to load wallet information");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const saveWallets = useCallback(async (updatedWallets: TWallet[]) => {
    try {
      await SecureStore.setItemAsync(
        "user_wallets",
        JSON.stringify(updatedWallets),
      );
      setWallets(updatedWallets);
      return true;
    } catch (error) {
      console.error("Failed to save wallets:", error);
      Alert.alert("Error", "Failed to save wallet information");
      return false;
    }
  }, []);

  const addWallet = useCallback(
    async (wallet: TWallet) => {
      const updatedWallets = [...wallets, wallet];
      const success = await saveWallets(updatedWallets);
      if (success) {
        setActiveWalletIndex(updatedWallets.length - 1); // Set new wallet as active
      }
      return success;
    },
    [wallets, saveWallets],
  );

  const updateWallet = useCallback(
    async (index: number, updatedWallet: TWallet) => {
      if (index < 0 || index >= wallets.length) return false;

      const updatedWallets = [...wallets];
      updatedWallets[index] = updatedWallet;
      return await saveWallets(updatedWallets);
    },
    [wallets, saveWallets],
  );

  // Remove a wallet
  const removeWallet = useCallback(
    async (index: number) => {
      if (index < 0 || index >= wallets.length) return false;

      const updatedWallets = wallets.filter((_, i) => i !== index);
      const success = await saveWallets(updatedWallets);

      // Adjust active wallet index if needed
      if (success && activeWalletIndex >= updatedWallets.length) {
        setActiveWalletIndex(Math.max(0, updatedWallets.length - 1));
      }

      return success;
    },
    [wallets, activeWalletIndex, saveWallets],
  );

  // Change active wallet
  const setActiveWallet = useCallback(
    (index: number) => {
      if (index >= 0 && index < wallets.length) {
        setActiveWalletIndex(index);
        return true;
      }
      return false;
    },
    [wallets],
  );

  // Load wallets on mount
  useEffect(() => {
    loadWallets();
  }, [loadWallets]);

  return {
    wallets,
    activeWallet,
    activeWalletIndex,
    isLoading,
    loadWallets,
    addWallet,
    updateWallet,
    removeWallet,
    setActiveWallet,
  };
}
