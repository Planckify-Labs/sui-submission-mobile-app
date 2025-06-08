import SingleLoadingSekeleton from "@/components/common/SingleLoadingSekeleton";
import React from "react";
import { View } from "react-native";

type NetworkLoadingSkeletonsProps = {
  count?: number;
};

const NetworkLoadingSkeletons = ({ count = 5 }: NetworkLoadingSkeletonsProps) => {
  return (
    <>
      {Array(count)
        .fill(0)
        .map((_, index) => (
          <View
            key={`network-skeleton-${index}`}
            className="flex-row items-center p-3.5 mb-3 rounded-xl bg-light"
          >
            <View className="mr-3">
              <SingleLoadingSekeleton
                width={28}
                height={28}
                borderRadius={14}
              />
            </View>
            <View className="flex-1">
              <SingleLoadingSekeleton
                width={120}
                height={18}
                borderRadius={4}
                style={{ marginBottom: 6 }}
              />
              <SingleLoadingSekeleton width={60} height={12} borderRadius={4} />
            </View>
            <SingleLoadingSekeleton
              width={24}
              height={24}
              borderRadius={12}
            />
          </View>
        ))}
    </>
  );
};

export default NetworkLoadingSkeletons;