import { useRouter } from "expo-router";
import { openBrowserAsync } from "expo-web-browser";
import { Copy, ExternalLink, ShoppingBag } from "lucide-react-native";
import React, { useCallback } from "react";
import { Image, Text, TouchableOpacity, View } from "react-native";
import { TTransaction } from "@/api/types/transaction";
import { formatCurrency } from "@/utils/currencyUtils";
import { formatDate } from "@/utils/dateUtils";
import { copyToClipboard } from "@/utils/helperUtils";
import Chip from "../common/Chip";

const PurchaseCard = React.memo(
  ({ transaction }: { transaction: TTransaction }) => {
    const router = useRouter();

    const openBlockExplorer = useCallback(
      (event: any) => {
        event.stopPropagation();
        openBrowserAsync(`https://etherscan.io/tx/${transaction?.txHash}`);
      },
      [transaction?.txHash],
    );

    const handleRepurchase = useCallback((event: any) => {
      event.stopPropagation();
    }, []);

    const handleCardPress = useCallback(() => {
      router.push({
        pathname: "/activity-detail",
        params: { purchaseId: transaction.purchase?.id },
      });
    }, [router, transaction.purchase?.id]);

    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={handleCardPress}
        className="bg-white rounded-xl shadow-sm w-full p-5 gap-3"
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <View className="bg-light-main-container p-2 rounded-md">
              <ShoppingBag size={18} stroke="#c71c4b" />
            </View>
            <View>
              <Text className="text-light-matte-black font-medium text-sm">
                Purchase
              </Text>
              <Text className="text-light-matte-black/50 text-xs">
                {formatDate({ date: transaction.createdAt, preset: "short" })}
              </Text>
            </View>
          </View>
          <View className="h-full">
            <Chip label="Finish" size="small" />
          </View>
        </View>

        <View className="flex-row items-center gap-3">
          <Image
            source={{
              uri: transaction?.purchase?.productVariant?.product?.imageUrl,
            }}
            className="w-12 h-12 rounded-md bg-light-main-container"
          />
          <View className="flex-1">
            <Text
              className="text-black font-semibold"
              ellipsizeMode="tail"
              numberOfLines={1}
            >
              {transaction?.purchase?.productVariant?.name}
            </Text>
            <View className="flex-row items-center gap-2 mt-1">
              <Text
                className="text-light-matte-black/50 text-xs flex-1"
                numberOfLines={1}
              >
                {transaction?.txHash || "N/A"}
              </Text>
              {transaction?.txHash && (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() =>
                    copyToClipboard(transaction.txHash!, "Transaction hash")
                  }
                >
                  <Copy size={14} color="#c71c4b" />
                </TouchableOpacity>
              )}
              <TouchableOpacity activeOpacity={0.7} onPress={openBlockExplorer}>
                <ExternalLink size={14} color="#c71c4b" />
              </TouchableOpacity>
            </View>

            <View className="flex-row items-center gap-2">
              <Text className="text-light-matte-black/50 text-xs">Chain:</Text>
              <Text className="text-light-matte-black text-xs">
                {transaction?.token?.blockchain?.name}
              </Text>
            </View>
          </View>
        </View>

        <View className="flex-row items-center justify-between border-t pt-2 border-gray-200">
          <View>
            <Text className="text-light-matte-black text-xs">Total Amount</Text>
            <Text className="text-light-matte-black text-sm">
              {transaction?.amount} {transaction?.token?.symbol}
            </Text>
            <Text className="text-light-primary-red font-bold text-md">
              {formatCurrency({
                amount: transaction?.amountInFiat ?? 0,
                currency: "IDR",
              })}
            </Text>
          </View>
          <View className="relative mt-4">
            <Text className="text-light-primary-red bg-light-primary-red/10 font-bold text-center pb-2 border border-light-primary-red text-xs absolute -top-3 right-0 left-0 rounded-md p-2">
              Discount Rp.70,000
            </Text>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleRepurchase}
              className="bg-light-primary-red px-8 py-2 rounded-md mt-3"
            >
              <Text className="text-white text-xs font-bold">Repurchase</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  },
);

PurchaseCard.displayName = "PurchaseCard";

export default PurchaseCard;
