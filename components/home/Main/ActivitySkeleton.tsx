import React from "react";
import { View } from "react-native";
import SingleLoadingSekeleton from "../../common/SingleLoadingSekeleton";

const ActivitySkeleton = () => (
  <View className="gap-4">
    <View className="flex-row gap-4">
      {[1, 2, 3, 4].map((i) => (
        <View key={`purchase-skeleton-${i}`} className="items-center flex-1">
          <View className="relative">
            <SingleLoadingSekeleton
              width={64}
              height={64}
              borderRadius={16}
              style={{ backgroundColor: "#D0D0D0" }}
            />
            <View className="absolute -bottom-[5px] right-[10px] bg-light-main-container rounded-full border border-light-matte-black/10">
              <SingleLoadingSekeleton
                width={12}
                height={12}
                borderRadius={8}
                style={{ backgroundColor: "#E8E8E8" }}
              />
            </View>
            <View className="absolute bottom-0 -right-[5px] bg-light-main-container rounded-full border border-light-matte-black/10">
              <SingleLoadingSekeleton
                width={12}
                height={12}
                borderRadius={8}
                style={{ backgroundColor: "#E8E8E8" }}
              />
            </View>
          </View>
          <View className="mt-1 w-full items-center">
            <SingleLoadingSekeleton
              width={48}
              height={10}
              borderRadius={4}
              style={{ backgroundColor: "#E0E0E0" }}
            />
          </View>
        </View>
      ))}
    </View>

    <View className="flex-row gap-4">
      {[1, 2, 3, 4].map((i) => (
        <View key={`transfer-skeleton-${i}`} className="items-center flex-1">
          <View className="relative">
            <SingleLoadingSekeleton
              width={70}
              height={70}
              borderRadius={35}
              style={{ backgroundColor: "#D0D0D0" }}
            />
            <View className="absolute bottom-0 right-[10px] bg-light-main-container rounded-full border border-light-matte-black/10">
              <SingleLoadingSekeleton
                width={12}
                height={12}
                borderRadius={8}
                style={{ backgroundColor: "#E8E8E8" }}
              />
            </View>
            <View className="absolute bottom-[12px] right-0 bg-light-main-container rounded-full border border-light-matte-black/10">
              <SingleLoadingSekeleton
                width={12}
                height={12}
                borderRadius={6}
                style={{ backgroundColor: "#E8E8E8" }}
              />
            </View>
          </View>
          <View className="mt-1 w-full items-center">
            <SingleLoadingSekeleton
              width={56}
              height={10}
              borderRadius={4}
              style={{ backgroundColor: "#E0E0E0" }}
            />
          </View>
        </View>
      ))}
    </View>
  </View>
);

ActivitySkeleton.displayName = "ActivitySkeleton";

export default ActivitySkeleton;
