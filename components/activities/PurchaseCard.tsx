import { useRouter } from "expo-router";
import { ShoppingBag } from "lucide-react-native";
import React, { useCallback } from "react";
import { Image, Text, TouchableOpacity, View } from "react-native";
import type {
  TRedemptionHistoryItem,
  TRedemptionStatus,
} from "@/api/types/redeem";
import { formatDate } from "@/utils/dateUtils";
import Chip from "../common/Chip";

const STATUS_CHIP: Record<
  TRedemptionStatus,
  { label: string; color: string; bg: string }
> = {
  PENDING: {
    label: "Pending",
    color: "#b45309",
    bg: "rgba(245, 158, 11, 0.1)",
  },
  PROCESSING: {
    label: "Processing",
    color: "#1d4ed8",
    bg: "rgba(59, 130, 246, 0.1)",
  },
  COMPLETED: {
    label: "Completed",
    color: "#047857",
    bg: "rgba(16, 185, 129, 0.1)",
  },
  FAILED: {
    label: "Failed",
    color: "#dc2626",
    bg: "rgba(239, 68, 68, 0.1)",
  },
  REFUNDED: {
    label: "Refunded",
    color: "#1d4ed8",
    bg: "rgba(59, 130, 246, 0.1)",
  },
};

const PurchaseCard = React.memo(
  ({ item }: { item: TRedemptionHistoryItem }) => {
    const router = useRouter();

    const handleRepurchase = useCallback(
      (event: any) => {
        event.stopPropagation();
        router.push({
          pathname: "/purchase-item",
          params: { productId: item.product.id },
        });
      },
      [router, item.product.id],
    );

    const handleCardPress = useCallback(() => {
      router.push({
        pathname: "/activity-detail",
        params: { redemptionId: item.id },
      });
    }, [router, item.id]);

    const chip = STATUS_CHIP[item.status];

    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={handleCardPress}
        className="bg-white rounded-xl shadow-sm w-full p-5 gap-3"
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <View className="bg-light-main-container p-2 rounded-md">
              <ShoppingBag size={18} stroke="#c71c4b" />
            </View>
            <View>
              <Text className="text-light-matte-black font-medium text-sm">
                Redemption
              </Text>
              <Text className="text-light-matte-black/50 text-xs">
                {formatDate({ date: item.createdAt, preset: "short" })}
              </Text>
            </View>
          </View>
          <Chip
            label={chip.label}
            color={chip.color}
            backgroundColor={chip.bg}
            size="small"
          />
        </View>

        <View className="flex-row items-center gap-3">
          <View className="w-12 h-12 rounded-md bg-light-main-container overflow-hidden items-center justify-center">
            {item.product.imageUrl ? (
              <Image
                source={{ uri: item.product.imageUrl }}
                className="w-full h-full"
                resizeMode="cover"
              />
            ) : (
              <ShoppingBag size={20} color="#c71c4b" />
            )}
          </View>
          <View className="flex-1">
            <Text
              className="text-black font-semibold"
              ellipsizeMode="tail"
              numberOfLines={1}
            >
              {item.product.variant.name}
            </Text>
            <Text
              className="text-light-matte-black/50 text-xs"
              numberOfLines={1}
            >
              {item.product.name}
            </Text>
            {item.vendorRefId && (
              <Text
                className="text-light-matte-black/40 text-xs"
                numberOfLines={1}
              >
                Ref: {item.vendorRefId}
              </Text>
            )}
          </View>
        </View>

        <View className="flex-row items-center justify-between border-t pt-2 border-gray-200">
          <View>
            <Text className="text-light-matte-black text-xs">Points Spent</Text>
            <Text className="text-light-primary-red font-bold text-md">
              {Number(item.pointsSpent).toLocaleString()} points
            </Text>
          </View>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleRepurchase}
            className="bg-light-primary-red px-8 py-4 rounded-md mt-3"
          >
            <Text className="text-white text-xs font-bold">Redeem Again</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  },
);

PurchaseCard.displayName = "PurchaseCard";

export default PurchaseCard;
