import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import {
  MoveRight,
  Send,
  ShoppingBag,
  Sparkles,
  Star,
  TrendingUp,
} from "lucide-react-native";
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { Image, Text, TouchableOpacity, View } from "react-native";
import { formatUnits } from "viem/utils";
import type { TRedemptionHistoryItem } from "@/api/types/redeem";
import { TTransaction } from "@/api/types/transaction";
import { useIsAuthenticated } from "@/hooks/queries/useAuth";
import { useRedemptionHistory } from "@/hooks/queries/useRedeem";
import { useTransactionHistory } from "@/hooks/queries/useTransactions";
import { useWallet } from "@/hooks/useWallet";
import { formatTokenAmount } from "@/utils/helperUtils";
import { truncateAddress } from "@/utils/walletUtils";
import OptimizedImage from "../../common/OptimizedImage";
import ActivitySkeleton from "./ActivitySkeleton";

export interface ActivitySectionRef {
  refetch: () => void;
}

const ActivitySection = forwardRef<ActivitySectionRef>((props, ref) => {
  const { activeWallet } = useWallet();
  const {
    isAuthenticated,
    isLoading: isAuthLoading,
    hadPreviousSession,
  } = useIsAuthenticated();
  const previousWalletAddress = useRef<string | undefined>(undefined);

  const shouldFetchTransactions = Boolean(
    isAuthenticated && !isAuthLoading && activeWallet?.address,
  );

  const { data: transferHistory, refetch: refetchTransferHistory } =
    useTransactionHistory(
      { type: "TRANSFER", take: 4 },
      { enabled: shouldFetchTransactions },
    );
  const { data: redemptionData, refetch: refetchRedemptionHistory } =
    useRedemptionHistory({ limit: 4 }, { enabled: shouldFetchTransactions });

  const redemptionHistory = redemptionData?.pages.flatMap((p) => p.data) ?? [];

  useImperativeHandle(ref, () => ({
    refetch: () => {
      refetchTransferHistory();
      refetchRedemptionHistory();
    },
  }));

  useEffect(() => {
    const currentWalletAddress = activeWallet?.address;

    if (
      currentWalletAddress &&
      previousWalletAddress.current !== undefined &&
      previousWalletAddress.current !== currentWalletAddress &&
      isAuthenticated &&
      !isAuthLoading
    ) {
      refetchTransferHistory();
      refetchRedemptionHistory();
    }

    previousWalletAddress.current = currentWalletAddress;
  }, [
    activeWallet?.address,
    isAuthenticated,
    isAuthLoading,
    refetchTransferHistory,
    refetchRedemptionHistory,
  ]);

  const redemptionHistoryButton = (item: TRedemptionHistoryItem) => (
    <TouchableOpacity
      activeOpacity={0.7}
      className="items-center"
      onPress={() =>
        router.push({
          pathname: "/activity-detail",
          params: { redemptionId: item.id },
        })
      }
    >
      <View className="relative">
        <View className="rounded-2xl border-2 p-0 border-light-matte-black w-16 aspect-square overflow-hidden bg-light-main-container items-center justify-center">
          {item.product.imageUrl ? (
            <Image
              source={{ uri: item.product.imageUrl }}
              style={{ width: "100%", height: "100%" }}
              resizeMode="cover"
            />
          ) : (
            <ShoppingBag size={24} color="#c71c4b" />
          )}
        </View>

        <View className="bg-light-primary-red aspect-square overflow-hidden w-5 rounded-full border border-white absolute -bottom-[4px] -right-[4px] items-center justify-center">
          <Star size={10} color="#fff" fill="#fff" />
        </View>
      </View>
      <Text
        className="text-[10px] text-center max-w-16 mt-2 font-semibold text-light-matte-black"
        numberOfLines={1}
      >
        {item.pointsSpent} points
      </Text>
    </TouchableOpacity>
  );

  const transferHistoryButton = (transfer: TTransaction) => (
    <TouchableOpacity
      activeOpacity={0.7}
      className="justify-center items-center"
      onPress={() =>
        router.push({
          pathname: "/activity-detail",
          params: {
            transferId: transfer.id,
          },
        })
      }
    >
      <View className="aspect-square w-full max-w-[70px] relative bg-light-primary-red/10 rounded-full items-center justify-center p-3">
        <Text className="text-light-primary-red font-bold text-lg">
          {(() => {
            try {
              console.log("transfer amount", transfer.amount);
              const formattedUnits = formatUnits(
                BigInt(transfer.amount),
                transfer.token.decimals,
              );
              return formatTokenAmount(formattedUnits);
            } catch (error) {
              console.warn("Error formatting transfer amount:", error);
              return "0";
            }
          })()}
        </Text>
        <Text className="text-light-matte-black font-bold text-xs">
          {transfer.token.symbol.length > 6
            ? transfer.token.symbol.slice(0, 6) + "…"
            : transfer.token.symbol}
        </Text>
        <View className="bg-light-main-container aspect-square w-4 overflow-hidden rounded-full border border-light-matte-black absolute bottom-0 right-[10px] items-center justify-center">
          <OptimizedImage
            source={{ uri: transfer.token.blockchain.tokens[0].logoUrl }}
            style={{ width: 14, height: 14 }}
            contentFit="contain"
          />
        </View>
        <View className="bg-light-main-container aspect-square overflow-hidden w-4 rounded-full border border-light-matte-black absolute bottom-[12px] right-0 items-center justify-center">
          <OptimizedImage
            source={{ uri: transfer.token.logoUrl }}
            style={{ width: 14, height: 14 }}
            contentFit="contain"
          />
        </View>
      </View>
      <Text className="text-light-matte-black text-center text-xs font-bold mt-1">
        {truncateAddress({ address: transfer.recipientAddress })}
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
          <ActivitySkeleton />
        </View>
      </View>
    );
  }

  // Only show the sign-in prompt for users who have never authenticated.
  // If they had a prior session but auth is uncertain (API down, server error),
  // show the skeleton — their data may still be accessible once the API recovers.
  if (!isAuthenticated && !hadPreviousSession) {
    return (
      <View className="px-4">
        <View className="bg-light rounded-[14px] w-full p-[22px] gap-4">
          <View className="flex-row">
            <Text className="text-light-matte-black text-sm">Activities</Text>
          </View>

          <View className="items-center py-10 px-4">
            <View className="mb-8 relative items-center justify-center h-32">
              <View className="absolute w-28 h-28 bg-light-primary-red/5 rounded-full" />
              <View className="absolute w-20 h-20 bg-light-primary-red/10 rounded-full" />

              <View className="absolute -top-2 -left-8 w-3 h-3 bg-light-primary-red/30 rounded-full" />
              <View className="absolute top-4 -right-10 w-2 h-2 bg-light-primary-red/40 rounded-full" />
              <View className="absolute -bottom-2 left-6 w-2.5 h-2.5 bg-light-primary-red/25 rounded-full" />

              <View
                className="bg-white w-24 h-24 rounded-3xl items-center justify-center border-2 border-light-primary-red/20"
                style={{
                  shadowColor: "#c71c4b",
                  shadowOffset: { width: 0, height: 8 },
                  shadowOpacity: 0.15,
                  shadowRadius: 20,
                  elevation: 10,
                }}
              >
                <View className="absolute inset-2 bg-light-primary-red/5 rounded-2xl" />

                <Image
                  source={require("@/assets/images/takumipay-no-bg.png")}
                  style={{ width: 60, height: 60 }}
                  resizeMode="contain"
                />
              </View>

              <View className="absolute -top-1 -right-6 w-5 h-5 bg-light-primary-red rounded-full border-[3px] border-light items-center justify-center">
                <View className="w-2 h-2 bg-white rounded-full" />
              </View>
            </View>

            <View className="items-center max-w-[280px] mb-8">
              <Text className="text-light-matte-black font-bold text-2xl mb-3 text-center">
                Welcome to your Takumi AI Wallet 🎉
              </Text>
              <Text className="text-light-matte-black/45 text-center text-sm leading-6">
                Sign in to unlock your activity timeline and track all your
                on-chain transactions
              </Text>
            </View>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => router.push("/auth")}
              className="bg-light-primary-red py-4 px-8 rounded-2xl flex-row items-center gap-3 mb-6"
              style={{
                shadowColor: "#c71c4b",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.2,
                shadowRadius: 12,
                elevation: 8,
              }}
            >
              <Text className="text-white font-bold text-base">
                Sign In With Ethereum
              </Text>
            </TouchableOpacity>

            <View className="gap-2.5 w-full">
              <View className="flex-row items-center gap-3 px-3 py-2.5 rounded-xl bg-light-main-container">
                <View className="bg-light-primary-red/10 p-1.5 rounded-lg">
                  <Sparkles color="#c71c4b" size={14} strokeWidth={2.5} />
                </View>
                <Text className="text-light-matte-black/55 text-xs flex-1 font-medium">
                  Secure & gasless authentication
                </Text>
              </View>

              <View className="flex-row items-center gap-3 px-3 py-2.5 rounded-xl bg-light-main-container">
                <View className="bg-light-primary-red/10 p-1.5 rounded-lg">
                  <TrendingUp color="#c71c4b" size={14} strokeWidth={2.5} />
                </View>
                <Text className="text-light-matte-black/55 text-xs flex-1 font-medium">
                  Track all your on-chain activity
                </Text>
              </View>
            </View>
          </View>
        </View>
      </View>
    );
  }

  // User had a session but auth check failed (API down / server error) — show skeleton
  // rather than the sign-in prompt. Cached data will appear once the query resolves.
  if (!isAuthenticated && hadPreviousSession) {
    return (
      <View className="px-4">
        <View className="bg-light rounded-[14px] w-full p-[22px] gap-4">
          <View className="flex-row">
            <Text className="text-light-matte-black text-sm">Activities</Text>
          </View>
          <ActivitySkeleton />
        </View>
      </View>
    );
  }

  const isNoTransactionHistory =
    transferHistory?.[0] === undefined && redemptionHistory.length === 0;
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
          {redemptionHistory.length > 0 && (
            <View>
              <FlashList
                data={redemptionHistory.slice(0, 4)}
                renderItem={({ item }) => redemptionHistoryButton(item)}
                keyExtractor={(item) => item.id}
                numColumns={4}
                showsVerticalScrollIndicator={false}
                showsHorizontalScrollIndicator={false}
              />
            </View>
          )}
          {transferHistory?.[0] !== undefined && (
            <View>
              <FlashList
                data={transferHistory || []}
                renderItem={({ item }) => transferHistoryButton(item)}
                keyExtractor={(item) => item.id}
                numColumns={4}
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

          <View className="py-8 px-5">
            <View className="items-center mb-8 relative h-32">
              <View className="absolute top-0 left-1/4 w-16 h-16 bg-light-primary-red/5 rounded-2xl rotate-12" />
              <View className="absolute top-4 right-1/4 w-12 h-12 bg-light-primary-red/8 rounded-xl -rotate-6" />

              <View className="absolute top-8 items-center">
                <View
                  className="bg-light rounded-3xl p-6 border-2 border-light-primary-red/20"
                  style={{
                    shadowColor: "#c71c4b",
                    shadowOffset: { width: 0, height: 8 },
                    shadowOpacity: 0.12,
                    shadowRadius: 16,
                    elevation: 8,
                  }}
                >
                  <View className="flex-row items-center gap-3">
                    <View className="bg-light-primary-red/10 p-3 rounded-2xl">
                      <ShoppingBag color="#c71c4b" size={28} strokeWidth={2} />
                    </View>
                    <View className="w-px h-10 bg-light-matte-black/10" />
                    <View className="bg-light-primary-red/10 p-3 rounded-2xl">
                      <Send color="#c71c4b" fill="#c71c4b" size={28} />
                    </View>
                  </View>
                </View>
              </View>
            </View>

            <View className="items-center mb-8 mt-4">
              <Text className="text-light-matte-black font-bold text-2xl mb-3 text-center">
                No Activity Yet
              </Text>
              <Text className="text-light-matte-black/45 text-center text-sm leading-6 max-w-[260px]">
                Start your journey by redeeming with points or sending crypto
              </Text>
            </View>

            <View className="flex-row gap-3 mb-6">
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => router.push("/service")}
                className="flex-1 bg-light-primary-red rounded-2xl p-4 items-center"
                style={{
                  shadowColor: "#c71c4b",
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.15,
                  shadowRadius: 8,
                  elevation: 5,
                }}
              >
                <View className="bg-white/20 p-2.5 rounded-xl mb-2">
                  <ShoppingBag color="#ffffff" size={20} strokeWidth={2.5} />
                </View>
                <Text className="text-white font-bold text-sm">
                  Redemptions
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => router.push("/send")}
                className="flex-1 bg-light-matte-black rounded-2xl p-4 items-center"
                style={{
                  shadowColor: "#20222c",
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.15,
                  shadowRadius: 8,
                  elevation: 5,
                }}
              >
                <View className="bg-white/10 p-2.5 rounded-xl mb-2">
                  <Send color="#ffffff" size={20} fill="#ffffff" />
                </View>
                <Text className="text-white font-bold text-sm">Transfer</Text>
              </TouchableOpacity>
            </View>

            <View className="gap-2.5">
              <View className="flex-row items-center gap-3 px-3 py-2.5 rounded-xl bg-light-main-container">
                <View className="bg-light-primary-red/10 p-1.5 rounded-lg">
                  <TrendingUp color="#c71c4b" size={14} strokeWidth={2.5} />
                </View>
                <Text className="text-light-matte-black/55 text-xs flex-1 font-medium">
                  Track all transactions in real-time
                </Text>
              </View>

              <View className="flex-row items-center gap-3 px-3 py-2.5 rounded-xl bg-light-main-container">
                <View className="bg-light-primary-red/10 p-1.5 rounded-lg">
                  <Sparkles color="#c71c4b" size={14} strokeWidth={2.5} />
                </View>
                <Text className="text-light-matte-black/55 text-xs flex-1 font-medium">
                  Instant on-chain activity updates
                </Text>
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  );
});

ActivitySection.displayName = "ActivitySection";

export default ActivitySection;
