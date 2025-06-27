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
  marginX5: {
    marginHorizontal: 20,
  },
  marginBottom3AndX5: {
    marginBottom: 12,
    marginHorizontal: 20,
  },
});

export default function ItemVariantWithInputSkeleton() {
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

        {/* Input Section */}
        <View className="bg-light rounded-xl py-5 mb-6 shadow-sm">
          <View className="mb-6 px-5">
            <SingleLoadingSekeleton width={150} height={20} style={styles.marginBottom2} />
            <View className="bg-light-main-container p-4 rounded-xl flex-row items-center justify-between">
              <View className="flex-1">
                <SingleLoadingSekeleton width="80%" height={28} style={styles.marginBottom2} />
                <SingleLoadingSekeleton width={100} height={16} />
              </View>
              <SingleLoadingSekeleton width={32} height={32} />
            </View>
          </View>

          {/* Info Box */}
          <View className="bg-light-primary-red/10 p-4 mx-5 rounded-xl mb-6">
            <View className="flex-row items-center">
              <SingleLoadingSekeleton width={18} height={18} style={styles.marginRight4} />
              <SingleLoadingSekeleton width="80%" height={20} />
            </View>
          </View>

          {/* Recent Numbers */}
          <View>
            <SingleLoadingSekeleton width={150} height={20} style={styles.marginBottom3AndX5} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-2">
              <View className="mx-5 flex-row gap-2">
                {[1, 2, 3].map((i) => (
                  <SingleLoadingSekeleton key={i} width={120} height={48} style={styles.marginRight4} />
                ))}
              </View>
            </ScrollView>
          </View>
        </View>

        {/* Options Section */}
        <View className="bg-light rounded-xl p-5 mb-6 shadow-sm">
          <SingleLoadingSekeleton width={150} height={24} style={styles.marginBottom4} />
          <View className="flex-row flex-wrap justify-between">
            {[1, 2, 3, 4].map((i) => (
              <View key={i} className="w-[48%] mb-3">
                <SingleLoadingSekeleton width="100%" height={120} />
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