import React from "react";
import { View } from "react-native";
import SingleLoadingSekeleton from "@/components/common/SingleLoadingSekeleton";

export default function TransferDetailCardSkeleton() {
  return (
    <View className="mt-4">
      <View className="bg-gradient-to-r from-light-main-container to-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <View className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <View className="flex-row items-center justify-between mb-4">
            <View className="flex-row items-center gap-3">
              <View className="bg-light-primary-red/10 p-3 pr-[13.5px] pt-[14px] rounded-2xl shadow-sm">
                <SingleLoadingSekeleton
                  width={24}
                  height={24}
                  borderRadius={12}
                />
              </View>
              <View className="flex-1">
                <SingleLoadingSekeleton
                  width={140}
                  height={24}
                  borderRadius={6}
                />
                <View className="h-1 bg-light-primary-red/20 rounded-full mt-1 w-16" />
              </View>
            </View>
          </View>

          <View className="flex-row items-center gap-2 mb-4 bg-light-main-container/50 p-3 rounded-xl">
            <SingleLoadingSekeleton width={16} height={16} borderRadius={8} />
            <SingleLoadingSekeleton width={120} height={14} borderRadius={4} />
          </View>

          <View className="flex-row justify-between items-center mb-4 pt-2 border-t border-gray-100">
            <SingleLoadingSekeleton width={140} height={12} borderRadius={3} />
            <View className="flex-row space-x-1">
              <View className="w-2 h-2 bg-light-primary-red/30 rounded-full" />
              <View className="w-2 h-2 bg-light-primary-red/50 rounded-full" />
              <View className="w-2 h-2 bg-light-primary-red rounded-full" />
            </View>
          </View>

          <View className="mb-4">
            <View className="mb-2">
              <SingleLoadingSekeleton
                width={120}
                height={14}
                borderRadius={4}
              />
            </View>
            <View className="flex-row items-center gap-2 bg-light-main-container p-3 rounded-xl">
              <SingleLoadingSekeleton
                width={200}
                height={14}
                borderRadius={4}
              />
              <SingleLoadingSekeleton width={16} height={16} borderRadius={8} />
              <SingleLoadingSekeleton width={16} height={16} borderRadius={8} />
            </View>
          </View>

          <View className="space-y-4 mb-6">
            <View>
              <View className="flex-row items-center gap-2 mb-2">
                <SingleLoadingSekeleton
                  width={100}
                  height={14}
                  borderRadius={4}
                />
              </View>
              <View className="flex-row items-center gap-2 bg-light-main-container p-4 rounded-xl">
                <SingleLoadingSekeleton
                  width={160}
                  height={14}
                  borderRadius={4}
                />
                <SingleLoadingSekeleton
                  width={16}
                  height={16}
                  borderRadius={8}
                />
              </View>
            </View>

            <View>
              <View className="flex-row items-center gap-2 mb-2">
                <SingleLoadingSekeleton
                  width={110}
                  height={14}
                  borderRadius={4}
                />
              </View>
              <View className="flex-row items-center gap-2 p-4 rounded-xl bg-light-main-container">
                <SingleLoadingSekeleton
                  width={160}
                  height={14}
                  borderRadius={4}
                />
                <SingleLoadingSekeleton
                  width={16}
                  height={16}
                  borderRadius={8}
                />
              </View>
            </View>
          </View>

          <View className="border-t border-gray-100 pt-4">
            <View className="flex-row justify-between items-center mb-2">
              <SingleLoadingSekeleton width={50} height={14} borderRadius={4} />
              <SingleLoadingSekeleton
                width={120}
                height={14}
                borderRadius={4}
              />
            </View>

            <View className="flex-row justify-between items-center">
              <SingleLoadingSekeleton width={60} height={14} borderRadius={4} />
              <SingleLoadingSekeleton width={80} height={14} borderRadius={4} />
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}
