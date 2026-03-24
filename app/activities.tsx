import { FlashList } from "@shopify/flash-list";
import { BlurView } from "expo-blur";
import { useRouter } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Dimensions,
  FlatList,
  RefreshControl,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import type { TRedemptionHistoryItem } from "@/api/types/redeem";
import type { TTransaction } from "@/api/types/transaction";
import ActivityHeader from "@/components/activities/ActivityHeader";
import PurchaseCard from "@/components/activities/PurchaseCard";
import PurchaseCardSkeleton from "@/components/activities/PurchaseCardSkeleton";
import TransferCard from "@/components/activities/TransferCard";
import TransferCardSkeleton from "@/components/activities/TransferCardSkeleton";
import LoadinngSpinnerPopup from "@/components/common/LoadinngSpinnerPopup";
import { useIsAuthenticated } from "@/hooks/queries/useAuth";
import { useRedemptionHistory } from "@/hooks/queries/useRedeem";
import { useTransactionHistory } from "@/hooks/queries/useTransactions";

type RedemptionListItem = TRedemptionHistoryItem | { id: string };
type TransferListItem = TTransaction | { id: string };

const SKELETON_DATA = Array.from({ length: 5 }).map((_, index) => ({
  id: `skeleton-${index}`,
}));

const CONTENT_CONTAINER_STYLE = {
  paddingHorizontal: 16,
  paddingVertical: 70,
};

const ItemSeparator = React.memo(() => <View className="h-4" />);

const SkeletonSeparator = React.memo(() => <View className="h-4" />);

const { width } = Dimensions.get("window");

const EmptyState = React.memo(
  ({ type }: { type: "redemptions" | "transfers" }) => (
    <View className="flex-1 items-center justify-center px-4">
      <Text className="text-light-matte-black/50 text-lg text-center font-medium mb-2">
        No {type} history
      </Text>
      <Text className="text-light-matte-black/30 text-center">
        {type === "redemptions"
          ? "You haven't redeemed anything yet"
          : "You haven't made any transfers yet"}
      </Text>
    </View>
  ),
);

export default function ActivitiesScreen() {
  const router = useRouter();
  const { isAuthenticated, isLoading: isAuthLoading } = useIsAuthenticated();
  const [activeActivity, setActiveActivity] = useState<
    "redemptions" | "transfers"
  >("redemptions");
  const horizontalScrollRef = useRef<FlatList>(null);

  useEffect(() => {
    if (isAuthenticated === false && !isAuthLoading) {
      router.replace("/auth");
    }
  }, [isAuthenticated, isAuthLoading, router]);

  const {
    data: transfersData,
    isLoading: isTransfersLoading,
    refetch: refetchTransfers,
  } = useTransactionHistory({ type: "TRANSFER" });

  const {
    data: redemptionsData,
    isLoading: isRedemptionsLoading,
    refetch: refetchRedemptions,
    fetchNextPage: fetchMoreRedemptions,
    hasNextPage: hasMoreRedemptions,
    isFetchingNextPage: isFetchingMoreRedemptions,
  } = useRedemptionHistory(undefined, { enabled: isAuthenticated === true });

  const flatRedemptions = useMemo(
    () => redemptionsData?.pages.flatMap((page) => page.data) ?? [],
    [redemptionsData],
  );

  const tabIndicatorPosition = useRef(
    new Animated.Value(activeActivity === "redemptions" ? 1 : 0),
  ).current;

  const horizontalScrollX = useRef(
    new Animated.Value(activeActivity === "redemptions" ? width : 0),
  ).current;

  const currentTabIndex = useRef(activeActivity === "redemptions" ? 1 : 0);

  const renderPurchaseItem = useCallback(
    ({ item }: { item: RedemptionListItem }) => {
      if (isRedemptionsLoading) return <PurchaseCardSkeleton />;
      if (!("pointsSpent" in item)) return null;
      return <PurchaseCard item={item} />;
    },
    [isRedemptionsLoading],
  );

  const renderTransferItem = useCallback(
    ({ item }: { item: TransferListItem }) => {
      if (isTransfersLoading) return <TransferCardSkeleton />;
      if (!("type" in item)) return null;
      return <TransferCard transaction={item} />;
    },
    [isTransfersLoading],
  );

  const keyExtractor = useCallback((item: RedemptionListItem | TransferListItem) => {
    return item.id;
  }, []);

  const searchPlaceholder = useMemo(
    () => `search ${activeActivity === "redemptions" ? "redemptions" : "transfers"}...`,
    [activeActivity],
  );

  const handleTabChange = useCallback(
    (newTab: "redemptions" | "transfers") => {
      if (newTab !== activeActivity) {
        setActiveActivity(newTab);

        Animated.spring(tabIndicatorPosition, {
          toValue: newTab === "redemptions" ? 1 : 0,
          tension: 70,
          friction: 10,
          useNativeDriver: true,
        }).start();

        const indexToScroll = newTab === "redemptions" ? 1 : 0;
        horizontalScrollRef.current?.scrollToIndex({
          index: indexToScroll,
          animated: true,
        });
      }
    },
    [activeActivity, tabIndicatorPosition],
  );

  const scrollY = useRef(new Animated.Value(0)).current;

  const searchBarOpacity = scrollY.interpolate({
    inputRange: [50, 150],
    outputRange: [1, 0.2],
    extrapolate: "clamp",
  });

  const redemptionShouldShowEmpty = useMemo(
    () => !isRedemptionsLoading && flatRedemptions.length === 0,
    [isRedemptionsLoading, flatRedemptions.length],
  );

  const transferShouldShowEmpty = useMemo(
    () => !isTransfersLoading && (!transfersData || transfersData.length === 0),
    [isTransfersLoading, transfersData],
  );

  const handleLoadMoreRedemptions = useCallback(() => {
    if (hasMoreRedemptions && !isFetchingMoreRedemptions) {
      fetchMoreRedemptions();
    }
  }, [hasMoreRedemptions, isFetchingMoreRedemptions, fetchMoreRedemptions]);

  const PurchaseList = useMemo(() => {
    const data: RedemptionListItem[] = isRedemptionsLoading
      ? SKELETON_DATA
      : flatRedemptions;
    const SeparatorComponent = isRedemptionsLoading
      ? SkeletonSeparator
      : ItemSeparator;

    return (
      <FlashList<RedemptionListItem>
        data={data}
        keyExtractor={keyExtractor}
        renderItem={renderPurchaseItem}
        ItemSeparatorComponent={SeparatorComponent}
        showsVerticalScrollIndicator={false}

        contentContainerStyle={
          redemptionShouldShowEmpty ? { flex: 1 } : CONTENT_CONTAINER_STYLE
        }
        ListEmptyComponent={
          redemptionShouldShowEmpty ? <EmptyState type="redemptions" /> : null
        }
        removeClippedSubviews={true}
        onEndReached={handleLoadMoreRedemptions}
        onEndReachedThreshold={0.3}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false },
        )}
        refreshControl={
          <RefreshControl
            refreshing={isRedemptionsLoading}
            onRefresh={refetchRedemptions}
            tintColor="#c71c4b"
            colors={["#c71c4b"]}
          />
        }
      />
    );
  }, [
    isRedemptionsLoading,
    flatRedemptions,
    keyExtractor,
    renderPurchaseItem,
    redemptionShouldShowEmpty,
    refetchRedemptions,
    scrollY,
    handleLoadMoreRedemptions,
  ]);

  const TransferList = useMemo(() => {
    const data: TransferListItem[] = isTransfersLoading
      ? SKELETON_DATA
      : (transfersData ?? []);
    const SeparatorComponent = isTransfersLoading
      ? SkeletonSeparator
      : ItemSeparator;

    return (
      <FlashList<TransferListItem>
        data={data}
        keyExtractor={keyExtractor}
        renderItem={renderTransferItem}
        ItemSeparatorComponent={SeparatorComponent}
        showsVerticalScrollIndicator={false}

        contentContainerStyle={
          transferShouldShowEmpty ? { flex: 1 } : CONTENT_CONTAINER_STYLE
        }
        ListEmptyComponent={
          transferShouldShowEmpty ? <EmptyState type="transfers" /> : null
        }
        removeClippedSubviews={true}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false },
        )}
        refreshControl={
          <RefreshControl
            refreshing={isTransfersLoading}
            onRefresh={refetchTransfers}
            tintColor="#c71c4b"
            colors={["#c71c4b"]}
          />
        }
      />
    );
  }, [
    isTransfersLoading,
    transfersData,
    keyExtractor,
    renderTransferItem,
    transferShouldShowEmpty,
    refetchTransfers,
    scrollY,
  ]);

  const renderTabContent = useCallback(
    ({ index }: { index: number }) => {
      return (
        <View style={{ width }}>
          {index === 0 ? TransferList : PurchaseList}
        </View>
      );
    },
    [TransferList, PurchaseList],
  );

  const handleHorizontalScroll = useCallback(
    (event: any) => {
      const contentOffsetX = event.nativeEvent.contentOffset.x;
      const newIndex = Math.round(contentOffsetX / width);

      if (currentTabIndex.current !== newIndex) {
        currentTabIndex.current = newIndex;
        setActiveActivity(newIndex === 0 ? "transfers" : "redemptions");

        Animated.spring(tabIndicatorPosition, {
          toValue: newIndex,
          tension: 70,
          friction: 10,
          useNativeDriver: true,
        }).start();
      }
    },
    [tabIndicatorPosition],
  );

  const handleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { x: horizontalScrollX } } }],
    { useNativeDriver: false },
  );

  const { bottom } = useSafeAreaInsets();
  const bottomOffset = bottom > 0 ? bottom + 8 : 8;

  const TabButtons = () => (
    <View
      style={{ paddingBottom: bottomOffset }}
      className="bottom-0 absolute left-0 right-0"
    >
      <BlurView
        intensity={30}
        experimentalBlurMethod="dimezisBlurView"
        className="overflow-hidden rounded-full mx-4 border-4 border-light-main-container/80"
      >
        <View className="bg-mainborder-light-main-container/10 w-full flex-row items-center justify-evenly relative">
          <TouchableOpacity
            onPress={() => handleTabChange("transfers")}
            activeOpacity={0.7}
            className="px-8 py-2 items-center justify-center grow"
          >
            <Text
              className={`${activeActivity !== "redemptions" ? "text-light-primary-red/75" : "text-light-matte-black/50"} text-center font-bold`}
            >
              Transfers
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleTabChange("redemptions")}
            activeOpacity={0.7}
            className="px-8 py-2 items-center justify-center grow"
          >
            <Text
              className={`${activeActivity === "redemptions" ? "text-light-primary-red/75" : "text-light-matte-black/50"} text-center font-bold`}
            >
              Redemptions
            </Text>
          </TouchableOpacity>

          <Animated.View
            className="absolute bottom-0 h-1 bg-light-primary-red/75 left-0 right-0 rounded-t-md"
            style={{
              width: "50%",
              transform: [
                {
                  translateX: horizontalScrollX.interpolate({
                    inputRange: [0, width],
                    outputRange: [0, width / 2],
                    extrapolate: "clamp",
                  }),
                },
              ],
            }}
          />
        </View>
      </BlurView>
    </View>
  );

  return (
    <>
      <StatusBar barStyle="dark-content" />
      {!isAuthenticated ? (
        <LoadinngSpinnerPopup
          visible={true}
          title="Authentication"
          message="Checking authentication..."
        />
      ) : (
        <SafeAreaView
          className="flex-1 bg-light-main-container relative"
          edges={["top"]}
          style={{ paddingBottom: bottomOffset }}
        >
          <View className="flex-1 relative">
            <ActivityHeader
              placeholder={searchPlaceholder}
              searchBarOpacity={searchBarOpacity}
            />
            <FlatList
              ref={horizontalScrollRef}
              data={[{ id: "transfers" }, { id: "redemptions" }]}
              renderItem={renderTabContent}
              keyExtractor={(item) => item.id}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              initialScrollIndex={activeActivity === "redemptions" ? 1 : 0}
              getItemLayout={(_, index) => ({
                length: width,
                offset: width * index,
                index,
              })}
              onMomentumScrollEnd={handleHorizontalScroll}
              onScroll={handleScroll}
              scrollEventThrottle={16}
            />
          </View>
          <TabButtons />
        </SafeAreaView>
      )}
    </>
  );
}
