import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Check, Copy, Wallet } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { formatUnits } from "viem";
import { TWalletInfoProps } from "@/constants/types/networkTypes";
import { useWallet } from "@/hooks/useWallet";
import { formatTokenAmount } from "@/utils/helperUtils";

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
    const decimals = activeChain?.chain?.nativeCurrency?.decimals ?? 18;
    const formatted = formatUnits(value, decimals);
    return formatTokenAmount(formatted, { simplify: false });
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
    <View
      className="rounded-3xl overflow-hidden my-2 bg-light-matte-black p-5"
      style={{
        shadowColor: "#20222c",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 16,
        elevation: 8,
      }}
    >
      {/* Top section - Wallet name and network */}
      <View className="flex-row justify-between items-start mb-4">
        <View className="flex-row items-center">
          <View className="w-10 h-10 rounded-xl bg-white/10 items-center justify-center mr-3">
            <Wallet size={20} color="#fff" />
          </View>
          <View>
            <Text className="text-white/60 text-xs mb-0.5">Active Wallet</Text>
            <Text className="text-white font-bold text-base">
              {activeWallet?.name || "My Wallet"}
            </Text>
          </View>
        </View>

        <View className="bg-light-primary-red/20 px-3 py-1.5 rounded-full border border-light-primary-red/30">
          <Text className="text-light-primary-red text-xs font-semibold">
            {activeChain?.chain?.name || "Ethereum"}
          </Text>
        </View>
      </View>

      {/* Balance display */}
      <View className="mb-4">
        <Text className="text-white/50 text-xs mb-1">Native Balance</Text>
        <View className="flex-row items-end">
          {isLoading ? (
            <ActivityIndicator size="small" color="#c71c4b" />
          ) : (
            <>
              <Text className="text-white font-bold text-3xl">
                {formatBalance(balance)}
              </Text>
              <Text className="text-white/60 text-lg ml-2 mb-0.5">
                {activeChain?.chain?.nativeCurrency?.symbol || "ETH"}
              </Text>
            </>
          )}
        </View>
      </View>

      {/* Address copy button */}
      <Pressable
        onPress={copyAddress}
        className="flex-row items-center bg-white/10 p-3 rounded-xl active:bg-white/20"
      >
        <Text className="text-white/80 flex-1 font-mono text-sm">
          {formattedAddress}
        </Text>
        {copied ? (
          <View className="flex-row items-center">
            <Check size={14} color="#22c55e" />
            <Text className="text-green-400 text-xs ml-1">Copied!</Text>
          </View>
        ) : (
          <Copy size={16} color="#c71c4b" />
        )}
      </Pressable>
    </View>
  );
};

export default WalletInfo;
