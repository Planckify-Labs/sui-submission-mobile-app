import { TCryptoAsset } from "@/constants/types/assetTypes";

export function isAssetSelected(
  selectedAssets: TCryptoAsset[],
  assetId: string,
): boolean {
  return selectedAssets.some((asset) => asset.id === assetId);
}

export function toggleAssetSelection(
  selectedAssets: TCryptoAsset[],
  asset: TCryptoAsset,
): TCryptoAsset[] {
  if (isAssetSelected(selectedAssets, asset.id)) {
    return selectedAssets.filter((a) => a.id !== asset.id);
  } else {
    return [...selectedAssets, asset];
  }
}

export function enterSelectionMode(initialAsset: TCryptoAsset): TCryptoAsset[] {
  return [initialAsset];
}

export function exitSelectionMode(): TCryptoAsset[] {
  return [];
}
