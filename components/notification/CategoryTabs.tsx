import React, { memo } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { NotificationCategory } from "@/hooks/notification/useNotificationState";

interface Category {
  id: NotificationCategory;
  label: string;
}

const CATEGORIES: Category[] = [
  { id: "all", label: "All" },
  { id: "transaction", label: "Transactions" },
  { id: "system", label: "System" },
  { id: "promotion", label: "Promotions" },
];

interface CategoryTabsProps {
  activeCategory: NotificationCategory;
  onCategoryChange: (category: NotificationCategory) => void;
  getCategoryCount: (category: NotificationCategory) => number;
}

export const CategoryTabs = memo<CategoryTabsProps>(
  ({ activeCategory, onCategoryChange, getCategoryCount }) => {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="flex-row mt-4"
        contentContainerStyle={{ gap: 8 }}
      >
        {CATEGORIES.map((category) => {
          const isActive = activeCategory === category.id;
          const count = getCategoryCount(category.id);

          return (
            <TouchableOpacity
              key={category.id}
              onPress={() => onCategoryChange(category.id)}
              className={`px-4 py-2 rounded-full ${
                isActive
                  ? "bg-light-primary-red"
                  : "bg-white border border-light-matte-black/10"
              }`}
              activeOpacity={0.7}
            >
              <View className="flex-row items-center">
                <Text
                  className={`font-medium text-sm ${
                    isActive ? "text-white" : "text-light-matte-black/70"
                  }`}
                >
                  {category.label}
                </Text>
                {count > 0 && (
                  <View
                    className={`ml-2 px-2 py-0.5 rounded-full ${
                      isActive ? "bg-white/20" : "bg-light-matte-black/10"
                    }`}
                  >
                    <Text
                      className={`text-xs font-bold ${
                        isActive ? "text-white" : "text-light-matte-black/70"
                      }`}
                    >
                      {count}
                    </Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    );
  },
);

CategoryTabs.displayName = "CategoryTabs";
