import { TTransaction } from "@/api/types/transaction";
import { useIsAuthenticated } from "@/hooks/queries/useAuth";
import { useTransactionSearch } from "@/hooks/queries/useTransactions";
import { useWallet } from "@/hooks/useWallet";
import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import { MoveRight, Wallet2 } from "lucide-react-native";
import React from "react";
import { Image, Text, TouchableOpacity, View } from "react-native";
import { formatUnits } from "viem/utils";
import OptimizedImage from "../common/OptimizedImage";

export default function ActivitySection() {
  const { activeWallet } = useWallet();
  const { isAuthenticated, isLoading: isAuthLoading } = useIsAuthenticated();

  const shouldFetchTransactions = Boolean(
    isAuthenticated && !isAuthLoading && activeWallet?.address,
  );

  const { data: transferHistory } = useTransactionSearch(
    {
      type: "TRANSFER",
      senderAddress: activeWallet?.address,
    },
    { enabled: shouldFetchTransactions },
  );
  const { data: paymentHistory } = useTransactionSearch(
    {
      type: "PAYMENT",
      senderAddress: activeWallet?.address,
    },
    { enabled: shouldFetchTransactions },
  );

  const purchaseHistoryButton = (payment: TTransaction) => (
    <TouchableOpacity activeOpacity={0.7} className="items-center">
      <View className="rounded-2xl border-2 p-0 border-light-matte-black w-16 aspect-square overflow-hidden bg-light-main-container">
        <OptimizedImage
          source={{ uri: payment.purchase?.productVariant.product.imageUrl }}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
        />
      </View>
      <Text className="text-[10px] text-center text-wrap max-w-16 mt-1">
        {payment.purchase?.productVariant.name}
      </Text>
    </TouchableOpacity>
  );

  const transferHistoryButton = (transfer: TTransaction) => (
    <TouchableOpacity
      activeOpacity={0.7}
      className="justify-center items-center"
    >
      <View className="aspect-square w-full max-w-[70px] relative bg-light-primary-red/10 rounded-full items-center justify-center p-3">
        <Text className="text-light-matte-black font-bold text-xs">
          {formatUnits(BigInt(transfer.amount), transfer.token.decimals)}{" "}
          {transfer.token.symbol}
        </Text>
        <View className="bg-light-main-container aspect-square w-6 rounded-full absolute bottom-0 right-0 items-center justify-center" />
      </View>
      <Text className="text-light-matte-black text-center text-xs font-bold mt-1">
        {transfer.recipientAddress}
      </Text>
    </TouchableOpacity>
  );

  if (isAuthLoading) {
    return (
      <View className="px-4">
        <View className="bg-light rounded-[14px] w-full p-[22px] gap-4">
          <View className="flex-row">
            <Text className="text-light-matte-black text-sm">Activities</Text>
          </View>
          <View className="items-center py-8">
            <View className="bg-light-primary-red/10 p-4 rounded-full mb-4">
              <Wallet2 color="#c71c4b" size={32} />
            </View>
            <Text className="text-light-matte-black/70 text-center">
              Loading...
            </Text>
          </View>
        </View>
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <View className="px-4">
        <View className="bg-light rounded-[14px] w-full p-[22px] gap-4">
          <View className="flex-row">
            <Text className="text-light-matte-black text-sm">Activities</Text>
          </View>

          <View className="items-center py-12">
            <View className="relative mb-6">
              <View className="bg-light-primary-red/5 w-24 h-24 rounded-full items-center justify-center">
                <View className="bg-light-primary-red/10 w-20 h-20 rounded-full items-center justify-center">
                  <View className="bg-light-primary-red/10 w-20 h-20 rounded-full relative">
                    <Image
                      source={require("@/assets/images/takumipay-no-bg.png")}
                      style={{ width: 40, height: 40 }}
                      resizeMode="contain"
                      className="absolute top-[15px] left-[14px]"
                    />
                  </View>
                </View>
              </View>
              <View className="absolute -top-1 -right-1 w-3 h-3 bg-light-primary-red rounded-full" />
            </View>

            <View className="items-center max-w-72">
              <Text className="text-light-matte-black font-bold text-xl mb-3 text-center">
                Welcome to your Takumi Wallet! 🎉
              </Text>
              <Text className="text-light-matte-black/60 text-center text-base leading-6 mb-8">
                Sign In with your wallet to see all your onchain activities in
                one place
              </Text>
            </View>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => router.push("/auth")}
              className="bg-light-primary-red py-4 px-8 rounded-2xl flex-row items-center gap-3 shadow-sm"
              style={{
                shadowColor: "#c71c4b",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.15,
                shadowRadius: 12,
                elevation: 8,
              }}
            >
              <Wallet2 color="#ffffff" size={20} strokeWidth={2} />
              <Text className="text-white font-bold text-base">
                Sign In With Ethereum
              </Text>
            </TouchableOpacity>

            <View className="flex-row items-center mt-6 px-4 py-3 bg-light-main-container rounded-xl">
              <View className="bg-light-primary-red/10 p-2 rounded-full mr-3">
                <Wallet2 color="#c71c4b" size={14} />
              </View>
              <Text className="text-light-matte-black/50 text-xs flex-1">
                Secure authentication • No gas fees required
              </Text>
            </View>
          </View>
        </View>
      </View>
    );
  }
  const isNoTransactionHistory =
    transferHistory?.[0] === undefined && paymentHistory?.[0] === undefined;
  return (
    <View className="px-4">
      {!isNoTransactionHistory ? (
        <View className="bg-light rounded-[14px] w-full p-[22px] gap-4">
          <View className="flex-row">
            <Text className="text-light-matte-black text-sm">Activities</Text>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => router.push("/activities")}
              className="flex-row items-center justify-center border-2 ml-auto border-light-primary-red bg-light-primary-red/10 gap-2 rounded-full px-4 py-1"
            >
              <Text className="text-light-matte-black text-sm font-bold">
                View All
              </Text>

              <MoveRight size={20} color="#c71c4b" />
            </TouchableOpacity>
          </View>
          {paymentHistory?.[0] !== undefined && (
            <View>
              <FlashList
                data={paymentHistory?.slice(0, 4) || []}
                renderItem={({ item }) => purchaseHistoryButton(item)}
                keyExtractor={(item) => item.id}
                numColumns={4}
                estimatedItemSize={4}
                showsVerticalScrollIndicator={false}
                showsHorizontalScrollIndicator={false}
              />
            </View>
          )}
          {transferHistory?.[0] !== undefined && (
            <View>
              <FlashList
                data={transferHistory?.slice(0, 4) || []}
                renderItem={({ item }) => transferHistoryButton(item)}
                keyExtractor={(item) => item.id}
                numColumns={4}
                estimatedItemSize={4}
                showsVerticalScrollIndicator={false}
                showsHorizontalScrollIndicator={false}
              />
            </View>
          )}
        </View>
      ) : (
        <View className="bg-light rounded-[14px] w-full p-[22px] gap-4">
          <View className="flex-row">
            <Text className="text-light-matte-black text-sm">Activities</Text>
          </View>

          <View className="items-center py-10">
            <View className="relative mb-5">
              <View className="bg-light-primary-red/5 w-24 h-24 rounded-full items-center justify-center">
                <View className="bg-light-primary-red/10 w-20 h-20 rounded-full relative">
                  <Image
                    source={require("@/assets/images/takumipay-no-bg.png")}
                    style={{ width: 40, height: 40 }}
                    resizeMode="contain"
                    className="absolute top-[15px] left-[14px]"
                  />
                </View>
              </View>
              <View className="absolute -top-1 -right-1 w-3 h-3 bg-light-primary-red rounded-full" />
            </View>

            <Text className="text-light-matte-black font-semibold text-base">
              No activity yet
            </Text>
            <Text className="text-light-matte-black/60 text-center text-sm mt-1 px-4">
              Your transfers and purchases will appear here.
            </Text>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.push("/send")}
              className="bg-light-primary-red px-5 py-3 rounded-2xl flex-row items-center gap-2 mt-6 shadow-sm"
              style={{
                shadowColor: "#c71c4b",
                shadowOffset: { width: 0, height: 3 },
                shadowOpacity: 0.12,
                shadowRadius: 10,
                elevation: 6,
              }}
            >
              <MoveRight color="#ffffff" size={18} />
              <Text className="text-white font-bold text-sm">
                Make your first transfer
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}
