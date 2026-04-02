import { useCallback, useMemo } from "react";
import useRQGlobalState from "@/hooks/useRQGlobalState";

export type NotificationType = "transaction" | "system" | "promotion";
export type NotificationCategory = "all" | NotificationType;

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: string;
  isRead: boolean;
  icon?: "send" | "shopping" | "gift" | "info" | "bell";
}

const NOTIFICATION_STATE_KEY = ["notification", "state"] as const;

interface NotificationState {
  notifications: Notification[];
  activeCategory: NotificationCategory;
}

const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: "1",
    type: "transaction",
    title: "Payment Successful",
    message: "Your payment of 0.05 ETH has been confirmed on Ethereum network.",
    timestamp: "2 min ago",
    isRead: false,
    icon: "send",
  },
  {
    id: "2",
    type: "transaction",
    title: "Purchase Completed",
    message: "Your purchase of Telkomsel 50GB package has been processed.",
    timestamp: "1 hour ago",
    isRead: false,
    icon: "shopping",
  },
  {
    id: "3",
    type: "promotion",
    title: "Special Offer!",
    message: "Get 20% cashback on all mobile data purchases this week.",
    timestamp: "3 hours ago",
    isRead: true,
    icon: "gift",
  },
  {
    id: "4",
    type: "system",
    title: "Security Update",
    message: "Your wallet security settings have been updated successfully.",
    timestamp: "1 day ago",
    isRead: true,
    icon: "info",
  },
  {
    id: "5",
    type: "transaction",
    title: "Transfer Received",
    message: "You received 0.1 ETH from 0x742d...3a4f",
    timestamp: "2 days ago",
    isRead: true,
    icon: "send",
  },
];

const initialState: NotificationState = {
  notifications: MOCK_NOTIFICATIONS,
  activeCategory: "all",
};

export function useNotificationState() {
  const { data: state, setNewData: setState } =
    useRQGlobalState<NotificationState>({
      queryKey: NOTIFICATION_STATE_KEY,
      initialData: initialState,
    });

  const notifications = state?.notifications ?? [];
  const activeCategory = state?.activeCategory ?? "all";

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.isRead).length,
    [notifications],
  );

  const filteredNotifications = useMemo(
    () =>
      activeCategory === "all"
        ? notifications
        : notifications.filter((n) => n.type === activeCategory),
    [notifications, activeCategory],
  );

  const getCategoryCount = useCallback(
    (category: NotificationCategory) =>
      category === "all"
        ? notifications.length
        : notifications.filter((n) => n.type === category).length,
    [notifications],
  );

  const setActiveCategory = useCallback(
    (category: NotificationCategory) => {
      setState({ notifications, activeCategory: category });
    },
    [notifications, setState],
  );

  const markAllAsRead = useCallback(() => {
    setState({
      activeCategory,
      notifications: notifications.map((n) => ({ ...n, isRead: true })),
    });
  }, [activeCategory, setState, notifications]);

  const markAsRead = useCallback(
    (id: string) => {
      setState({
        activeCategory,
        notifications: notifications.map((n) =>
          n.id === id ? { ...n, isRead: true } : n,
        ),
      });
    },
    [activeCategory, setState, notifications],
  );

  const deleteNotification = useCallback(
    (id: string) => {
      setState({
        activeCategory,
        notifications: notifications.filter((n) => n.id !== id),
      });
    },
    [activeCategory, setState, notifications],
  );

  return {
    notifications,
    activeCategory,
    unreadCount,
    filteredNotifications,
    getCategoryCount,
    setActiveCategory,
    markAllAsRead,
    markAsRead,
    deleteNotification,
  };
}
