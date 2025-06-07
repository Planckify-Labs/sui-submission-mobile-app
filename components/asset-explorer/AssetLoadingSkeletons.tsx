import SingleLoadingSekeleton from "@/components/common/SingleLoadingSekeleton";
import React from "react";
import { View } from "react-native";

type AssetLoadingSkeletonsProps = {
  count?: number;
};

const AssetLoadingSkeletons = ({ count = 5 }: AssetLoadingSkeletonsProps) => {
  return (
    <>
      {Array(count)
        .fill(0)
        .map((_, index) => (
          <View
            key={`asset-skeleton-${index}`}
            className="flex-row items-center p-3 mb-2 bg-light-main-container rounded-lg"
          >
            <View className="mr-3">
              <SingleLoadingSekeleton
                width={40}
                height={40}
                borderRadius={20}
              />
            </View>
            <View className="flex-1">
              <SingleLoadingSekeleton
                width={120}
                height={18}
                borderRadius={4}
                style={{ marginBottom: 8 }}
              />
              <SingleLoadingSekeleton width={80} height={14} borderRadius={4} />
            </View>
            <View>
              <SingleLoadingSekeleton
                width={30}
                height={30}
                borderRadius={99}
              />
            </View>
          </View>
        ))}
    </>
  );
};

export default AssetLoadingSkeletons;
