import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef } from "react";
import useRQGlobalState from "./useRQGlobalState";

const PINNED_NETWORKS_KEY = "takumipay_pinned_networks";
const QUERY_KEY = ["pinnedNetworks"];

export type PinnedNetwork = {
  id: string;
  name: string;
  symbol: string;
  color: string;
  blockchainId?: string;
  logoUrl?: string;
  timestamp: number;
};

const loadFromStorage = async (): Promise<PinnedNetwork[]> => {
  try {
    const stored = await AsyncStorage.getItem(PINNED_NETWORKS_KEY);
    if (stored) {
      return JSON.parse(stored) as PinnedNetwork[];
    }
  } catch (error) {
    console.error("Failed to load pinned networks:", error);
  }
  return [];
};

const saveToStorage = async (networks: PinnedNetwork[]) => {
  try {
    await AsyncStorage.setItem(PINNED_NETWORKS_KEY, JSON.stringify(networks));
  } catch (error) {
    console.error("Failed to save pinned networks:", error);
  }
};

let isStorageInitialized = false;

export const usePinnedNetworks = () => {
  const { data: pinnedNetworks, setNewData } = useRQGlobalState<
    PinnedNetwork[]
  >({
    queryKey: QUERY_KEY,
    initialData: [],
  });

  const hasInitialized = useRef(false);

  useEffect(() => {
    if (hasInitialized.current || isStorageInitialized) return;
    hasInitialized.current = true;
    isStorageInitialized = true;

    loadFromStorage().then((stored) => {
      if (stored.length > 0) {
        setNewData(stored);
      }
    });
  }, [setNewData]);

  const isPinned = useCallback(
    (networkId: string): boolean => {
      return (
        pinnedNetworks?.some((network) => network.id === networkId) ?? false
      );
    },
    [pinnedNetworks],
  );

  const togglePin = useCallback(
    async (network: {
      id: string;
      name: string;
      symbol: string;
      color: string;
      blockchainId?: string;
      logoUrl?: string;
    }) => {
      const currentNetworks = pinnedNetworks ?? [];
      const isCurrentlyPinned = currentNetworks.some(
        (n) => n.id === network.id,
      );

      let updatedNetworks: PinnedNetwork[];

      if (isCurrentlyPinned) {
        updatedNetworks = currentNetworks.filter((n) => n.id !== network.id);
      } else {
        const newPinned: PinnedNetwork = {
          ...network,
          timestamp: Date.now(),
        };
        updatedNetworks = [...currentNetworks, newPinned];
      }

      setNewData(updatedNetworks);
      await saveToStorage(updatedNetworks);

      return !isCurrentlyPinned;
    },
    [pinnedNetworks, setNewData],
  );

  return {
    pinnedNetworks: pinnedNetworks ?? [],
    isPinned,
    togglePin,
  };
};
