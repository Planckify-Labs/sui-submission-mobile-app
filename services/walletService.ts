import * as SecureStore from "expo-secure-store";
import {
  type HDAccount,
  mnemonicToAccount,
  type PrivateKeyAccount,
  privateKeyToAccount,
} from "viem/accounts";
import { TWallet } from "@/constants/types/walletTypes";

const accountCache: Record<string, HDAccount | PrivateKeyAccount> = {};

let cachedWallets: TWallet[] | null = null;

const WALLET_INDEX_KEY = "wallet_index";
const WALLET_PREFIX = "wallet_";

export async function loadWalletsFromStorage(): Promise<TWallet[]> {
  try {
    if (cachedWallets) return [...cachedWallets];

    const indexListData = await SecureStore.getItemAsync(WALLET_INDEX_KEY);
    if (!indexListData) return [];

    const walletAddresses = JSON.parse(indexListData) as string[];

    const walletPromises = walletAddresses.map(async (address) => {
      const walletKey = `${WALLET_PREFIX}${address}`;
      const walletData = await SecureStore.getItemAsync(walletKey);
      return walletData ? JSON.parse(walletData) : null;
    });

    const results = await Promise.all(walletPromises);
    const loaded = results.filter(Boolean) as TWallet[];

    // Namespace backfill — wallets saved before the multi-chain refactor
    // don't carry `namespace`. Everything on record predates non-EVM support
    // so stamping "eip155" is safe. Persist back once so the next boot is a
    // pure read.
    let needsPersist = false;
    for (const w of loaded) {
      if (!w.namespace) {
        w.namespace = "eip155";
        needsPersist = true;
      }
    }
    cachedWallets = loaded;
    if (needsPersist) {
      void saveWalletsToStorage(loaded);
    }

    return [...cachedWallets];
  } catch (error) {
    console.error("Failed to load wallets:", error);
    return [];
  }
}

export async function saveWalletsToStorage(
  wallets: TWallet[],
): Promise<boolean> {
  try {
    cachedWallets = [...wallets];

    const walletAddresses = wallets.map((wallet) => wallet.address);
    await SecureStore.setItemAsync(
      WALLET_INDEX_KEY,
      JSON.stringify(walletAddresses),
    );

    const savePromises = wallets.map(async (wallet) => {
      const { account: _account, ...walletWithoutAccount } = wallet;
      const walletForStorage = {
        ...walletWithoutAccount,
        account: { address: wallet.address },
      };

      const walletKey = `${WALLET_PREFIX}${wallet.address}`;
      return SecureStore.setItemAsync(
        walletKey,
        JSON.stringify(walletForStorage),
      );
    });

    await Promise.all(savePromises);
    return true;
  } catch (error) {
    console.error("Failed to save wallets:", error);
    cachedWallets = null;
    return false;
  }
}

export function getAccountForWallet(
  wallet: TWallet,
): HDAccount | PrivateKeyAccount | null {
  if (accountCache[wallet.address]) {
    return accountCache[wallet.address];
  }

  try {
    let account: HDAccount | PrivateKeyAccount | null = null;

    if (wallet.type === "PrivateKey" && wallet.privateKey) {
      account = privateKeyToAccount(wallet.privateKey as `0x${string}`);
    } else if (wallet.type === "SeedPhrase" && wallet.seedPhrase) {
      account = mnemonicToAccount(wallet.seedPhrase);
    }

    if (account) {
      accountCache[wallet.address] = account;
    }

    return account;
  } catch (error) {
    console.error("Error creating account:", error);
    return null;
  }
}

export function clearAccountCache(): void {
  Object.keys(accountCache).forEach((key) => {
    delete accountCache[key];
  });
}

export function clearWalletCache() {
  cachedWallets = null;
}
