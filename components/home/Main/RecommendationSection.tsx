import { router } from "expo-router";
import { MoveRight } from "lucide-react-native";
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import {
  Image,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import type { TRecommendation } from "@/api/types/product";
import { useRecommendations } from "@/hooks/queries/useProducts";

export type RecommendationSectionRef = {
  refetch: () => void;
};

const ITEM_WIDTH = 64; // w-16
const ITEM_GAP = 16;
const SCROLL_STEP = ITEM_WIDTH + ITEM_GAP;
const AUTO_SCROLL_INTERVAL_ROW1 = 1500;
const AUTO_SCROLL_INTERVAL_ROW2 = 1900;
const RESUME_DELAY = 3000;

const RecommendationItem = ({ item }: { item: TRecommendation }) => (
  <TouchableOpacity
    activeOpacity={0.7}
    className="items-center"
    onPress={() =>
      router.push({
        pathname: "/purchase-item",
        params: { productId: item.id },
      })
    }
  >
    <View className="rounded-2xl border-2 p-0 border-light-matte-black w-16 aspect-square overflow-hidden bg-light-main-container items-center justify-center">
      {item.imageUrl ? (
        <Image
          source={{ uri: item.imageUrl }}
          style={{ width: "100%", height: "100%" }}
          resizeMode="cover"
        />
      ) : (
        <Text className="text-light-matte-black text-base font-bold">
          {item.name.slice(0, 2).toUpperCase()}
        </Text>
      )}
    </View>
    <Text
      numberOfLines={2}
      ellipsizeMode="tail"
      className="text-[10px] text-center text-wrap max-w-16 mt-1"
    >
      {item.name}
    </Text>
  </TouchableOpacity>
);

const RecommendationSection = forwardRef<RecommendationSectionRef>((_, ref) => {
  const { data: recommendations, refetch } = useRecommendations(10);

  useImperativeHandle(ref, () => ({ refetch: () => refetch() }));

  const scrollRef1 = useRef<ScrollView>(null);
  const scrollRef2 = useRef<ScrollView>(null);
  const scrollOffset1Ref = useRef(0);
  const scrollOffset2Ref = useRef(0);
  const timer1Ref = useRef<ReturnType<typeof setInterval> | null>(null);
  const timer2Ref = useRef<ReturnType<typeof setInterval> | null>(null);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopAutoScroll = useCallback(() => {
    if (timer1Ref.current) {
      clearInterval(timer1Ref.current);
      timer1Ref.current = null;
    }
    if (timer2Ref.current) {
      clearInterval(timer2Ref.current);
      timer2Ref.current = null;
    }
  }, []);

  const startAutoScroll = useCallback(
    (items: TRecommendation[]) => {
      stopAutoScroll();
      const row1Length = Math.ceil(items.length / 2);
      const row2Length = Math.floor(items.length / 2);

      timer1Ref.current = setInterval(() => {
        const maxOffset = row1Length * SCROLL_STEP;
        const next = scrollOffset1Ref.current + SCROLL_STEP;
        const nextOffset = next >= maxOffset ? 0 : next;
        scrollRef1.current?.scrollTo({ x: nextOffset, animated: true });
        scrollOffset1Ref.current = nextOffset;
      }, AUTO_SCROLL_INTERVAL_ROW1);

      timer2Ref.current = setInterval(() => {
        const maxOffset = row2Length * SCROLL_STEP;
        const next = scrollOffset2Ref.current + SCROLL_STEP;
        const nextOffset = next >= maxOffset ? 0 : next;
        scrollRef2.current?.scrollTo({ x: nextOffset, animated: true });
        scrollOffset2Ref.current = nextOffset;
      }, AUTO_SCROLL_INTERVAL_ROW2);
    },
    [stopAutoScroll],
  );

  useEffect(() => {
    if (recommendations?.length) {
      startAutoScroll(recommendations);
    }
    return () => {
      stopAutoScroll();
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    };
  }, [recommendations, startAutoScroll, stopAutoScroll]);

  const handleScroll1 = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollOffset1Ref.current = e.nativeEvent.contentOffset.x;
    },
    [],
  );

  const handleScroll2 = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollOffset2Ref.current = e.nativeEvent.contentOffset.x;
    },
    [],
  );

  const handleScrollBeginDrag = useCallback(() => {
    stopAutoScroll();
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => {
      if (recommendations?.length) startAutoScroll(recommendations);
    }, RESUME_DELAY);
  }, [stopAutoScroll, startAutoScroll, recommendations]);

  if (!recommendations?.length) return null;

  const row1 = recommendations.filter((_, i) => i % 2 === 0);
  const row2 = recommendations.filter((_, i) => i % 2 !== 0);

  return (
    <View className="px-4">
      <View className="bg-light rounded-[14px] w-full gap-4">
        <View className="flex-row px-[22px] pt-[22px]">
          <Text className="text-light-matte-black text-sm">For You</Text>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => router.push("/service")}
            className="flex-row items-center justify-center border-2 ml-auto border-light-primary-red bg-light-primary-red/10 gap-2 rounded-full px-4 py-1"
          >
            <Text className="text-light-matte-black text-sm font-bold">
              View All
            </Text>
            <MoveRight size={20} color="#c71c4b" />
          </TouchableOpacity>
        </View>

        <ScrollView
          ref={scrollRef1}
          horizontal
          showsHorizontalScrollIndicator={false}
          onScroll={handleScroll1}
          onScrollBeginDrag={handleScrollBeginDrag}
          scrollEventThrottle={16}
          contentContainerStyle={{ gap: ITEM_GAP, paddingHorizontal: 22 }}
        >
          {row1.map((item) => (
            <RecommendationItem key={item.id} item={item} />
          ))}
        </ScrollView>
        <ScrollView
          ref={scrollRef2}
          horizontal
          showsHorizontalScrollIndicator={false}
          onScroll={handleScroll2}
          onScrollBeginDrag={handleScrollBeginDrag}
          scrollEventThrottle={16}
          contentContainerStyle={{
            gap: ITEM_GAP,
            paddingHorizontal: 22,
            paddingBottom: 22,
          }}
        >
          {row2.map((item) => (
            <RecommendationItem key={item.id} item={item} />
          ))}
        </ScrollView>
      </View>
    </View>
  );
});

RecommendationSection.displayName = "RecommendationSection";

export default RecommendationSection;
