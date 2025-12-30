import { useRouter } from "expo-router";
import { openBrowserAsync } from "expo-web-browser";
import { Copy, ExternalLink, Send } from "lucide-react-native";
import React, { useCallback } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { formatUnits } from "viem/utils";
import { TTransaction } from "@/api/types/transaction";
import { formatDate } from "@/utils/dateUtils";
import { copyToClipboard, formatTokenAmount } from "@/utils/helperUtils";
import { truncateAddress } from "@/utils/walletUtils";
import Chip from "../common/Chip";

const TransferCard = React.memo(
  ({ transaction }: { transaction: TTransaction }) => {
    const router = useRouter();

    const openBlockExplorer = useCallback(
      (event: any) => {
        event.stopPropagation();
        openBrowserAsync(
          `${transaction.token.blockchain.blockExplorer}/tx/${transaction.txHash}`,
        );
      },
      [transaction.txHash, transaction.token.blockchain.blockExplorer],
    );

    const handleCardPress = useCallback(() => {
      router.push({
        pathname: "/activity-detail",
        params: { transferId: transaction.id },
      });
    }, [router, transaction.id]);

    const handleCopyHash = useCallback(
      (event: any) => {
        event.stopPropagation();
        copyToClipboard("Transaction hash", transaction.txHash || "");
      },
      [transaction.txHash],
    );

    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={handleCardPress}
        className="bg-white rounded-xl shadow-sm w-full p-5 gap-3"
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <View className="bg-light-main-container p-2 rounded-md">
              <Send size={18} stroke="#c71c4b" />
            </View>
            <View>
              <Text className="text-light-matte-black font-medium text-sm">
                Transfer
              </Text>
              <Text className="text-light-matte-black/50 text-xs">
                {formatDate({ date: transaction.createdAt, preset: "short" })}
              </Text>
            </View>
          </View>
          <View className="h-full">
            <Chip label="Confirmed" size="small" />
          </View>
        </View>

        <View className="gap-1">
          <Text className="text-light-matte-black text-xs">
            Transaction Hash
          </Text>
          <View className="flex-row items-center gap-2">
            <Text
              className="text-light-matte-black/50 text-xs flex-1"
              numberOfLines={1}
            >
              {transaction.txHash}
            </Text>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleCopyHash}
            >
              <Copy size={14} color="#c71c4b" />
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.7} onPress={openBlockExplorer}>
              <ExternalLink size={14} color="#c71c4b" />
            </TouchableOpacity>
          </View>
        </View>

        <View className="pt-1">
          <Text className="text-light-matte-black text-xs">Amount</Text>
          <Text className="text-light-primary-red font-bold text-md">
            {transaction?.amount &&
              (() => {
                try {
                  const formattedAmount = formatUnits(
                    BigInt(transaction.amount),
                    transaction.token.decimals as number,
                  );
                  return formatTokenAmount(formattedAmount);
                } catch (error) {
                  console.warn("Error formatting amount:", error);
                  return transaction.amount;
                }
              })()}{" "}
            {transaction.token.symbol}
          </Text>
          {transaction?.amountInFiat && (
            <Text className="text-light-matte-black text-sm">
              {transaction.amountInFiat.toString()}
            </Text>
          )}
        </View>

        <View className="pt-1">
          <Text className="text-light-matte-black text-xs">Recipient</Text>
          <Text className="text-light-matte-black/80 text-sm" numberOfLines={1}>
            {truncateAddress({ address: transaction.recipientAddress })}
          </Text>
        </View>

        <View className="pt-1">
          <Text className="text-light-matte-black text-xs">Spender</Text>
          <Text className="text-light-matte-black/80 text-sm" numberOfLines={1}>
            {truncateAddress({ address: transaction.senderAddress })}
          </Text>
        </View>

        <View className="border-t border-gray-200 mt-2 pt-2">
          <Text className="text-light-matte-black text-xs">Chain</Text>
          <Text className="text-light-matte-black text-sm">
            {transaction.token.blockchain.name}
          </Text>
        </View>
      </TouchableOpacity>
    );
  },
);

TransferCard.displayName = "TransferCard";

export default TransferCard;
