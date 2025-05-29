import { Animated } from "react-native";

export type TNetwork = {
  id: string;
  name: string;
  symbol: string;
  color: string;
  isPinned: boolean;
};

export type TNetworkSelectorModalProps = {
  visible: boolean;
  networks: TNetwork[];
  activeNetworkId?: string;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSelectNetwork?: (networkId: string) => void;
  toggleNetworkPin: (networkId: string) => void;
  closeModal: () => void;
  fadeAnim: Animated.Value;
  translateY: Animated.Value;
};

export type TWalletInfoProps = {
  activeWallet: import("./walletTypes").TWallet | undefined;
};
