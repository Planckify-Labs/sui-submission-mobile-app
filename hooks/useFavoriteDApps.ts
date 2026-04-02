import { useCallback, useState } from "react";
import { storage } from "@/lib/storage/mmkv";

const FAVORITE_DAPPS_KEY = "takumipay_favorite_dapps";

export type FavoriteDApp = {
  id: string;
  name: string;
  description: string;
  url: string;
  logoUrl: string;
  timestamp: number;
};

const loadFromStorage = (): FavoriteDApp[] => {
  try {
    const raw = storage.getString(FAVORITE_DAPPS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as FavoriteDApp[];
    return parsed.sort((a, b) => b.timestamp - a.timestamp);
  } catch {
    return [];
  }
};

export const useFavoriteDApps = () => {
  // Synchronous MMKV read — data is ready on first render, no loading state needed
  const [favoriteDApps, setFavoriteDApps] =
    useState<FavoriteDApp[]>(loadFromStorage);

  const isFavorite = useCallback(
    (dappId: string): boolean => favoriteDApps.some((fav) => fav.id === dappId),
    [favoriteDApps],
  );

  const toggleFavorite = useCallback(
    (dapp: {
      id: string;
      name: string;
      description: string;
      url: string;
      logoUrl: string;
    }) => {
      const isCurrentlyFavorite = isFavorite(dapp.id);
      const updatedFavorites = isCurrentlyFavorite
        ? favoriteDApps.filter((fav) => fav.id !== dapp.id)
        : [{ ...dapp, timestamp: Date.now() }, ...favoriteDApps];

      setFavoriteDApps(updatedFavorites);
      storage.set(FAVORITE_DAPPS_KEY, JSON.stringify(updatedFavorites));

      return !isCurrentlyFavorite;
    },
    [favoriteDApps, isFavorite],
  );

  const clearAllFavorites = useCallback(() => {
    setFavoriteDApps([]);
    storage.set(FAVORITE_DAPPS_KEY, JSON.stringify([]));
  }, []);

  return {
    favoriteDApps,
    isLoading: false, // synchronous — never in a loading state
    isFavorite,
    toggleFavorite,
    clearAllFavorites,
  };
};
