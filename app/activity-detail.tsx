import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ActivityDetailHeader from "@/components/activity-detail/ActivityDetailHeader";
import RenderActivityDetailCards from "@/components/activity-detail/RenderActivityDetailCards";
import PurchasedProductHeading from "@/components/activity-detail/render-activity-detail-cards/PurchasedProductHeading";
import TransferDetailHeading from "@/components/activity-detail/render-activity-detail-cards/TransferDetailHeading";
import PurchasedProductDetailCardSkeleton from "@/components/activity-detail/skeletons/PurchasedProductDetailCardSkeleton";
import PurchasedProductHeadingSkeleton from "@/components/activity-detail/skeletons/PurchasedProductHeadingSkeleton";
import TransferDetailCardSkeleton from "@/components/activity-detail/skeletons/TransferDetailCardSkeleton";
import TransferDetailHeadingSkeleton from "@/components/activity-detail/skeletons/TransferDetailHeadingSkeleton";
import { usePurchaseById } from "@/hooks/queries/usePurchases";
import { useTransaction } from "@/hooks/queries/useTransactions";

export default function ActivityDetailScreen() {
  const { purchaseId, transferId } = useLocalSearchParams<{
    purchaseId: string;
    transferId: string;
  }>();

  const [isInitialized, setIsInitialized] = useState(false);

  const {
    data: purchase,
    isLoading: isPurchaseLoading,
    error: purchaseError,
  } = usePurchaseById(purchaseId);

  const {
    data: transfer,
    isLoading: isTransferLoading,
    error: transferError,
  } = useTransaction(transferId);

  useEffect(() => {
    const initializeComponent = () => {
      if (purchaseId) {
        console.log("Fetching purchase data for ID:", purchaseId);
      }
      if (transferId) {
        console.log("Fetching transfer data for ID:", transferId);
      }
      setIsInitialized(true);
    };

    initializeComponent();
  }, [purchaseId, transferId]);

  const isLoading = isPurchaseLoading || isTransferLoading || !isInitialized;
  const hasError = purchaseError || transferError;
  const activityData = purchase || transfer;

  const handleSharePress = () => {
    Alert.alert("Share", "Share receipt functionality coming soon!");
  };

  const handleHelpPress = () => {
    Alert.alert("Help", "Need help with this transaction? Contact support.");
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
        >
          {purchaseId ? (
            <>
              <PurchasedProductHeadingSkeleton />
              <PurchasedProductDetailCardSkeleton />
            </>
          ) : (
            <>
              <TransferDetailHeadingSkeleton />
              <TransferDetailCardSkeleton />
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
            {purchaseError?.message ||
              transferError?.message ||
              "An error occurred while loading the activity details."}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!activityData) {
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

  return (
    <SafeAreaView className="flex-1 bg-light-main-container">
      <ActivityDetailHeader
        title="Activity Detail"
        subtitle={purchase ? "Purchase Information" : "Transfer Information"}
        onSharePress={handleSharePress}
        onHelpPress={handleHelpPress}
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 20 }}
        showsVerticalScrollIndicator={false}
      >
        {(purchase || transfer) && (
          <>
            {purchase && <PurchasedProductHeading purchase={purchase} />}
            {transfer && <TransferDetailHeading transfer={transfer} />}
            <RenderActivityDetailCards
              purchase={purchase}
              transfer={transfer}
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
