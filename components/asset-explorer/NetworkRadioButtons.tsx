import { useBlockchains } from "@/hooks/queries/useBlockchains";
import { useWallet } from "@/hooks/useWallet";
import { MoveDiagonal } from "lucide-react-native";
import React, { useEffect } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import NetworkRadioButtonLoadingSkeletons from "./NetworkRadioButtonLoadingSkeletons";

type Network = {
  id: string;
  name: string;
  symbol: string;
  color: string;
  isPinned?: boolean;
  blockchainId?: string; // Add blockchainId to the Network type
};

type NetworkButtonsProps = {
  networks: Network[];
  activeNetwork: string;
  activeTab: "my-assets" | "explore-assets";
  selectNetwork: (networkId: string, blockchainId?: string) => void; // Update to pass blockchainId
  openNetworkModal: () => void;
};

const NetworkRadioButtons = ({
  networks,
  activeNetwork,
  activeTab,
  selectNetwork,
  openNetworkModal,
}: NetworkButtonsProps) => {
  const { activeChain } = useWallet();
  const { data: blockchains, isLoading } = useBlockchains({ isActive: true });

  // Map blockchain data to network format with blockchainId
  const blockchainNetworks = React.useMemo(() => {
    if (!blockchains) return [];

    return blockchains.map((blockchain) => ({
      id: blockchain.chainId.toString(),
      name: blockchain.name,
      symbol: "ETH",
      color: "#627EEA", // Default color
      isPinned: true,
      blockchainId: blockchain.id, // Include the blockchain ID from the API
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

  const getNetworkIdFromChainId = (chainId: number): string => {
    const chainToNetworkMap: Record<number, string> = {
      1: "ethereum",
      137: "polygon",
      56: "binance",
      43114: "avalanche",
      42161: "arbitrum",
      10: "optimism",
      8453: "base",
      250: "fantom",
      25: "cronos",
    };

    return chainToNetworkMap[chainId] || "ethereum";
  };

  useEffect(() => {
    if (activeChain?.chain?.id) {
      const networkId = getNetworkIdFromChainId(activeChain.chain.id);
      if (networks.some((network) => network.id === networkId)) {
        selectNetwork(networkId);
      }
    }
  }, [activeChain?.chain?.id]);

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
                <Pressable
                  key={network.id}
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
                </Pressable>
              ),
            )
          )}
        </View>
      </ScrollView>
      <Pressable
        className={`absolute bottom-[1px] top-[1px] right-[1px] aspect-square ${accentColor} rounded-full items-center justify-center`}
        onPress={() => openNetworkModal()}
        accessibilityLabel="Open network selection"
      >
        <MoveDiagonal size={18} color="white" />
      </Pressable>
    </View>
  );
};

export default NetworkRadioButtons;
