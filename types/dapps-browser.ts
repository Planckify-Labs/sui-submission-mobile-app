import { Animated, LayoutChangeEvent, TextInput } from "react-native";
import type { TDapp } from "@/api/types/dapp";
import { TWallet } from "@/constants/types/walletTypes";

export interface TDAppNavigationProps {
  onNavigateToDapp: (url: string) => void;
}

export interface BrowserState {
  canGoBack: boolean;
  canGoForward: boolean;
}

export interface TBrowserAddressBarProps {
  addressBarText: string;
  onChangeText: (text: string) => void;
  onSubmitEditing: () => void;
  addressBarRef: React.RefObject<TextInput | null>;
  isWalletConnected?: boolean;
}

export interface TBrowserNavigationControlsProps {
  browserState: BrowserState;
  onGoBack: () => void;
  onGoForward: () => void;
  onSearch: () => void;
  onRefresh: () => void;
  onHome: () => void;
}

export interface TDAppCardProps {
  dapp: TDapp;
  isCompact?: boolean;
  onPress: (url: string) => void;
}

export interface TCategoryDAppsListProps extends TDAppNavigationProps {
  horizontalScrollX?: Animated.Value;
}

export interface TFloatingDAppsCategoryTabProps {
  onLayout: (event: LayoutChangeEvent) => void;
  tabWidth: number;
  horizontalScrollX: Animated.Value;
}

export interface TErrorMessageProps {
  onRetry: () => void;
  message?: string;
}

export interface TTransactionRequest {
  to?: string;
  value?: string;
  data?: string;
  gas?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}

export interface TTransactionModalProps {
  visible: boolean;
  onClose: () => void;
  onApprove: () => Promise<void>;
  onReject: () => void;
  transaction: TTransactionRequest;
  wallet: TWallet;
  dappUrl: string;
}

export interface TEcosystemHubProps extends TDAppNavigationProps {
  activeCategory: TCategoryTab;
  onCategoryChange?: (category: TCategoryTab) => void;
  horizontalScrollX?: Animated.Value;
}

export interface TSkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
}

export interface TDimensionConstants {
  SCREEN_WIDTH: number;
  PROMO_CARD_WIDTH: number;
  POPULAR_CARD_WIDTH: number;
}

export type TCategoryTab = string;

export interface TEcosystemHubProps {
  onNavigateToDapp: (url: string) => void;
  activeCategory: TCategoryTab;
  onCategoryChange?: (category: TCategoryTab) => void;
  horizontalScrollX?: Animated.Value;
}

export interface TTransactionRequest {
  to?: string;
  value?: string;
  data?: string;
  gas?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}

export interface TTransactionModalProps {
  visible: boolean;
  onClose: () => void;
  onApprove: () => Promise<void>;
  onReject: () => void;
  transaction: TTransactionRequest;
  wallet: TWallet;
  dappUrl: string;
}
