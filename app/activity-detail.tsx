import { useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ActivityDetailHeader from "@/components/activity-detail/ActivityDetailHeader";
import RenderActivityDetailCards from "@/components/activity-detail/RenderActivityDetailCards";
import PurchasedProductHeading from "@/components/activity-detail/render-activity-detail-cards/PurchasedProductHeading";
import TransferDetailHeading from "@/components/activity-detail/render-activity-detail-cards/TransferDetailHeading";
import PurchasedProductDetailCardSkeleton from "@/components/activity-detail/skeletons/PurchasedProductDetailCardSkeleton";
import PurchasedProductHeadingSkeleton from "@/components/activity-detail/skeletons/PurchasedProductHeadingSkeleton";
import TransferDetailCardSkeleton from "@/components/activity-detail/skeletons/TransferDetailCardSkeleton";
import TransferDetailHeadingSkeleton from "@/components/activity-detail/skeletons/TransferDetailHeadingSkeleton";
import { useRedemptionById } from "@/hooks/queries/useRedeem";
import { usePurchaseById } from "@/hooks/queries/usePurchases";
import { useTransaction } from "@/hooks/queries/useTransactions";

export default function ActivityDetailScreen() {
  const { purchaseId, transferId, redemptionId } = useLocalSearchParams<{
    purchaseId: string;
    transferId: string;
    redemptionId: string;
  }>();

  const {
    data: redemption,
    isLoading: isRedemptionLoading,
    error: redemptionError,
    refetch: refetchRedemption,
  } = useRedemptionById(redemptionId ?? null);

  const {
    data: purchase,
    isLoading: isPurchaseLoading,
    error: purchaseError,
    refetch: refetchPurchase,
  } = usePurchaseById(purchaseId);

  const {
    data: transfer,
    isLoading: isTransferLoading,
    error: transferError,
    refetch: refetchTransfer,
  } = useTransaction(transferId);

  const [isRefetchingActivityDetail, setIsRefetchingActivityDetail] =
    useState(false);

  const isLoading =
    (isRedemptionLoading && !!redemptionId) ||
    (isPurchaseLoading && !!purchaseId) ||
    (isTransferLoading && !!transferId);

  const hasError = redemptionError || purchaseError || transferError;

  const handleSharePress = () => {
    console.log("Share: Share receipt functionality coming soon!");
  };

  const handleHelpPress = () => {
    console.log("Help: Need help with this transaction? Contact support.");
  };

  const onRefresh = async () => {
    setIsRefetchingActivityDetail(true);
    try {
      if (redemptionId) await refetchRedemption();
      if (purchaseId) await refetchPurchase();
      if (transferId) await refetchTransfer();
    } catch (error) {
      console.error("Error refreshing activity detail:", error);
    } finally {
      setIsRefetchingActivityDetail(false);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-light-main-container">
        <ActivityDetailHeader
          title="Activity Detail"
          subtitle="Loading..."
          onSharePress={handleSharePress}
          onHelpPress={handleHelpPress}
        />
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 20 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetchingActivityDetail}
              onRefresh={onRefresh}
            />
          }
        >
          {transferId ? (
            <>
              <TransferDetailHeadingSkeleton />
              <TransferDetailCardSkeleton />
            </>
          ) : (
            <>
              <PurchasedProductHeadingSkeleton />
              <PurchasedProductDetailCardSkeleton />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (hasError) {
    return (
      <SafeAreaView className="flex-1 bg-light-main-container">
        <ActivityDetailHeader
          title="Activity Detail"
          subtitle="Error"
          onSharePress={handleSharePress}
          onHelpPress={handleHelpPress}
        />
        <View className="flex-1 justify-center items-center px-6">
          <Text className="text-red-500 text-lg font-semibold mb-2">
            Failed to load activity
          </Text>
          <Text className="text-light-matte-black text-center">
            {redemptionError?.message ||
              purchaseError?.message ||
              transferError?.message ||
              "An error occurred while loading the activity details."}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!redemption && !purchase && !transfer) {
    return (
      <SafeAreaView className="flex-1 bg-light-main-container">
        <ActivityDetailHeader
          title="Activity Detail"
          subtitle="Not Found"
          onSharePress={handleSharePress}
          onHelpPress={handleHelpPress}
        />
        <View className="flex-1 justify-center items-center px-6">
          <Text className="text-light-matte-black text-lg font-semibold mb-2">
            Activity not found
          </Text>
          <Text className="text-light-matte-black text-center">
            The requested activity could not be found. Please check the ID and
            try again.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const subtitle = redemption
    ? "Redemption Information"
    : purchase
      ? "Purchase Information"
      : "Transfer Information";

  return (
    <SafeAreaView className="flex-1 bg-light-main-container">
      <ActivityDetailHeader
        title="Activity Detail"
        subtitle={subtitle}
        onSharePress={handleSharePress}
        onHelpPress={handleHelpPress}
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 20 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetchingActivityDetail}
            onRefresh={onRefresh}
          />
        }
      >
        {redemption && <PurchasedProductHeading redemption={redemption} />}
        {purchase && <PurchasedProductHeading purchase={purchase} />}
        {transfer && <TransferDetailHeading transfer={transfer} />}
        <RenderActivityDetailCards
          purchase={purchase}
          transfer={transfer}
          redemption={redemption}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
