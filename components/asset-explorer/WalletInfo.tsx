import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Copy } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { formatUnits } from "viem";
import { TWalletInfoProps } from "@/constants/types/networkTypes";
import { useWallet } from "@/hooks/useWallet";

const WalletInfo = ({ activeWallet }: TWalletInfoProps) => {
  const { activeChain, getPublicClientForActiveChain } = useWallet();
  const [balance, setBalance] = useState<bigint>(BigInt(0));
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchBalance = async () => {
      if (!activeWallet?.address) return;

      try {
        setIsLoading(true);
        const publicClient = getPublicClientForActiveChain();
        const walletBalance = await publicClient.getBalance({
          address: activeWallet.address as `0x${string}`,
        });
        setBalance(walletBalance);
      } catch (error) {
        console.error("Error fetching balance:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchBalance();
  }, [activeWallet?.address, getPublicClientForActiveChain]);

  const formatBalance = (value: bigint): string => {
    const formatted = parseFloat(formatUnits(value, 18)).toFixed(4);
    return formatted.replace(/\.?0+$/, "");
  };

  const copyAddress = async () => {
    if (activeWallet?.address) {
      await Clipboard.setStringAsync(activeWallet.address);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formattedAddress = activeWallet?.address
    ? `${activeWallet.address.substring(0, 6)}...${activeWallet.address.substring(activeWallet.address.length - 4)}`
    : "No wallet selected";

  return (
    <View className="bg-light p-4 mb-4 rounded-2xl border-4 border-light-matte-black">
      <View className="flex-row justify-between items-center mb-4">
        <View>
          <Text className="text-light-matte-black/60 text-xs mb-1">
            Current Wallet
          </Text>
          <Text className="text-light-matte-black font-bold text-lg">
            {activeWallet?.name || "My Wallet"}
          </Text>
        </View>

        <View className="border border-light-primary-red/20 px-3 py-1 rounded-full">
          <Text className="text-light-primary-red text-xs font-medium">
            {activeChain?.chain?.name || "Ethereum"}
          </Text>
        </View>
      </View>

      <Pressable
        onPress={copyAddress}
        className="flex-row items-center mb-4 border border-light-matte-black/10 p-2.5 rounded-xl"
      >
        <Text className="text-light-matte-black/80 flex-1 font-medium">
          {formattedAddress}
        </Text>
        {copied ? (
          <Text className="text-light-matte-black/80 text-xs">Copied!</Text>
        ) : (
          <Copy size={16} color="#c71c4b" />
        )}
      </Pressable>

      <View className="border-t border-light-matte-black/10 pt-4">
        <View className="flex-row justify-between items-center">
          <Text className="text-light-matte-black/70 font-medium">
            Native Balance
          </Text>
          <View className="border border-light-primary-red/20 px-2 py-1 rounded-full">
            <Text className="text-light-primary-red text-xs">
              {activeChain?.chain?.nativeCurrency?.symbol || "ETH"}
            </Text>
          </View>
        </View>

        <View className="mt-2">
          {isLoading ? (
            <ActivityIndicator size="small" color="#c71c4b" />
          ) : (
            <Text className="text-light-primary-red font-bold text-2xl">
              {formatBalance(balance)}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
};

export default WalletInfo;
