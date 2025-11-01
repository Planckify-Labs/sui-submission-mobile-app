import React from "react";
import { useWindowDimensions, View } from "react-native";
import SingleLoadingSekelton from "../../common/SingleLoadingSekeleton";

export default function BalanceSectionSkeleton() {
  const { width } = useWindowDimensions();
  const isSmallScreen = width < 360;

  return (
    <View className="bg-light rounded-2xl w-full p-5 shadow-sm">
      <View className="flex-row items-center justify-between mb-5">
        <View className="flex-row items-center">
          <SingleLoadingSekelton
            width={32}
            height={32}
            borderRadius={8}
            style={{ marginRight: 8 }}
          />
          <SingleLoadingSekelton width={100} height={20} />
        </View>
        <SingleLoadingSekelton width={80} height={32} borderRadius={16} />
      </View>

      <View className="flex-row items-center mb-3">
        <SingleLoadingSekelton
          width={80}
          height={16}
          style={{ marginRight: 8 }}
        />
        <View className="ml-auto flex-row items-center">
          <SingleLoadingSekelton
            width={100}
            height={16}
            style={{ marginRight: 4 }}
          />
          <SingleLoadingSekelton width={12} height={12} />
        </View>
      </View>

      <View className="bg-light-main-container/50 p-4 rounded-xl mb-6">
        <View className="flex-row items-center justify-between mb-1">
          <SingleLoadingSekelton width={50} height={16} />
          <SingleLoadingSekelton width={16} height={16} borderRadius={8} />
        </View>

        <SingleLoadingSekelton
          width={isSmallScreen ? 120 : 150}
          height={40}
          style={{ marginTop: 4 }}
        />
      </View>

      <View className="flex-row gap-4 flex-wrap">
        <View className="flex-1 min-w-[100px] gap-3 flex-row flex-wrap">
          <SingleLoadingSekelton
            height={40}
            borderRadius={12}
            style={{ flex: 1, minWidth: 120, marginBottom: 4 }}
          />
          <SingleLoadingSekelton
            height={40}
            borderRadius={12}
            style={{ flex: 1, minWidth: 100 }}
          />
        </View>

        <View className="flex-row gap-3 flex-wrap justify-center">
          <View className="items-center m-1">
            <SingleLoadingSekelton
              width={48}
              height={48}
              borderRadius={24}
              style={{ marginBottom: 4 }}
            />
            <SingleLoadingSekelton width={40} height={12} />
          </View>
          <View className="items-center m-1">
            <SingleLoadingSekelton
              width={48}
              height={48}
              borderRadius={24}
              style={{ marginBottom: 4 }}
            />
            <SingleLoadingSekelton width={40} height={12} />
          </View>
        </View>
      </View>
    </View>
  );
}
