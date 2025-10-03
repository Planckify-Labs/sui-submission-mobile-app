import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  ScrollView,
  StatusBar,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AddTokenForm from "@/components/asset-explorer/AddTokenForm";
import AssetExplorerHeader from "@/components/asset-explorer/AssetExplorerHeader";
import AssetItem from "@/components/asset-explorer/AssetItem";
import AssetTabContent from "@/components/asset-explorer/AssetTabContent";
import AssetWalletSelectorModal from "@/components/asset-explorer/AssetWalletSelectorModal";
import AssetExplorerTabs from "@/components/asset-explorer/MyAssetsAndExploreAssetTabs";
import NetworkRadioButtons from "@/components/asset-explorer/NetworkRadioButtons";
import NetworkSelectorModal from "@/components/asset-explorer/NetworkSelectorModal";
import UserAssetItem from "@/components/asset-explorer/UserAssetItem";
import WalletInfo from "@/components/asset-explorer/WalletInfo";
import SearchBar from "@/components/common/SearchBar";
import { SAMPLE_ASSETS } from "@/constants/dummyData/assets";
import { TAssetTabType, TCryptoAsset } from "@/constants/types/assetTypes";
import { useTokens } from "@/hooks/queries/useTokens";
import { useWallet } from "@/hooks/useWallet";
import {
  adaptAssetForNetwork,
  addAsset,
  addCustomToken,
  addMultipleAssets,
  filterAssets,
  getNetworkSpecificAssets,
  isAssetAdded,
  removeAsset,
} from "@/utils/assetUtils";
import {
  ALL_NETWORKS,
  filterNetworks,
  getPinnedNetworks,
  type Network,
  toggleNetworkPin,
} from "@/utils/networkUtils";
import {
  enterSelectionMode,
  exitSelectionMode,
  isAssetSelected,
  toggleAssetSelection,
} from "@/utils/selectionUtils";

const { height } = Dimensions.get("window");
const MODAL_HEIGHT = height * 0.67;

export default function AssetExplorer() {
  const [userAssets, setUserAssets] = useState<TCryptoAsset[]>([]);
  const [availableAssets, setAvailableAssets] = useState<TCryptoAsset[]>([]);
  const [selectedAssets, setSelectedAssets] = useState<TCryptoAsset[]>([]);
  const [currentAsset, setCurrentAsset] = useState<TCryptoAsset | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [networkSearchQuery, setNetworkSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showAddToken, setShowAddToken] = useState(false);
  const [tokenAddress, setTokenAddress] = useState("");
  const [walletSelectorVisible, setWalletSelectorVisible] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [activeTab, setActiveTab] = useState<TAssetTabType>("my-assets");

  const [activeNetwork, setActiveNetwork] = useState(ALL_NETWORKS[0].id);
  const [activeBlockchainId, setActiveBlockchainId] = useState<
    string | undefined
  >(undefined);
  const [networks, setNetworks] = useState<Network[]>(getPinnedNetworks());
  const [networkModalVisible, setNetworkModalVisible] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(MODAL_HEIGHT)).current;

  const { wallets, activeWalletIndex } = useWallet();
  const activeWallet = wallets[activeWalletIndex];

  const { data: tokens, isLoading: isLoadingTokens } = useTokens({
    blockchainId: activeBlockchainId,
    isActive: true,
  });

  const getStorageKey = useCallback(() => {
    return `wallet_assets_${activeWallet?.address}_${activeNetwork}`;
  }, [activeWallet?.address, activeNetwork]);

  const loadUserAssets = useCallback(async () => {
    try {
      const storageKey = getStorageKey();
      const storedAssets = await AsyncStorage.getItem(storageKey);

      if (storedAssets) {
        setUserAssets(JSON.parse(storedAssets));
      } else {
        setUserAssets([]);
      }
    } catch (error) {
      console.error("Failed to load assets:", error);
    }
  }, [getStorageKey]);

  const saveUserAssets = useCallback(async () => {
    try {
      const storageKey = getStorageKey();
      await AsyncStorage.setItem(storageKey, JSON.stringify(userAssets));
    } catch (error) {
      console.error("Failed to save assets:", error);
    }
  }, [userAssets, getStorageKey]);

  useEffect(() => {
    if (activeWallet?.address) {
      loadUserAssets();
    }
  }, [activeWallet?.address, loadUserAssets]);

  useEffect(() => {
    if (activeWallet?.address) {
      saveUserAssets();
    }
  }, [activeWallet?.address, saveUserAssets]);

  useEffect(() => {
    if (tokens) {
      const tokenAssets = tokens.map((token) => ({
        id: token.id || `token-${token.contractAddress}`,
        name: token.name || "Unknown Token",
        symbol: token.symbol || "???",
        logo: token.logoUrl || token.symbol?.charAt(0) || "?",
        balance: "0",
        value: "0.00",
        change: "0%",
        contractAddress: token.contractAddress,
        decimals: token.decimals,
      }));

      setAvailableAssets(tokenAssets);
    } else if (!activeBlockchainId || !isLoadingTokens) {
      const networkAssets = getNetworkSpecificAssets(
        SAMPLE_ASSETS,
        activeNetwork,
        ALL_NETWORKS,
      );
      setAvailableAssets(networkAssets);
    }
  }, [tokens, isLoadingTokens, activeNetwork, activeBlockchainId]);

  const filteredAvailableAssets = filterAssets(availableAssets, searchQuery);
  const filteredUserAssets = filterAssets(userAssets, searchQuery);
  const filteredNetworks = filterNetworks(ALL_NETWORKS, networkSearchQuery);

  const openNetworkModal = useCallback(() => {
    setNetworkModalVisible(true);
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, translateY]);

  const closeNetworkModal = useCallback(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: MODAL_HEIGHT,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setNetworkModalVisible(false);
      setNetworkSearchQuery("");
    });
  }, [fadeAnim, translateY]);

  const handleAddAsset = useCallback((asset: TCryptoAsset) => {
    setUserAssets((current) => addAsset(current, asset));
  }, []);

  const handleRemoveAsset = useCallback((assetId: string) => {
    setUserAssets((current) => removeAsset(current, assetId));
  }, []);

  const handleAddCustomToken = useCallback(async () => {
    setIsLoading(true);
    try {
      const updatedAssets = await addCustomToken(userAssets, tokenAddress);
      setUserAssets(updatedAssets);
      setTokenAddress("");
      setShowAddToken(false);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }, [tokenAddress, userAssets]);

  const handleAssetLongPress = useCallback(
    (asset: TCryptoAsset) => {
      if (!selectionMode) {
        setSelectionMode(true);
        setSelectedAssets(enterSelectionMode(asset));
      }
    },
    [selectionMode],
  );

  const handleToggleAssetSelection = useCallback((asset: TCryptoAsset) => {
    setSelectedAssets((current) => toggleAssetSelection(current, asset));
  }, []);

  const handleCancelSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedAssets(exitSelectionMode());
  }, []);

  const handleAddSelectedAssets = useCallback(() => {
    if (selectedAssets.length > 0) {
      setWalletSelectorVisible(true);
    }
  }, [selectedAssets]);

  const handleAddAssetsToWallets = useCallback(
    (
      walletIndices: number[],
      _: TCryptoAsset | null,
      assetsToAdd?: TCryptoAsset[],
    ) => {
      if (!assetsToAdd || assetsToAdd.length === 0) return;

      let updatedAssets = [...userAssets];

      walletIndices.forEach(() => {
        updatedAssets = addMultipleAssets(updatedAssets, assetsToAdd);
      });

      setUserAssets(updatedAssets);
      setWalletSelectorVisible(false);
      setSelectionMode(false);
      setSelectedAssets([]);
    },
    [userAssets],
  );

  const handleSelectNetwork = useCallback(
    (networkId: string, blockchainId?: string) => {
      setActiveNetwork(networkId);
      setActiveBlockchainId(blockchainId);
    },
    [],
  );

  const handleToggleNetworkPin = useCallback((networkId: string) => {
    const updatedNetworks = toggleNetworkPin(networkId);
    setNetworks(updatedNetworks.filter((n) => n.isPinned));
  }, []);

  const renderUserAssetItem = useCallback(
    ({ item }: { item: TCryptoAsset }) => {
      return <UserAssetItem item={item} removeAsset={handleRemoveAsset} />;
    },
    [handleRemoveAsset],
  );

  const renderAvailableAssetItem = useCallback(
    ({ item }: { item: TCryptoAsset }) => {
      const adaptedItem = adaptAssetForNetwork(
        item,
        activeNetwork,
        ALL_NETWORKS,
      );
      const isAdded = isAssetAdded(userAssets, adaptedItem.id);
      const isSelected = isAssetSelected(selectedAssets, adaptedItem.id);

      return (
        <AssetItem
          item={adaptedItem}
          isAdded={isAdded}
          isSelected={isSelected}
          selectionMode={selectionMode}
          onPress={() => {
            if (selectionMode) {
              handleToggleAssetSelection(adaptedItem);
            } else {
              setCurrentAsset(adaptedItem);
              setWalletSelectorVisible(true);
            }
          }}
          onLongPress={() => handleAssetLongPress(adaptedItem)}
          onAddPress={() => {
            setCurrentAsset(adaptedItem);
            setWalletSelectorVisible(true);
          }}
        />
      );
    },
    [
      userAssets,
      selectedAssets,
      selectionMode,
      handleToggleAssetSelection,
      handleAssetLongPress,
      activeNetwork,
    ],
  );

  const checkIsAssetAdded = useCallback(
    (assetId: string) => {
      return isAssetAdded(userAssets, assetId);
    },
    [userAssets],
  );

  return (
    <>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView className="flex-1 bg-light-main-container" edges={["top"]}>
        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 100 }}
        >
          <View className="flex-1 p-4">
            <AssetExplorerHeader
              selectionMode={selectionMode}
              selectedAssetsCount={selectedAssets.length}
              cancelSelectionMode={handleCancelSelectionMode}
              addSelectedAssets={handleAddSelectedAssets}
            />

            {!selectionMode && <WalletInfo activeWallet={activeWallet} />}

            {!selectionMode && (
              <SearchBar
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                showAddToken={showAddToken}
                setShowAddToken={setShowAddToken}
              />
            )}

            {showAddToken && !selectionMode && (
              <AddTokenForm
                tokenAddress={tokenAddress}
                setTokenAddress={setTokenAddress}
                addCustomToken={handleAddCustomToken}
                isLoading={isLoading}
              />
            )}

            <AssetExplorerTabs
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              selectionMode={selectionMode}
            />

            <AssetTabContent
              activeTab={activeTab}
              userAssets={userAssets}
              setActiveTab={setActiveTab}
              filteredUserAssets={filteredUserAssets}
              filteredAvailableAssets={filteredAvailableAssets}
              isAssetAdded={checkIsAssetAdded}
              addAsset={handleAddAsset}
              selectionMode={selectionMode}
              searchQuery={searchQuery}
              renderUserAssetItem={renderUserAssetItem}
              renderAvailableAssetItem={renderAvailableAssetItem}
              isLoading={isLoadingTokens && activeTab === "explore-assets"}
            />
          </View>
        </ScrollView>
        {!selectionMode && (
          <NetworkRadioButtons
            networks={networks}
            activeNetwork={activeNetwork}
            activeTab={activeTab}
            selectNetwork={handleSelectNetwork}
            openNetworkModal={openNetworkModal}
          />
        )}
      </SafeAreaView>

      <NetworkSelectorModal
        visible={networkModalVisible}
        networks={filteredNetworks}
        activeNetworkId={activeNetwork}
        searchQuery={networkSearchQuery}
        onSearchChange={setNetworkSearchQuery}
        onSelectNetwork={handleSelectNetwork}
        toggleNetworkPin={handleToggleNetworkPin}
        closeModal={closeNetworkModal}
        fadeAnim={fadeAnim}
        translateY={translateY}
      />

      <AssetWalletSelectorModal
        visible={walletSelectorVisible}
        asset={currentAsset}
        assets={selectionMode ? selectedAssets : undefined}
        wallets={wallets}
        activeNetwork={activeNetwork}
        onClose={() => {
          setWalletSelectorVisible(false);
          setCurrentAsset(null);
        }}
        onConfirm={(walletIndices, selectedAsset, selectedAssets) => {
          if (selectionMode && selectedAssets) {
            handleAddAssetsToWallets(walletIndices, null, selectedAssets);
          } else if (selectedAsset) {
            handleAddAsset(selectedAsset);
          }
          setWalletSelectorVisible(false);
          setCurrentAsset(null);
        }}
      />
    </>
  );
}
