import {
  Bell,
  Clock,
  Gift,
  Info,
  Send,
  ShoppingBag,
  Trash2,
} from "lucide-react-native";
import React, { memo, useCallback } from "react";
import { Pressable, Text, TouchableOpacity, View } from "react-native";
import { Notification } from "@/hooks/notification/useNotificationState";

interface NotificationItemProps {
  notification: Notification;
  onMarkAsRead: (id: string) => void;
  onDelete: (id: string) => void;
}

const getNotificationIcon = (icon?: string) => {
  const iconProps = { size: 20, color: "#c71c4b" };
  switch (icon) {
    case "send":
      return <Send {...iconProps} />;
    case "shopping":
      return <ShoppingBag {...iconProps} />;
    case "gift":
      return <Gift {...iconProps} />;
    case "info":
      return <Info {...iconProps} />;
    default:
      return <Bell {...iconProps} />;
  }
};

export const NotificationItem = memo<NotificationItemProps>(
  ({ notification, onMarkAsRead, onDelete }) => {
    const handlePress = useCallback(() => {
      onMarkAsRead(notification.id);
    }, [notification.id, onMarkAsRead]);

    const handleDelete = useCallback(() => {
      onDelete(notification.id);
    }, [notification.id, onDelete]);

    return (
      <Pressable
        onPress={handlePress}
        className={`mx-4 mb-3 rounded-2xl overflow-hidden ${
          notification.isRead
            ? "bg-white"
            : "bg-white border-2 border-light-primary-red/20"
        }`}
        style={{
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: notification.isRead ? 0.05 : 0.1,
          shadowRadius: 8,
          elevation: notification.isRead ? 2 : 4,
        }}
      >
        <View className="flex-row items-start p-4">
          <View
            className={`w-10 h-10 rounded-full items-center justify-center mr-3 ${
              notification.isRead
                ? "bg-light-main-container"
                : "bg-light-primary-red/10"
            }`}
          >
            {getNotificationIcon(notification.icon)}
          </View>

          <View className="flex-1 mr-2">
            <View className="flex-row items-start justify-between mb-1">
              <Text
                className={`flex-1 text-base ${
                  notification.isRead
                    ? "text-light-matte-black/70 font-medium"
                    : "text-light-matte-black font-bold"
                }`}
              >
                {notification.title}
              </Text>
              {!notification.isRead && (
                <View className="w-2 h-2 rounded-full bg-light-primary-red ml-2 mt-1.5" />
              )}
            </View>

            <Text
              className={`text-sm mb-2 ${
                notification.isRead
                  ? "text-light-matte-black/50"
                  : "text-light-matte-black/70"
              }`}
              numberOfLines={2}
            >
              {notification.message}
            </Text>

            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center">
                <Clock size={12} color="#20222c40" />
                <Text className="text-xs text-light-matte-black/40 ml-1">
                  {notification.timestamp}
                </Text>
              </View>

              <TouchableOpacity
                onPress={handleDelete}
                className="p-1"
                activeOpacity={0.7}
              >
                <Trash2 size={16} color="#20222c40" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Pressable>
    );
  },
);

NotificationItem.displayName = "NotificationItem";
