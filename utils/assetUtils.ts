import {
  TCryptoAsset,
  TExtendedCryptoAsset,
} from "@/constants/types/assetTypes";
import { TNetwork } from "@/constants/types/networkTypes";
import {
  createStorageKey,
  getStorageItem,
  setStorageItem,
} from "./storageUtils";

export function isAssetAdded(
  userAssets: TCryptoAsset[],
  assetId: string,
): boolean {
  return userAssets.some((asset) => asset.id === assetId);
}

export function addAsset(
  userAssets: TCryptoAsset[],
  asset: TCryptoAsset,
): TCryptoAsset[] {
  if (isAssetAdded(userAssets, asset.id)) {
    console.log("Already Added:", `${asset.name} is already in your assets`);
    return userAssets;
  }

  console.log("Asset Added:", `${asset.name} has been added to your assets`);
  return [...userAssets, asset];
}

export function addMultipleAssets(
  userAssets: TCryptoAsset[],
  assetsToAdd: TCryptoAsset[],
): TCryptoAsset[] {
  const newAssets = assetsToAdd.filter(
    (asset) => !isAssetAdded(userAssets, asset.id),
  );

  if (newAssets.length === 0) {
    console.log(
      "No New Assets:",
      "All selected assets are already in your list",
    );
    return userAssets;
  }

  console.log(
    "Assets Added:",
    `${newAssets.length} asset${newAssets.length > 1 ? "s" : ""} added to your list`,
  );

  return [...userAssets, ...newAssets];
}

export function removeAsset(
  userAssets: TCryptoAsset[],
  assetId: string,
): TCryptoAsset[] {
  return userAssets.filter((asset) => asset.id !== assetId);
}

export function addCustomToken(
  userAssets: TCryptoAsset[],
  tokenAddress: string,
): Promise<TCryptoAsset[]> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (!tokenAddress || tokenAddress.length < 10) {
        console.error("Invalid Address: Please enter a valid token address");
        reject(new Error("Invalid address"));
        return;
      }

      const newToken: TExtendedCryptoAsset = {
        id: `custom-${Date.now()}`,
        name: `Custom Token (${tokenAddress.substring(0, 6)}...)`,
        symbol: "TKN",
        logo: "T",
        balance: "0",
        value: "0.00",
        change: "0%",
        contractAddress: tokenAddress,
      };

      console.log("Token Added:", `Custom token has been added to your assets`);
      resolve([...userAssets, newToken as TCryptoAsset]);
    }, 1500);
  });
}

export function filterAssets(
  assets: TCryptoAsset[],
  searchQuery: string,
): TCryptoAsset[] {
  if (!searchQuery) return assets;

  const query = searchQuery.toLowerCase();
  return assets.filter(
    (asset) =>
      asset.name.toLowerCase().includes(query) ||
      asset.symbol.toLowerCase().includes(query),
  );
}

// Load assets for a specific wallet and network
export async function loadWalletAssets(
  walletAddress: string,
  networkId: string,
): Promise<TCryptoAsset[]> {
  const storageKey = createStorageKey(
    "wallet_assets",
    walletAddress,
    networkId,
  );
  return getStorageItem<TCryptoAsset[]>(storageKey, []);
}

// Save assets for a specific wallet and network
export async function saveWalletAssets(
  walletAddress: string,
  networkId: string,
  assets: TCryptoAsset[],
): Promise<boolean> {
  const storageKey = createStorageKey(
    "wallet_assets",
    walletAddress,
    networkId,
  );
  return setStorageItem(storageKey, assets);
}

// Function to get network-specific assets
export function getNetworkSpecificAssets(
  allAssets: TCryptoAsset[],
  networkId: string,
  networks: TNetwork[],
): TCryptoAsset[] {
  const network = networks.find((n) => n.id === networkId);
  if (!network) return allAssets;

  const networkTokenMap: Record<string, string[]> = {
    ethereum: ["ETH", "USDT", "USDC", "DAI", "LINK", "UNI", "AAVE"],
    polygon: ["MATIC", "USDT", "USDC", "DAI", "AAVE"],
    binance: ["BNB", "USDT", "USDC", "CAKE", "BUSD"],
    solana: ["SOL", "USDT", "USDC"],
    avalanche: ["AVAX", "USDT", "USDC", "DAI"],
    arbitrum: ["ETH", "ARB", "USDT", "USDC", "DAI"],
    optimism: ["ETH", "OP", "USDT", "USDC", "DAI"],
    base: ["ETH", "USDC", "DAI"],
    fantom: ["FTM", "USDT", "USDC", "DAI"],
    cronos: ["CRO", "USDT", "USDC"],
  };

  const relevantTokens = networkTokenMap[networkId] || [];

  if (relevantTokens.length === 0) {
    return allAssets;
  }

  return allAssets.filter((asset) => relevantTokens.includes(asset.symbol));
}

export function adaptAssetForNetwork(
  asset: TCryptoAsset,
  networkId: string,
  networks: TNetwork[],
): TCryptoAsset {
  const network = networks.find((n) => n.id === networkId);
  if (!network) return asset;

  if (
    ["arbitrum", "optimism", "base"].includes(networkId) &&
    asset.symbol !== "ETH"
  ) {
    return {
      ...asset,
      name: `${network.name} ${asset.name}`,
    };
  }

  return asset;
}
