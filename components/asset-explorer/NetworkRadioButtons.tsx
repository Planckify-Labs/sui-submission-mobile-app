import { MoveDiagonal } from "lucide-react-native";
import React, { useCallback, useEffect } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useBlockchains } from "@/hooks/queries/useBlockchains";
import { useWallet } from "@/hooks/useWallet";
import NetworkRadioButtonLoadingSkeletons from "./NetworkRadioButtonLoadingSkeletons";

type TNetwork = {
  id: string;
  name: string;
  symbol: string;
  color: string;
  isPinned?: boolean;
  blockchainId?: string;
};

type TNetworkButtonsProps = {
  networks: TNetwork[];
  activeNetwork: string;
  activeTab: "my-assets" | "explore-assets";
  selectNetwork: (networkId: string, blockchainId?: string) => void;
  openNetworkModal: () => void;
};

const NetworkRadioButtons = ({
  networks,
  activeNetwork,
  activeTab,
  selectNetwork,
  openNetworkModal,
}: TNetworkButtonsProps) => {
  const { activeChain } = useWallet();
  const { data: blockchains, isLoading } = useBlockchains({ isActive: true });

  const blockchainNetworks = React.useMemo(() => {
    if (!blockchains) return [];

    return blockchains.map((blockchain) => ({
      id: blockchain.chainId.toString(),
      name: blockchain.name,
      symbol: "ETH",
      color: "#627EEA",
      isPinned: true,
      blockchainId: blockchain.id,
    }));
  }, [blockchains]);

  const getAccentColor = () => {
    return activeTab === "my-assets"
      ? "bg-light-primary-red"
      : "bg-light-matte-black";
  };

  const getBorderColor = () => {
    return activeTab === "my-assets"
      ? "border-light-primary-red"
      : "border-light-matte-black";
  };

  const getAccentTextColor = () => {
    return "text-white";
  };

  const getNetworkIdFromChainId = useCallback(
    (chainId: number): string => {
      const blockchain = blockchains?.find((b) => b.chainId === chainId);

      if (blockchain) {
        return blockchain.chainId.toString();
      }

      return "ethereum";
    },
    [blockchains],
  );

  useEffect(() => {
    if (activeChain?.chain?.id) {
      const networkId = getNetworkIdFromChainId(activeChain.chain.id);

      const blockchain = blockchains?.find(
        (b) => b.chainId === activeChain.chain.id,
      );

      if (blockchain) {
        selectNetwork(networkId, blockchain.id);
      } else if (networks.some((network) => network.id === networkId)) {
        selectNetwork(networkId);
      }
    }
  }, [
    activeChain?.chain?.id,
    blockchains,
    networks,
    selectNetwork,
    getNetworkIdFromChainId,
  ]);

  const accentColor = getAccentColor();
  const borderColor = getBorderColor();
  const accentTextColor = getAccentTextColor();

  return (
    <View
      className={`absolute bottom-4 left-2 right-2 flex-row justify-center bg-light rounded-full overflow-hidden border-4 ${borderColor}`}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row p-1 pr-10 gap-2">
          {isLoading ? (
            <NetworkRadioButtonLoadingSkeletons />
          ) : (
            (blockchainNetworks.length > 0 ? blockchainNetworks : networks).map(
              (network) => (
                <TouchableOpacity
                  key={network.id}
                  activeOpacity={0.7}
                  onPress={() =>
                    selectNetwork(network.id, network.blockchainId)
                  }
                  className={`px-3 py-2 rounded-full mx-1- flex-row items-center ${
                    activeNetwork === network.id
                      ? accentColor
                      : "bg-light-main-container"
                  }`}
                >
                  <View
                    className={`w-3 h-3 rounded-full mr-2 ${
                      activeNetwork === network.id
                        ? "bg-white"
                        : activeTab === "my-assets"
                          ? "bg-light-primary-red/70"
                          : "bg-light-matte-black/70"
                    }`}
                  />
                  <Text
                    className={`${
                      activeNetwork === network.id
                        ? accentTextColor
                        : "text-light-matte-black"
                    } font-medium text-xs`}
                  >
                    {network.name}
                  </Text>
                </TouchableOpacity>
              ),
            )
          )}
        </View>
      </ScrollView>
      <TouchableOpacity
        activeOpacity={0.7}
        className={`absolute bottom-[1px] top-[1px] right-[1px] aspect-square ${accentColor} rounded-full items-center justify-center`}
        onPress={() => openNetworkModal()}
        accessibilityLabel="Open network selection"
      >
        <MoveDiagonal size={18} color="white" />
      </TouchableOpacity>
    </View>
  );
};

export default NetworkRadioButtons;
