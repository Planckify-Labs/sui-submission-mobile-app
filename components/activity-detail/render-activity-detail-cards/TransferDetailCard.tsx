import { openBrowserAsync } from "expo-web-browser";
import { Clock, Copy, ExternalLink, Send } from "lucide-react-native";
import React, { useCallback } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { formatUnits } from "viem/utils";
import { TTransaction } from "@/api/types/transaction";
import { formatDate } from "@/utils/dateUtils";
import { copyToClipboard } from "@/utils/helperUtils";
import { truncateAddress } from "@/utils/walletUtils";

interface TransferDetailCardProps {
  transfer: TTransaction;
}

const TransferDetailCard = React.memo(
  ({ transfer }: TransferDetailCardProps) => {
    const openBlockExplorer = useCallback(() => {
      if (transfer.txHash && transfer.token?.blockchain?.blockExplorer) {
        openBrowserAsync(
          `${transfer.token.blockchain.blockExplorer}/tx/${transfer.txHash}`,
        );
      }
    }, [transfer.txHash, transfer.token?.blockchain?.blockExplorer]);

    const _formatAmount = useCallback(() => {
      if (!transfer.amount) return "0";

      try {
        const cleanAmount = transfer.amount.replace(/[^\d]/g, "");
        if (!cleanAmount || cleanAmount === "0") return "0";
        return formatUnits(BigInt(cleanAmount), transfer.token?.decimals || 18);
      } catch (error) {
        console.warn("Error formatting amount:", error);
        return transfer.amount;
      }
    }, [transfer.amount, transfer.token?.decimals]);

    const formattedDate = formatDate({
      date: transfer.createdAt,
      preset: "short",
    });

    return (
      <View className="mt-4">
        <View className="bg-gradient-to-r from-light-main-container to-white rounded-2xl p-5 border border-gray-100">
          <View className="bg-white rounded-2xl p-5 border border-gray-100">
            <View className="flex-row items-center justify-between mb-4">
              <View className="flex-row items-center gap-3">
                <View className="bg-light-primary-red/10 p-3 pr-[13.5px] pt-[14px] rounded-2xl">
                  <Send size={24} color="#c71c4b" fill="#c71c4b" />
                </View>
                <View className="flex-1">
                  <Text className="text-light-matte-black font-bold text-xl tracking-tight">
                    Transfer Details
                  </Text>
                  <View className="h-1 bg-light-primary-red/20 rounded-full mt-1 w-16" />
                </View>
              </View>
            </View>

            <View className="flex-row items-center gap-2 mb-4 bg-light-main-container/50 p-3 rounded-xl">
              <Clock size={16} color="#c71c4b" />
              <Text className="text-light-matte-black/70 text-sm font-medium">
                {formattedDate}
              </Text>
            </View>

            <View className="flex-row justify-between items-center mb-4 pt-2 border-t border-gray-100">
              <Text className="text-light-matte-black/40 text-xs font-semibold uppercase tracking-wider">
                Transaction Details
              </Text>
              <View className="flex-row space-x-1">
                <View className="w-2 h-2 bg-light-primary-red/30 rounded-full" />
                <View className="w-2 h-2 bg-light-primary-red/50 rounded-full" />
                <View className="w-2 h-2 bg-light-primary-red rounded-full" />
              </View>
            </View>

            <View className="mb-4">
              <Text className="text-light-matte-black font-medium text-sm mb-2">
                Transaction Hash
              </Text>
              <View className="flex-row items-center gap-2 bg-light-main-container p-3 rounded-xl">
                <Text
                  className="text-light-matte-black/70 text-sm flex-1 font-mono"
                  numberOfLines={1}
                >
                  {transfer.txHash || "N/A"}
                </Text>
                {transfer.txHash && (
                  <>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() =>
                        copyToClipboard(
                          "Transaction hash",
                          transfer.txHash || "",
                        )
                      }
                      className="p-1"
                    >
                      <Copy size={16} color="#c71c4b" />
                    </TouchableOpacity>
                    {transfer.token?.blockchain?.blockExplorer && (
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={openBlockExplorer}
                        className="p-1"
                      >
                        <ExternalLink size={16} color="#c71c4b" />
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </View>
            </View>

            <View className="space-y-4 mb-6">
              <View>
                <View className="flex-row items-center gap-2 mb-2">
                  <Text className="text-light-matte-black font-semibold text-sm">
                    From (Sender)
                  </Text>
                </View>
                <View className="flex-row items-center gap-2 bg-light-main-container p-4 rounded-xl">
                  <Text className="text-light-matte-black/80 text-sm flex-1 font-mono font-medium">
                    {truncateAddress({ address: transfer.senderAddress })}
                  </Text>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() =>
                      copyToClipboard("Sender address", transfer.senderAddress)
                    }
                  >
                    <Copy size={16} color="#c71c4b" />
                  </TouchableOpacity>
                </View>
              </View>

              <View>
                <View className="flex-row items-center gap-2 mb-2">
                  <Text className="text-light-matte-black font-semibold text-sm">
                    To (Recipient)
                  </Text>
                </View>
                <View className="flex-row items-center gap-2 p-4 rounded-xl bg-light-main-container">
                  <Text className="text-light-matte-black/80 text-sm flex-1 font-mono font-medium">
                    {truncateAddress({ address: transfer.recipientAddress })}
                  </Text>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() =>
                      copyToClipboard(
                        "Recipient address",
                        transfer.recipientAddress,
                      )
                    }
                  >
                    <Copy size={16} color="#c71c4b" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <View className="border-t border-gray-100 pt-4">
              <View className="flex-row justify-between items-center mb-2">
                <Text className="text-light-matte-black font-medium text-sm">
                  Token
                </Text>
                <Text className="text-light-matte-black/70 text-sm">
                  {transfer.token?.name} ({transfer.token?.symbol})
                </Text>
              </View>

              <View className="flex-row justify-between items-center">
                <Text className="text-light-matte-black font-medium text-sm">
                  Network
                </Text>
                <Text className="text-light-matte-black/70 text-sm">
                  {transfer.token?.blockchain?.name}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </View>
    );
  },
);

TransferDetailCard.displayName = "TransferDetailCard";

export default TransferDetailCard;
