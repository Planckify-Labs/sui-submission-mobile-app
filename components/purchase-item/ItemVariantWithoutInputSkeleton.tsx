import SingleLoadingSekeleton from "@/components/common/SingleLoadingSekeleton";
import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";

const styles = StyleSheet.create({
  marginBottom6: {
    marginBottom: 24,
  },
  marginBottom4: {
    marginBottom: 16,
  },
  marginBottom3: {
    marginBottom: 12,
  },
  marginBottom2: {
    marginBottom: 8,
  },
  marginRight4: {
    marginRight: 16,
  },
});

export default function ItemVariantWithoutInputSkeleton() {
  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <View className="flex-1 p-6">
        {/* Header */}
        <View className="flex-row items-center mb-6">
          <View className="mr-4">
            <SingleLoadingSekeleton width={24} height={24} borderRadius={12} />
          </View>
          <SingleLoadingSekeleton width={200} height={28} />
        </View>

        {/* Product Image */}
        <View className="h-56 w-full bg-light rounded-xl overflow-hidden mb-6 shadow-sm">
          <SingleLoadingSekeleton width="100%" height="100%" />
        </View>

        {/* Options Section */}
        <View className="bg-light rounded-xl p-5 mb-6 shadow-sm">
          <SingleLoadingSekeleton width={100} height={24} style={styles.marginBottom4} />
          <View className="flex-row flex-wrap justify-between">
            {[1, 2, 3, 4].map((i) => (
              <View key={i} className="w-[48%] mb-3">
                <SingleLoadingSekeleton width="100%" height={120} />
              </View>
            ))}
          </View>
        </View>

        {/* Item Details */}
        <View className="bg-light rounded-xl p-5 mb-6 shadow-sm">
          <SingleLoadingSekeleton width={120} height={24} style={styles.marginBottom4} />
          <View className="flex-row mb-4">
            <SingleLoadingSekeleton width={80} height={80} style={styles.marginRight4} />
            <View className="flex-1 justify-center">
              <SingleLoadingSekeleton width="80%" height={24} style={styles.marginBottom2} />
              <SingleLoadingSekeleton width="100%" height={40} />
            </View>
          </View>

          {/* Info Box */}
          <View className="bg-light-primary-red/10 p-4 rounded-xl mb-4">
            <View className="flex-row items-start">
              <SingleLoadingSekeleton width={18} height={18} style={styles.marginRight4} />
              <SingleLoadingSekeleton width="90%" height={40} />
            </View>
          </View>

          {/* Details List */}
          <View className="border-t border-light-matte-black/10 pt-4 mt-2">
            {[1, 2, 3].map((i) => (
              <View key={i} className="flex-row justify-between mb-2">
                <SingleLoadingSekeleton width={80} height={20} />
                <SingleLoadingSekeleton width={120} height={20} />
              </View>
            ))}
          </View>
        </View>

        {/* Bottom Button */}
        <SingleLoadingSekeleton width="100%" height={56} borderRadius={28} />
      </View>
    </ScrollView>
  );
} 