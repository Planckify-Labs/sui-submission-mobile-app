import { Image } from "expo-image";
import * as WebBrowser from "expo-web-browser";
import {
  CheckCircle,
  Clock,
  Copy,
  CreditCard,
  ExternalLink,
  Link,
  Package,
  XCircle,
} from "lucide-react-native";
import { Text, TouchableOpacity, View } from "react-native";
import { formatUnits } from "viem";
import { TPurchaseResponse } from "@/api/types/purchase";
import { copyToClipboard } from "@/utils/helperUtils";
import AditionalInformationCard from "./AditionalInformationCard";

export default function PurchasedProductDetailCard({
  purchase,
}: {
  purchase: TPurchaseResponse;
}) {
  const openBlockchainExplorer = async (
    txHash: string,
    explorerUrl: string,
  ) => {
    const url = `${explorerUrl}/tx/${txHash}`;
    await WebBrowser.openBrowserAsync(url);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "COMPLETED":
      case "CONFIRMED":
        return <CheckCircle size={16} color="#10b981" />;
      case "PENDING":
        return <Clock size={16} color="#f59e0b" />;
      case "FAILED":
        return <XCircle size={16} color="#ef4444" />;
      default:
        return <Clock size={16} color="#6b7280" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "COMPLETED":
      case "CONFIRMED":
        return "text-emerald-600";
      case "PENDING":
        return "text-yellow-600";
      case "FAILED":
        return "text-red-600";
      default:
        return "text-gray-600";
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString("id-ID", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatCurrency = (amount: string, currency: string) => {
    const numAmount = parseFloat(amount);
    if (currency === "IDR") {
      return `Rp${numAmount.toLocaleString("id-ID")}`;
    }
    return `${currency} ${numAmount.toLocaleString()}`;
  };
  return (
    <View className="gap-4 p-4">
      <View className="bg-white rounded-2xl p-4 shadow-sm">
        <Text className="text-light-matte-black font-bold text-lg mb-4">
          Purchase Details
        </Text>

        <View className="bg-light-main-container/35 rounded-xl p-4 mb-4 border-l-4 border-light-primary-red">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-light-matte-black font-medium text-base">
              Purchase #{purchase.refId.slice(-8).toUpperCase()}
            </Text>
            <View className="flex-row items-center">
              {getStatusIcon(purchase.status)}
              <Text
                className={`ml-1 font-medium text-sm ${getStatusColor(purchase.status)}`}
              >
                {purchase.status}
              </Text>
            </View>
          </View>
          <View className="mt-3 space-y-1">
            <View>
              <Text className="text-light-matte-black/60 text-xs mb-1">
                Purchase ID
              </Text>
              <View className="flex-row items-center justify-between bg-white rounded-lg p-2">
                <Text
                  className="text-light-matte-black text-xs font-mono flex-1"
                  numberOfLines={1}
                >
                  {purchase.id}
                </Text>
                <TouchableOpacity
                  onPress={() => copyToClipboard(purchase.id, "Purchase ID")}
                  className="ml-2 p-1"
                >
                  <Copy size={12} color="#c71c4b" />
                </TouchableOpacity>
              </View>
            </View>
            <View>
              <Text className="text-light-matte-black/60 text-xs mb-1">
                Reference ID
              </Text>
              <View className="flex-row items-center justify-between bg-white rounded-lg p-2">
                <Text
                  className="text-light-matte-black text-xs font-mono flex-1"
                  numberOfLines={1}
                >
                  {purchase.refId}
                </Text>
                <TouchableOpacity
                  onPress={() =>
                    copyToClipboard(purchase.refId, "Reference ID")
                  }
                  className="ml-2 p-1"
                >
                  <Copy size={12} color="#c71c4b" />
                </TouchableOpacity>
              </View>
            </View>
            <View className="flex-row justify-between items-center">
              <Text className="text-light-matte-black/60 text-xs">
                Date & Time
              </Text>
              <Text className="text-light-matte-black text-xs">
                {formatDate(purchase.createdAt)}
              </Text>
            </View>
          </View>
        </View>

        <View className="bg-light-main-container/35 rounded-xl p-4 mb-4">
          <View className="flex-row items-center mb-3">
            <Package size={16} color="#c71c4b" />
            <Text className="text-light-matte-black font-medium text-sm ml-2">
              Item Details
            </Text>
          </View>

          <View className="space-y-2">
            <View className="flex-row justify-between items-start">
              <Text className="text-light-matte-black/60 text-sm flex-1">
                Product
              </Text>
              <Text className="text-light-matte-black text-sm font-medium flex-2 text-right">
                {purchase.productVariant.product.name}
              </Text>
            </View>

            <View className="flex-row justify-between items-start">
              <Text className="text-light-matte-black/60 text-sm flex-1">
                Variant
              </Text>
              <Text className="text-light-matte-black text-sm font-medium flex-2 text-right">
                {purchase.productVariant.name}
              </Text>
            </View>
          </View>
        </View>

        <View className="bg-light-main-container/35 rounded-xl p-4 mb-4">
          <View className="flex-row items-center mb-3">
            <CreditCard size={16} color="#c71c4b" />
            <Text className="text-light-matte-black font-medium text-sm ml-2">
              Payment Details
            </Text>
          </View>

          <View className="space-y-2">
            <View className="flex-row justify-between items-center">
              <Text className="text-light-matte-black/60 text-sm">
                Amount Paid
              </Text>
              <View className="flex-row items-center">
                <View className="w-5 h-5 rounded-full mr-2 items-center justify-center overflow-hidden">
                  <Image
                    source={{ uri: purchase.transaction.token.logoUrl }}
                    className="w-full h-full"
                    contentFit="cover"
                  />
                </View>
                <Text className="text-light-primary-red font-bold text-sm">
                  {formatUnits(
                    BigInt(purchase.transaction.amount),
                    purchase.transaction.token.decimals,
                  )}{" "}
                  {purchase.transaction.token.symbol}
                </Text>
              </View>
            </View>

            <View className="flex-row justify-between items-center">
              <Text className="text-light-matte-black/60 text-sm">
                Fiat Amount
              </Text>
              <Text className="text-light-matte-black text-sm font-medium">
                {formatCurrency(
                  purchase.transaction.amountInFiat,
                  purchase.transaction.fiatCurrency,
                )}
              </Text>
            </View>

            <View className="flex-row justify-between items-center">
              <Text className="text-light-matte-black/60 text-sm">Network</Text>
              <Text className="text-light-matte-black text-sm font-medium">
                {purchase.transaction.token.blockchain.name}
              </Text>
            </View>

            <View className="flex-row justify-between items-center">
              <Text className="text-light-matte-black/60 text-sm">
                Token Address
              </Text>
              <TouchableOpacity
                onPress={() =>
                  copyToClipboard(
                    purchase.transaction.token.contractAddress,
                    "Contract address",
                  )
                }
                className="flex-row items-center"
              >
                <Text className="text-light-matte-black text-sm font-mono mr-1">
                  {purchase.transaction.token.contractAddress.slice(0, 6)}...
                  {purchase.transaction.token.contractAddress.slice(-4)}
                </Text>
                <Copy size={12} color="#c71c4b" />
              </TouchableOpacity>
            </View>

            <View className="h-px bg-light-matte-black/10 my-2" />

            <View className="flex-row justify-between items-center">
              <Text className="text-light-matte-black font-medium">
                Transaction Status
              </Text>
              <View className="flex-row items-center">
                {getStatusIcon(purchase.transaction.status)}
                <Text
                  className={`ml-1 font-medium text-sm ${getStatusColor(purchase.transaction.status)}`}
                >
                  {purchase.transaction.status}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View className="bg-light-main-container/35 rounded-xl p-4">
          <View className="flex-row items-center mb-3">
            <Link size={16} color="#c71c4b" />
            <Text className="text-light-matte-black font-medium text-sm ml-2">
              Transaction Details
            </Text>
          </View>

          <View className="space-y-3">
            <View>
              <Text className="text-light-matte-black/60 text-xs mb-1">
                Transaction Hash
              </Text>
              <View className="flex-row items-center justify-between bg-white rounded-lg p-3">
                <Text
                  className="text-light-matte-black text-xs font-mono flex-1"
                  numberOfLines={1}
                >
                  {purchase.transaction.txHash}
                </Text>
                <View className="flex-row ml-2">
                  <TouchableOpacity
                    onPress={() =>
                      copyToClipboard(
                        purchase.transaction.txHash,
                        "Transaction hash",
                      )
                    }
                    className="mr-2 p-1"
                  >
                    <Copy size={14} color="#c71c4b" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() =>
                      openBlockchainExplorer(
                        purchase.transaction.txHash,
                        purchase.transaction.token.blockchain.blockExplorer,
                      )
                    }
                    className="p-1"
                  >
                    <ExternalLink size={14} color="#c71c4b" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <View>
              <Text className="text-light-matte-black/60 text-xs mb-1">
                From Address
              </Text>
              <View className="flex-row items-center justify-between bg-white rounded-lg p-3">
                <Text
                  className="text-light-matte-black text-xs font-mono flex-1"
                  numberOfLines={1}
                >
                  {purchase.transaction.senderAddress}
                </Text>
                <TouchableOpacity
                  onPress={() =>
                    copyToClipboard(
                      purchase.transaction.senderAddress,
                      "Sender address",
                    )
                  }
                  className="ml-2 p-1"
                >
                  <Copy size={14} color="#c71c4b" />
                </TouchableOpacity>
              </View>
            </View>
            <View>
              <Text className="text-light-matte-black/60 text-xs mb-1">
                To Address
              </Text>
              <View className="flex-row items-center justify-between bg-white rounded-lg p-3">
                <Text
                  className="text-light-matte-black text-xs font-mono flex-1"
                  numberOfLines={1}
                >
                  {purchase.transaction.recipientAddress}
                </Text>
                <TouchableOpacity
                  onPress={() =>
                    copyToClipboard(
                      purchase.transaction.recipientAddress,
                      "Recipient address",
                    )
                  }
                  className="ml-2 p-1"
                >
                  <Copy size={14} color="#c71c4b" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </View>

      {purchase.voucherCode && <AditionalInformationCard purchase={purchase} />}
    </View>
  );
}
