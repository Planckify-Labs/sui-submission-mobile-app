import { MoveDiagonal } from "lucide-react-native";
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

type Network = {
  id: string;
  name: string;
  symbol: string;
  color: string;
  isPinned?: boolean;
};

type NetworkButtonsProps = {
  networks: Network[];
  activeNetwork: string;
  selectNetwork: (networkId: string) => void;
  openNetworkModal: () => void;
};

const NetworkButtons = ({
  networks,
  activeNetwork,
  selectNetwork,
  openNetworkModal,
}: NetworkButtonsProps) => {
  return (
    <View className="absolute bottom-4 left-2 right-2 flex-row justify-center bg-light rounded-full overflow-hidden border-4 border-light-matte-black">
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row p-1 pr-10 gap-2">
          {networks.map((network) => (
            <Pressable
              key={network.id}
              onPress={() => selectNetwork(network.id)}
              className={`px-3 py-2 rounded-full mx-1- flex-row items-center ${
                activeNetwork === network.id
                  ? "bg-light-matte-black"
                  : "bg-light-main-container"
              }`}
            >
              <View
                className={`w-3 h-3 rounded-full mr-2 ${
                  activeNetwork === network.id
                    ? "bg-white"
                    : "bg-light-matte-black"
                }`}
              />
              <Text
                className={`${
                  activeNetwork === network.id
                    ? "text-white"
                    : "text-light-matte-black"
                } font-medium text-xs`}
              >
                {network.name}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
      <Pressable
        className="absolute bottom-[1px] top-[1px] right-[1px] aspect-square bg-light-matte-black rounded-full items-center justify-center"
        onPress={() => openNetworkModal()}
        accessibilityLabel="Open network selection"
      >
        <MoveDiagonal size={18} color="white" />
      </Pressable>
    </View>
  );
};

export default NetworkButtons;
