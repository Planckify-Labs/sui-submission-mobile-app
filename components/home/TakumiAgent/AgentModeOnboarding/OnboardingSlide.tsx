import { LucideIcon } from "lucide-react-native";
import React from "react";
import { Dimensions, Text, View } from "react-native";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export interface OnboardingSlideProps {
  icon: LucideIcon;
  iconColor: string;
  iconBgColor: string;
  accentColor: string;
  title: string;
  description: string;
  features: string[];
  slideIndex: number;
}

export default function OnboardingSlide({
  icon: Icon,
  accentColor,
  title,
  description,
  features,
  slideIndex,
}: OnboardingSlideProps) {
  return (
    <View style={{ width: SCREEN_WIDTH }} className="flex-1 px-6">
      <View className="items-center mt-4 mb-8">
        <View className="relative items-center justify-center mb-8">
          <View
            className="absolute w-40 h-40 rounded-full"
            style={{ backgroundColor: `${accentColor}08` }}
          />
          <View
            className="absolute w-28 h-28 rounded-full"
            style={{ backgroundColor: `${accentColor}12` }}
          />
          <View
            className="w-20 h-20 rounded-3xl items-center justify-center"
            style={{
              backgroundColor: accentColor,
              shadowColor: accentColor,
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.3,
              shadowRadius: 16,
              elevation: 12,
            }}
          >
            <Icon size={36} color="#ffffff" strokeWidth={1.8} />
          </View>
        </View>

        <View
          className="px-3 py-1 rounded-full mb-4"
          style={{ backgroundColor: `${accentColor}12` }}
        >
          <Text
            className="text-xs font-semibold tracking-wide"
            style={{ color: accentColor }}
          >
            STEP {slideIndex + 1} OF 3
          </Text>
        </View>

        <Text className="text-[26px] font-bold text-light-matte-black text-center mb-3 px-2 leading-8">
          {title}
        </Text>

        <Text className="text-[15px] text-light-matte-black/55 text-center px-4 leading-6">
          {description}
        </Text>
      </View>

      <View
        className="bg-white rounded-3xl p-5"
        style={{
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.04,
          shadowRadius: 12,
          elevation: 3,
        }}
      >
        {features.map((feature, index) => (
          <View
            key={index}
            className={`flex-row items-center py-3 ${
              index !== features.length - 1
                ? "border-b border-light-matte-black/5"
                : ""
            }`}
          >
            <View
              className="w-7 h-7 rounded-lg items-center justify-center mr-4"
              style={{ backgroundColor: `${accentColor}10` }}
            >
              <Text
                className="text-xs font-bold"
                style={{ color: accentColor }}
              >
                {index + 1}
              </Text>
            </View>

            <Text className="flex-1 text-[14px] text-light-matte-black/75 leading-5">
              {feature}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
