import { TTransaction } from "@/api/types/transaction";
import { truncateAddress } from "@/utils/walletUtils";
import * as ExpoClipboard from "expo-clipboard";
import { openBrowserAsync } from "expo-web-browser";
import { Copy, ExternalLink, Send } from "lucide-react-native";
import React, { useCallback } from "react";
import { Alert, Text, TouchableOpacity, View } from "react-native";
import { formatUnits } from "viem/utils";
import Chip from "../common/Chip";

const TransferCard = React.memo(
  ({ transaction }: { transaction: TTransaction }) => {
    const copyToClipboard = useCallback((label: string, value: string) => {
      ExpoClipboard.setStringAsync(value);
      Alert.alert("Copied!", `${label} copied to clipboard.`);
    }, []);

    const openBlockExplorer = useCallback(() => {
      openBrowserAsync(
        `${transaction.token.blockchain.blockExplorer}/tx/${transaction.txHash}`,
      );
    }, [transaction.txHash, transaction.token.blockchain.blockExplorer]);

    return (
      <View className="bg-white rounded-xl shadow-sm w-full p-5 gap-3">
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
                {transaction.createdAt}
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
              onPress={() =>
                copyToClipboard("Transaction hash", transaction.txHash || "")
              }
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
            {formatUnits(
              BigInt(transaction.amount),
              transaction.token.decimals,
            )}{" "}
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
            {truncateAddress(transaction.recipientAddress)}
          </Text>
        </View>

        <View className="pt-1">
          <Text className="text-light-matte-black text-xs">Spender</Text>
          <Text className="text-light-matte-black/80 text-sm" numberOfLines={1}>
            {truncateAddress(transaction.senderAddress)}
          </Text>
        </View>

        <View className="border-t border-gray-200 mt-2 pt-2">
          <Text className="text-light-matte-black text-xs">Chain</Text>
          <Text className="text-light-matte-black text-sm">
            {transaction.token.blockchain.name}
          </Text>
        </View>
      </View>
    );
  },
);

TransferCard.displayName = "TransferCard";

export default TransferCard;
