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
import type { TTransaction } from "@/api/types/transaction";
import ActivityHeader from "@/components/activities/ActivityHeader";
import PurchaseCard from "@/components/activities/PurchaseCard";
import PurchaseCardSkeleton from "@/components/activities/PurchaseCardSkeleton";
import TransferCard from "@/components/activities/TransferCard";
import TransferCardSkeleton from "@/components/activities/TransferCardSkeleton";
import LoadinngSpinnerPopup from "@/components/common/LoadinngSpinnerPopup";
import { useIsAuthenticated } from "@/hooks/queries/useAuth";
import { useTransactionHistory } from "@/hooks/queries/useTransactions";

type ListItem = TTransaction | { id: string };

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
  ({ type }: { type: "purchase" | "transfers" }) => (
    <View className="flex-1 items-center justify-center px-4">
      <Text className="text-light-matte-black/50 text-lg text-center font-medium mb-2">
        No {type} history
      </Text>
      <Text className="text-light-matte-black/30 text-center">
        {type === "purchase"
          ? "You haven't made any purchases yet"
          : "You haven't made any transfers yet"}
      </Text>
    </View>
  ),
);

export default function ActivitiesScreen() {
  const router = useRouter();
  const { isAuthenticated, isLoading: isAuthLoading } = useIsAuthenticated();
  const [activeActivity, setActiveActivity] = useState<
    "purchase" | "transfers"
  >("purchase");
  const horizontalScrollRef = useRef<FlatList>(null);

  useEffect(() => {
    if (isAuthenticated === false && !isAuthLoading) {
      router.replace("/auth");
    }
  }, [isAuthenticated, isAuthLoading, router]);

  const {
    data: transactions,
    isLoading: isTransactionsLoading,
    refetch,
  } = useTransactionHistory({
    type: activeActivity === "purchase" ? "PAYMENT" : "TRANSFER",
  });

  const tabIndicatorPosition = useRef(
    new Animated.Value(activeActivity === "purchase" ? 1 : 0),
  ).current;

  const horizontalScrollX = useRef(
    new Animated.Value(activeActivity === "purchase" ? width : 0),
  ).current;

  const currentTabIndex = useRef(activeActivity === "purchase" ? 1 : 0);

  const renderPurchaseItem = useCallback(
    ({ item }: { item: ListItem }) => {
      if (isTransactionsLoading) return <PurchaseCardSkeleton />;
      if (!("type" in item)) return null;
      return <PurchaseCard transaction={item} />;
    },
    [isTransactionsLoading],
  );

  const renderTransferItem = useCallback(
    ({ item }: { item: ListItem }) => {
      if (isTransactionsLoading) return <TransferCardSkeleton />;
      if (!("type" in item)) return null;
      return <TransferCard transaction={item} />;
    },
    [isTransactionsLoading],
  );

  const keyExtractor = useCallback((item: ListItem) => {
    if ("type" in item) {
      return item.id;
    }
    return item.id;
  }, []);

  const searchPlaceholder = useMemo(
    () => `search ${activeActivity}...`,
    [activeActivity],
  );

  const handleTabChange = useCallback(
    (newTab: "purchase" | "transfers") => {
      if (newTab !== activeActivity) {
        setActiveActivity(newTab);

        Animated.spring(tabIndicatorPosition, {
          toValue: newTab === "purchase" ? 1 : 0,
          tension: 70,
          friction: 10,
          useNativeDriver: true,
        }).start();

        const indexToScroll = newTab === "purchase" ? 1 : 0;
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

  const filteredTransactions = useMemo(() => {
    if (!transactions || isTransactionsLoading) return [];
    return transactions;
  }, [transactions, isTransactionsLoading]);

  const shouldShowEmptyState = useMemo(() => {
    return !isTransactionsLoading && filteredTransactions.length === 0;
  }, [isTransactionsLoading, filteredTransactions.length]);

  const PurchaseList = useMemo(() => {
    const data = isTransactionsLoading ? SKELETON_DATA : filteredTransactions;
    const SeparatorComponent = isTransactionsLoading
      ? SkeletonSeparator
      : ItemSeparator;

    const contentStyle = {
      ...CONTENT_CONTAINER_STYLE,
    };

    return (
      <FlashList<ListItem>
        data={data}
        keyExtractor={keyExtractor}
        renderItem={renderPurchaseItem}
        ItemSeparatorComponent={SeparatorComponent}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={contentStyle}
        ListEmptyComponent={
          shouldShowEmptyState ? <EmptyState type="purchase" /> : null
        }
        removeClippedSubviews={true}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false },
        )}
        refreshControl={
          <RefreshControl
            refreshing={isTransactionsLoading}
            onRefresh={refetch}
            tintColor="#c71c4b"
            colors={["#c71c4b"]}
          />
        }
      />
    );
  }, [
    isTransactionsLoading,
    filteredTransactions,
    keyExtractor,
    renderPurchaseItem,
    shouldShowEmptyState,
    refetch,
    scrollY,
  ]);

  const TransferList = useMemo(() => {
    const data = isTransactionsLoading ? SKELETON_DATA : filteredTransactions;
    const SeparatorComponent = isTransactionsLoading
      ? SkeletonSeparator
      : ItemSeparator;

    const contentStyle = {
      ...CONTENT_CONTAINER_STYLE,
    };

    return (
      <FlashList<ListItem>
        data={data}
        keyExtractor={keyExtractor}
        renderItem={renderTransferItem}
        ItemSeparatorComponent={SeparatorComponent}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={contentStyle}
        ListEmptyComponent={
          shouldShowEmptyState ? <EmptyState type="transfers" /> : null
        }
        removeClippedSubviews={true}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false },
        )}
        refreshControl={
          <RefreshControl
            refreshing={isTransactionsLoading}
            onRefresh={refetch}
            tintColor="#c71c4b"
            colors={["#c71c4b"]}
          />
        }
      />
    );
  }, [
    isTransactionsLoading,
    filteredTransactions,
    keyExtractor,
    renderTransferItem,
    shouldShowEmptyState,
    refetch,
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
        setActiveActivity(newIndex === 0 ? "transfers" : "purchase");

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

  const TabButtons = useMemo(
    () => (
      <BlurView
        intensity={30}
        experimentalBlurMethod="dimezisBlurView"
        className="overflow-hidden rounded-full absolute left-0 right-0 mx-4 border-4 border-light-main-container/80"
        style={{ bottom: 16 + bottomOffset }}
      >
        <View className="bg-mainborder-light-main-container/10 w-full flex-row items-center justify-evenly relative">
          <TouchableOpacity
            onPress={() => handleTabChange("transfers")}
            activeOpacity={0.7}
            className="px-8 py-2 items-center justify-center grow"
          >
            <Text
              className={`${activeActivity !== "purchase" ? "text-light-primary-red/75" : "text-light-matte-black/50"} text-center font-bold`}
            >
              Transfers
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleTabChange("purchase")}
            activeOpacity={0.7}
            className="px-8 py-2 items-center justify-center grow"
          >
            <Text
              className={`${activeActivity === "purchase" ? "text-light-primary-red/75" : "text-light-matte-black/50"} text-center font-bold`}
            >
              Purchase
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
    ),
    [activeActivity, handleTabChange, horizontalScrollX],
  );

  const { bottom } = useSafeAreaInsets();
  const bottomOffset = bottom > 0 ? bottom + 8 : 8;
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
              data={[{ id: "transfers" }, { id: "purchase" }]}
              renderItem={renderTabContent}
              keyExtractor={(item) => item.id}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              initialScrollIndex={activeActivity === "purchase" ? 1 : 0}
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
          {TabButtons}
        </SafeAreaView>
      )}
    </>
  );
}
