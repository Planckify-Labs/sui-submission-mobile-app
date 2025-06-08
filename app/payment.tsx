import { BlurView } from "expo-blur";
import { router } from "expo-router";
import { ArrowLeft, MoveRight, Search, X } from "lucide-react-native";
import React, { useRef, useState } from "react";
import {
  Animated,
  FlatList,
  ListRenderItemInfo,
  Pressable,
  StatusBar,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type ProductItem = {
  id: string;
  name: string;
  icon?: string;
  price?: string;
  description?: string;
};

type SectionData = {
  id: string;
  title: string;
  viewAllPath?: string;
  items: ProductItem[];
};

type ListItem = {
  type: "header" | "banner" | "section" | "searchBar";
  data: any;
};

export default function PaymentScreen() {
  const [searchQuery, setSearchQuery] = useState("");
  const scrollY = useRef(new Animated.Value(0)).current;

  const searchBarOpacity = scrollY.interpolate({
    inputRange: [50, 150],
    outputRange: [1, 0.2],
    extrapolate: "clamp",
  });

  const sections: SectionData[] = [
    {
      id: "recommendations",
      title: "Recommendations",
      viewAllPath: "/recommendations",
      items: [
        { id: "r1", name: "Telkomsel 50K" },
        { id: "r2", name: "PLN 100K" },
        { id: "r3", name: "Netflix 1 Month" },
        { id: "r4", name: "DANA 100K" },
        { id: "r5", name: "Spotify Premium" },
      ],
    },
    {
      id: "reload",
      title: "Reload",
      viewAllPath: "/reload",
      items: [
        { id: "rl1", name: "PLN Token" },
        { id: "rl2", name: "Telkomsel" },
        { id: "rl3", name: "XL" },
        { id: "rl4", name: "Indosat" },
        { id: "rl5", name: "GoPay" },
      ],
    },
    {
      id: "billings",
      title: "Billings",
      viewAllPath: "/billings",
      items: [
        { id: "b1", name: "PDAM" },
        { id: "b2", name: "Internet" },
        { id: "b3", name: "BPJS" },
        { id: "b4", name: "PBB" },
        { id: "b5", name: "Multifinance" },
      ],
    },
    {
      id: "communication",
      title: "Communication",
      viewAllPath: "/communication",
      items: [
        { id: "c1", name: "Telkomsel Data" },
        { id: "c2", name: "XL Data" },
        { id: "c3", name: "Indosat Data" },
        { id: "c4", name: "Smartfren" },
        { id: "c5", name: "Axis" },
      ],
    },
    {
      id: "gaming",
      title: "Gaming Vouchers",
      viewAllPath: "/gaming",
      items: [
        { id: "g1", name: "Mobile Legends" },
        { id: "g2", name: "PUBG Mobile" },
        { id: "g3", name: "Free Fire" },
        { id: "g4", name: "Genshin Impact" },
        { id: "g5", name: "Valorant" },
      ],
    },
    {
      id: "streaming",
      title: "Streaming Services",
      viewAllPath: "/streaming",
      items: [
        { id: "s1", name: "Netflix" },
        { id: "s2", name: "Disney+" },
        { id: "s3", name: "Spotify" },
        { id: "s4", name: "YouTube" },
        { id: "s5", name: "Vidio" },
      ],
    },
  ];

  const listData: ListItem[] = [
    {
      type: "header",
      data: {
        title: "Payments",
      },
    },
    {
      type: "searchBar",
      data: {
        searchQuery,
        setSearchQuery,
      },
    },
    {
      type: "banner",
      data: {
        title: "Special Offer!",
        description: "Get 10% cashback on all data packages",
        buttonText: "Claim Now",
      },
    },
    ...sections.map((section) => ({
      type: "section" as const,
      data: section,
    })),
  ];

  const renderHeader = (headerData: any) => (
    <View className="flex-row items-center p-4">
      <Pressable onPress={() => router.back()} className="mr-4">
        <ArrowLeft color="#c71c4b" size={24} />
      </Pressable>
      <Text className="text-light-matte-black text-xl font-bold">
        {headerData.title}
      </Text>
    </View>
  );

  const renderSection = (section: SectionData) => (
    <View className="px-4">
      <View className="bg-light rounded-[14px] w-full p-[22px] gap-4 mb-4">
        <View className="flex-row">
          <Text className="text-light-matte-black text-sm">
            {section.title}
          </Text>
          {section.viewAllPath && (
            <Pressable className="flex-row items-center justify-center border-2 ml-auto border-light-primary-red bg-light-primary-red/10 gap-2 rounded-full px-4 py-1">
              <Text className="text-light-matte-black text-sm font-bold">
                View All
              </Text>
              <MoveRight size={20} color="#c71c4b" />
            </Pressable>
          )}
        </View>
        <View className="flex-row gap-2 justify-between flex-wrap">
          {section.items.map((item: ProductItem) => (
            <View key={item.id} className="max-w-24 grow">
              <View className="rounded-2xl border-2 border-light-matte-black w-16 aspect-square bg-light-primary-red/40" />
              <Text className="text-[10px] text-center text-wrap max-w-16">
                {item.name}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );

  const renderBanner = (bannerData: any) => (
    <View className="px-4 mb-4">
      <View className="bg-light-primary-red rounded-xl h-40 overflow-hidden">
        <View className="flex-1 p-4 justify-center">
          <Text className="text-white font-bold text-xl mb-1">
            {bannerData.title}
          </Text>
          <Text className="text-white/90 mb-3">{bannerData.description}</Text>
          <Pressable className="bg-white rounded-full px-4 py-2 self-start">
            <Text className="text-light-primary-red font-bold">
              {bannerData.buttonText}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );

  const renderItem = ({ item }: ListRenderItemInfo<ListItem>) => {
    if (item.type === "header") {
      return renderHeader(item.data);
    } else if (item.type === "searchBar") {
      return <StickySearchBar />;
    } else if (item.type === "banner") {
      return renderBanner(item.data);
    } else {
      return renderSection(item.data);
    }
  };

  const StickySearchBar = () => (
    <View className="px-4 mt-2 mb-4">
      <BlurView
        intensity={30}
        experimentalBlurMethod="dimezisBlurView"
        className="overflow-hidden rounded-full"
      >
        <View className="overflow-hidden rounded-full border-4 border-light-matte-black relative">
          <Animated.View
            style={{ opacity: searchBarOpacity }}
            className="absolute -z-50 bg-light w-full h-full left-0 right-0 rounded-full"
          >
            <View />
          </Animated.View>
          <View className="flex-row items-center px-3">
            <Search size={18} color="#20222c" />
            <TextInput
              className="flex-1 py-3 px-2 text-light-matte-black"
              placeholder="search services..."
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery ? (
              <Pressable onPress={() => setSearchQuery("")}>
                <X size={18} color="#20222c" />
              </Pressable>
            ) : null}
          </View>
        </View>
      </BlurView>
    </View>
  );

  return (
    <>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView className="flex-1 bg-light-main-container" edges={["top"]}>
        <FlatList
          data={listData}
          renderItem={renderItem}
          keyExtractor={(item, index) =>
            item.type === "section" ? item.data.id : `${item.type}-${index}`
          }
          showsVerticalScrollIndicator={false}
          stickyHeaderIndices={[1]}
          contentContainerStyle={{ paddingBottom: 24 }}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: false },
          )}
          scrollEventThrottle={16}
        />
      </SafeAreaView>
    </>
  );
}
