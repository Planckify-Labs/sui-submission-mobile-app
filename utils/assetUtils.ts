import {
  TCryptoAsset,
  TExtendedCryptoAsset,
} from "@/constants/types/assetTypes";
import { Alert } from "react-native";

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
    Alert.alert("Already Added", `${asset.name} is already in your assets`);
    return userAssets;
  }

  Alert.alert("Asset Added", `${asset.name} has been added to your assets`);
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
    Alert.alert(
      "No New Assets",
      "All selected assets are already in your list",
    );
    return userAssets;
  }

  Alert.alert(
    "Assets Added",
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
        Alert.alert("Invalid Address", "Please enter a valid token address");
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

      Alert.alert("Token Added", `Custom token has been added to your assets`);
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
