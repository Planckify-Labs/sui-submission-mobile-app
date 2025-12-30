import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Creates a storage key from multiple parts
 *
 * @example
 * createStorageKey("wallet", "assets", "0x123", "mainnet") // "wallet_assets_0x123_mainnet"
 */
export function createStorageKey(...parts: (string | number)[]): string {
  return parts.join("_");
}

/**
 * Gets an item from AsyncStorage and parses it as JSON
 *
 * @example
 * const assets = await getStorageItem<Asset[]>("my_assets", []);
 */
export async function getStorageItem<T>(
  key: string,
  defaultValue: T,
): Promise<T> {
  try {
    const stored = await AsyncStorage.getItem(key);

    if (stored === null) {
      return defaultValue;
    }

    return JSON.parse(stored) as T;
  } catch (error) {
    console.error(`Failed to get storage item "${key}":`, error);
    return defaultValue;
  }
}

/**
 * Sets an item in AsyncStorage as JSON
 *
 * @example
 * await setStorageItem("my_assets", assets);
 */
export async function setStorageItem<T>(key: string, value: T): Promise<boolean> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error(`Failed to set storage item "${key}":`, error);
    return false;
  }
}

/**
 * Removes an item from AsyncStorage
 *
 * @example
 * await removeStorageItem("my_assets");
 */
export async function removeStorageItem(key: string): Promise<boolean> {
  try {
    await AsyncStorage.removeItem(key);
    return true;
  } catch (error) {
    console.error(`Failed to remove storage item "${key}":`, error);
    return false;
  }
}

/**
 * Checks if an item exists in AsyncStorage
 *
 * @example
 * const exists = await hasStorageItem("my_assets");
 */
export async function hasStorageItem(key: string): Promise<boolean> {
  try {
    const item = await AsyncStorage.getItem(key);
    return item !== null;
  } catch {
    return false;
  }
}

/**
 * Gets multiple items from AsyncStorage
 *
 * @example
 * const [assets, settings] = await getMultipleStorageItems(["assets", "settings"]);
 */
export async function getMultipleStorageItems<T>(
  keys: string[],
): Promise<(T | null)[]> {
  try {
    const pairs = await AsyncStorage.multiGet(keys);
    return pairs.map(([, value]) => {
      if (value === null) return null;
      try {
        return JSON.parse(value) as T;
      } catch {
        return null;
      }
    });
  } catch (error) {
    console.error("Failed to get multiple storage items:", error);
    return keys.map(() => null);
  }
}

/**
 * Clears all items with a specific prefix from AsyncStorage
 *
 * @example
 * await clearStorageByPrefix("wallet_assets_"); // Clears all wallet assets
 */
export async function clearStorageByPrefix(prefix: string): Promise<boolean> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const keysToRemove = allKeys.filter((key) => key.startsWith(prefix));

    if (keysToRemove.length > 0) {
      await AsyncStorage.multiRemove(keysToRemove);
    }

    return true;
  } catch (error) {
    console.error(`Failed to clear storage with prefix "${prefix}":`, error);
    return false;
  }
}
