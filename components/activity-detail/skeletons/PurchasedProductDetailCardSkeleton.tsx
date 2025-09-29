import React from "react";
import { View } from "react-native";
import SingleLoadingSekeleton from "@/components/common/SingleLoadingSekeleton";

export default function PurchasedProductDetailCardSkeleton() {
  return (
    <View className="gap-4 p-4">
      <View className="bg-white rounded-2xl p-4 shadow-sm">
        <View className="mb-4">
          <SingleLoadingSekeleton width={140} height={24} borderRadius={6} />
        </View>

        <View className="bg-light-main-container/35 rounded-xl p-4 mb-4 border-l-4 border-light-primary-red">
          <View className="flex-row items-center justify-between mb-2">
            <SingleLoadingSekeleton width={120} height={18} borderRadius={4} />
            <View className="flex-row items-center">
              <SingleLoadingSekeleton width={16} height={16} borderRadius={8} />
              <View className="ml-1">
                <SingleLoadingSekeleton
                  width={80}
                  height={14}
                  borderRadius={4}
                />
              </View>
            </View>
          </View>

          <View className="mt-3 space-y-1">
            <View>
              <View className="mb-1">
                <SingleLoadingSekeleton
                  width={80}
                  height={12}
                  borderRadius={3}
                />
              </View>
              <View className="flex-row items-center justify-between bg-white rounded-lg p-2">
                <SingleLoadingSekeleton
                  width={200}
                  height={12}
                  borderRadius={3}
                />
                <SingleLoadingSekeleton
                  width={12}
                  height={12}
                  borderRadius={6}
                />
              </View>
            </View>
            <View>
              <View className="mb-1">
                <SingleLoadingSekeleton
                  width={90}
                  height={12}
                  borderRadius={3}
                />
              </View>
              <View className="flex-row items-center justify-between bg-white rounded-lg p-2">
                <SingleLoadingSekeleton
                  width={180}
                  height={12}
                  borderRadius={3}
                />
                <SingleLoadingSekeleton
                  width={12}
                  height={12}
                  borderRadius={6}
                />
              </View>
            </View>
            <View className="flex-row justify-between items-center">
              <SingleLoadingSekeleton width={80} height={12} borderRadius={3} />
              <SingleLoadingSekeleton
                width={140}
                height={12}
                borderRadius={3}
              />
            </View>
          </View>
        </View>

        <View className="bg-light-main-container/35 rounded-xl p-4 mb-4">
          <View className="flex-row items-center mb-3">
            <SingleLoadingSekeleton width={16} height={16} borderRadius={8} />
            <View className="ml-2">
              <SingleLoadingSekeleton width={90} height={14} borderRadius={4} />
            </View>
          </View>

          <View className="space-y-2">
            <View className="flex-row justify-between items-start">
              <SingleLoadingSekeleton width={60} height={14} borderRadius={4} />
              <SingleLoadingSekeleton
                width={120}
                height={14}
                borderRadius={4}
              />
            </View>
            <View className="flex-row justify-between items-start">
              <SingleLoadingSekeleton width={50} height={14} borderRadius={4} />
              <SingleLoadingSekeleton
                width={100}
                height={14}
                borderRadius={4}
              />
            </View>
          </View>
        </View>

        <View className="bg-light-main-container/35 rounded-xl p-4 mb-4">
          <View className="flex-row items-center mb-3">
            <SingleLoadingSekeleton width={16} height={16} borderRadius={8} />
            <View className="ml-2">
              <SingleLoadingSekeleton
                width={110}
                height={14}
                borderRadius={4}
              />
            </View>
          </View>

          <View className="space-y-2">
            <View className="flex-row justify-between items-center">
              <SingleLoadingSekeleton width={80} height={14} borderRadius={4} />
              <View className="flex-row items-center">
                <SingleLoadingSekeleton
                  width={20}
                  height={20}
                  borderRadius={10}
                />
                <View className="ml-2">
                  <SingleLoadingSekeleton
                    width={100}
                    height={14}
                    borderRadius={4}
                  />
                </View>
              </View>
            </View>

            <View className="flex-row justify-between items-center">
              <SingleLoadingSekeleton width={80} height={14} borderRadius={4} />
              <SingleLoadingSekeleton width={90} height={14} borderRadius={4} />
            </View>

            <View className="flex-row justify-between items-center">
              <SingleLoadingSekeleton width={60} height={14} borderRadius={4} />
              <SingleLoadingSekeleton width={80} height={14} borderRadius={4} />
            </View>

            <View className="flex-row justify-between items-center">
              <SingleLoadingSekeleton
                width={100}
                height={14}
                borderRadius={4}
              />
              <View className="flex-row items-center">
                <SingleLoadingSekeleton
                  width={80}
                  height={14}
                  borderRadius={4}
                />
                <View className="ml-1">
                  <SingleLoadingSekeleton
                    width={12}
                    height={12}
                    borderRadius={6}
                  />
                </View>
              </View>
            </View>

            <View className="h-px bg-light-matte-black/10 my-2" />

            <View className="flex-row justify-between items-center">
              <SingleLoadingSekeleton
                width={120}
                height={14}
                borderRadius={4}
              />
              <View className="flex-row items-center">
                <SingleLoadingSekeleton
                  width={16}
                  height={16}
                  borderRadius={8}
                />
                <View className="ml-1">
                  <SingleLoadingSekeleton
                    width={80}
                    height={14}
                    borderRadius={4}
                  />
                </View>
              </View>
            </View>
          </View>
        </View>

        <View className="bg-light-main-container/35 rounded-xl p-4">
          <View className="flex-row items-center mb-3">
            <SingleLoadingSekeleton width={16} height={16} borderRadius={8} />
            <View className="ml-2">
              <SingleLoadingSekeleton
                width={130}
                height={14}
                borderRadius={4}
              />
            </View>
          </View>

          <View className="space-y-3">
            <View>
              <View className="mb-1">
                <SingleLoadingSekeleton
                  width={120}
                  height={12}
                  borderRadius={3}
                />
              </View>
              <View className="flex-row items-center justify-between bg-white rounded-lg p-3">
                <SingleLoadingSekeleton
                  width={220}
                  height={12}
                  borderRadius={3}
                />
                <View className="flex-row ml-2">
                  <SingleLoadingSekeleton
                    width={14}
                    height={14}
                    borderRadius={7}
                  />
                  <View className="ml-2">
                    <SingleLoadingSekeleton
                      width={14}
                      height={14}
                      borderRadius={7}
                    />
                  </View>
                </View>
              </View>
            </View>

            <View>
              <View className="mb-1">
                <SingleLoadingSekeleton
                  width={90}
                  height={12}
                  borderRadius={3}
                />
              </View>
              <View className="flex-row items-center justify-between bg-white rounded-lg p-3">
                <SingleLoadingSekeleton
                  width={200}
                  height={12}
                  borderRadius={3}
                />
                <SingleLoadingSekeleton
                  width={14}
                  height={14}
                  borderRadius={7}
                />
              </View>
            </View>

            <View>
              <View className="mb-1">
                <SingleLoadingSekeleton
                  width={80}
                  height={12}
                  borderRadius={3}
                />
              </View>
              <View className="flex-row items-center justify-between bg-white rounded-lg p-3">
                <SingleLoadingSekeleton
                  width={200}
                  height={12}
                  borderRadius={3}
                />
                <SingleLoadingSekeleton
                  width={14}
                  height={14}
                  borderRadius={7}
                />
              </View>
            </View>
          </View>
        </View>
      </View>

      <View className="bg-white rounded-2xl p-4 shadow-sm">
        <View className="flex-row items-center mb-3">
          <SingleLoadingSekeleton width={16} height={16} borderRadius={8} />
          <View className="ml-2">
            <SingleLoadingSekeleton width={140} height={14} borderRadius={4} />
          </View>
        </View>
        <View className="bg-light-main-container/35 rounded-xl p-4">
          <SingleLoadingSekeleton width="100%" height={40} borderRadius={8} />
        </View>
      </View>
    </View>
  );
}
