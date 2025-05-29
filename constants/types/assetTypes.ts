export type TCryptoAsset = {
  id: string;
  symbol: string;
  name: string;
  logo: string;
  balance: string;
  value: string;
  change: string;
  address?: string;
  isCustom?: boolean;
  contractAddress?: string;
};

export type TExtendedCryptoAsset = TCryptoAsset & {
  contractAddress?: string;
};

export type TAssetTabType = "your-assets" | "available-assets";

export type AssetListContentProps = {
  activeTab: TAssetTabType;
  userAssets: TCryptoAsset[];
  filteredUserAssets: TCryptoAsset[];
  filteredAvailableAssets: TCryptoAsset[];
  searchQuery: string;
  setActiveTab: (tab: TAssetTabType) => void;
  renderUserAssetItem: ({ item }: { item: TCryptoAsset }) => React.ReactElement;
  renderAvailableAssetItem: ({
    item,
  }: {
    item: TCryptoAsset;
  }) => React.ReactElement;
  selectionMode: boolean;
  isAssetAdded: (id: string) => boolean;
  addAsset?: (asset: TCryptoAsset) => void;
  selectedAssets?: TCryptoAsset[];
  toggleAssetSelection?: (asset: TCryptoAsset) => void;
  handleAssetLongPress?: (asset: TCryptoAsset) => void;
};

export type TAssetCategoryTabsProps = {
  activeTab: TAssetTabType;
  setActiveTab: (tab: TAssetTabType) => void;
  selectionMode: boolean;
};

export type TAssetWalletSelectorModalProps = {
  visible: boolean;
  onClose: () => void;
  wallets: import("./walletTypes").TWallet[];
  asset: TCryptoAsset | null;
  assets?: TCryptoAsset[];
  onConfirm: (
    walletIndices: number[],
    asset: TCryptoAsset | null,
    assets?: TCryptoAsset[],
  ) => void;
};
