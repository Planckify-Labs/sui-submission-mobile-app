import { SAMPLE_ASSETS } from "@/constants/dummyData/assets";
import { useWallet } from "@/hooks/useWallet";
import React, { useCallback, useRef, useState } from "react";
import { Animated, Dimensions, StatusBar, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import AddTokenForm from "@/components/asset-explorer/AddTokenForm";
import AssetExplorerHeader from "@/components/asset-explorer/AssetExplorerHeader";
import AssetExplorerTabs from "@/components/asset-explorer/AssetExplorerTabs";
import AssetItem from "@/components/asset-explorer/AssetItem";
import TabContent from "@/components/asset-explorer/AssetTabContent";
import AssetWalletSelectorModal from "@/components/asset-explorer/AssetWalletSelectorModal";
import NetworkButtons from "@/components/asset-explorer/NetworkButtons";
import NetworkSelectorModal from "@/components/asset-explorer/NetworkSelectorModal";
import SearchBar from "@/components/asset-explorer/SearchBar";
import UserAssetItem from "@/components/asset-explorer/UserAssetItem";

import WalletInfo from "@/components/asset-explorer/WalletInfo";
import { TCryptoAsset } from "@/constants/types/assetTypes";
import {
  addAsset,
  addCustomToken,
  addMultipleAssets,
  filterAssets,
  isAssetAdded,
  removeAsset,
} from "@/utils/assetUtils";
import {
  ALL_NETWORKS,
  type Network,
  filterNetworks,
  getPinnedNetworks,
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

type TabType = "your-assets" | "available-assets";

export default function AssetExplorer() {
  const [userAssets, setUserAssets] = useState<TCryptoAsset[]>([]);
  const [availableAssets] = useState<TCryptoAsset[]>(SAMPLE_ASSETS);
  const [selectedAssets, setSelectedAssets] = useState<TCryptoAsset[]>([]);
  const [currentAsset, setCurrentAsset] = useState<TCryptoAsset | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [networkSearchQuery, setNetworkSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showAddToken, setShowAddToken] = useState(false);
  const [tokenAddress, setTokenAddress] = useState("");
  const [walletSelectorVisible, setWalletSelectorVisible] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("your-assets");

  const [activeNetwork, setActiveNetwork] = useState(ALL_NETWORKS[0].id);
  const [networks, setNetworks] = useState<Network[]>(getPinnedNetworks());
  const [networkModalVisible, setNetworkModalVisible] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(MODAL_HEIGHT)).current;

  const { wallets, activeWalletIndex } = useWallet();
  const activeWallet = wallets[activeWalletIndex];

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

  const handleSelectNetwork = useCallback((networkId: string) => {
    setActiveNetwork(networkId);
  }, []);

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
      const isAdded = isAssetAdded(userAssets, item.id);
      const isSelected = isAssetSelected(selectedAssets, item.id);

      return (
        <AssetItem
          item={item}
          isAdded={isAdded}
          isSelected={isSelected}
          selectionMode={selectionMode}
          onPress={() => {
            if (selectionMode) {
              handleToggleAssetSelection(item);
            } else if (!isAdded) {
              setCurrentAsset(item);
              setWalletSelectorVisible(true);
            }
          }}
          onLongPress={() => handleAssetLongPress(item)}
          onAddPress={() => {
            if (!isAdded) {
              setCurrentAsset(item);
              setWalletSelectorVisible(true);
            }
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

          <TabContent
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
          />

          {!selectionMode && (
            <NetworkButtons
              networks={networks}
              activeNetwork={activeNetwork}
              selectNetwork={handleSelectNetwork}
              openNetworkModal={openNetworkModal}
            />
          )}
        </View>
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
