import { FlashList } from "@shopify/flash-list";
import React, { useCallback } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  CategoryTabs,
  EmptyState,
  NotificationHeader,
  NotificationItem,
} from "@/components/notification";
import {
  Notification,
  useNotificationState,
} from "@/hooks/notification/useNotificationState";

export default function NotificationScreen() {
  const {
    activeCategory,
    unreadCount,
    filteredNotifications,
    getCategoryCount,
    setActiveCategory,
    markAllAsRead,
    markAsRead,
    deleteNotification,
  } = useNotificationState();

  const renderItem = useCallback(
    ({ item }: { item: Notification }) => (
      <NotificationItem
        notification={item}
        onMarkAsRead={markAsRead}
        onDelete={deleteNotification}
      />
    ),
    [markAsRead, deleteNotification],
  );

  const keyExtractor = useCallback((item: Notification) => item.id, []);

  return (
    <SafeAreaView className="flex-1 bg-light-main-container">
      <View className="px-4 pb-4 bg-light-main-container">
        <NotificationHeader
          unreadCount={unreadCount}
          onMarkAllAsRead={markAllAsRead}
        />
        <CategoryTabs
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
          getCategoryCount={getCategoryCount}
        />
      </View>

      <FlashList
        data={filteredNotifications}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 20 }}
        ListEmptyComponent={EmptyState}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}
