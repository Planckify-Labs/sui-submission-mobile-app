import { Send } from "lucide-react-native";
import React from "react";
import { Image, Text, View } from "react-native";
import { formatUnits } from "viem";
import { TTransaction } from "@/api/types/transaction";
import OptimizedImage from "@/components/common/OptimizedImage";

interface TransferDetailHeadingProps {
  transfer: TTransaction;
}

export default function TransferDetailHeading({
  transfer,
}: TransferDetailHeadingProps) {
  const formatAmount = () => {
    return formatUnits(BigInt(transfer.amount), transfer.token.decimals);
  };
  return (
    <View className="items-center mb-6">
      <View className="w-24 h-24 rounded-3xl mb-4 overflow-hidden bg-light-main-container">
        {transfer.token?.logoUrl ? (
          <OptimizedImage
            source={{ uri: transfer.token.logoUrl }}
            contentFit="contain"
          />
        ) : (
          <View className="w-full h-full items-center justify-center">
            <View className="bg-light-primary-red p-4 rounded-2xl">
              <Send size={24} fill="#c71c4b" color="#c71c4b" />
            </View>
          </View>
        )}
      </View>

      <Text className="text-light-primary-red font-extrabold text-2xl text-center">
        {formatAmount()} {transfer.token?.symbol}
      </Text>
      <Text className="text-light-matte-black/70 text-base mb-3 text-center font-medium">
        Transfer Amount
      </Text>
      {transfer.amountInFiat && (
        <Text className="text-light-matte-black/70 text-sm mb-3 text-center">
          ≈ {transfer.fiatCurrency} {transfer.amountInFiat}
        </Text>
      )}
    </View>
  );
}
