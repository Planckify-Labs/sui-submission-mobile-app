import SearchBar from "@/components/common/SearchBar";
import PromotionBanner from "@/components/service/PromotionBanner";
import ServiceHeader from "@/components/service/ServiceHeader";
import ServiceScreenSkeleton from "@/components/service/ServiceScreenSkeleton";
import ServiceSectionContainer from "@/components/service/ServiceSectionContainer";
import {
  type ListItemData as ListItem,
} from "@/constants/dummyData/paymentScreen";
import { useProductsByCategories } from "@/hooks/queries/useProducts";
import React, { useRef, useState } from "react";
import {
  Animated,
  FlatList,
  ListRenderItemInfo,
  StatusBar,
  Text
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ServiceScreen() {
  const [searchQuery, setSearchQuery] = useState("");
  const scrollY = useRef(new Animated.Value(0)).current;
  const { data: productsByCategories, isLoading, error } = useProductsByCategories();

  const searchBarOpacity = scrollY.interpolate({
    inputRange: [50, 150],
    outputRange: [1, 0.2],
    extrapolate: "clamp",
  });

  const serviceList: ListItem[] = [
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
        onPress: () => {
          console.log("Banner button pressed");
        },
      },
    },
  ];

  if (productsByCategories) {
    productsByCategories.forEach((categoryData) => {
      const filteredProducts = searchQuery 
        ? categoryData.products.filter(product => 
            product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            product.description.toLowerCase().includes(searchQuery.toLowerCase())
          )
        : categoryData.products;
      
      if (filteredProducts.length > 0) {
        serviceList.push({
          type: "section",
          data: {
            id: categoryData.category.id,
            title: categoryData.category.name,
            viewAllPath: "/asset-explorer",
            items: filteredProducts.map(product => ({
              id: product.id,
              name: product.name,
              description: product.description,
              icon: product.imageUrl
            })),
          },
        });
      }
    });
  }

  const renderListItem = ({ item }: ListRenderItemInfo<ListItem>) => {
    if (item.type === "header") {
      return <ServiceHeader title="Payments" />;
    } else if (item.type === "searchBar") {
      return (
        <SearchBar
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          searchBarOpacity={searchBarOpacity}
          variant="borderedMinimal"
          placeholder="search services..."
        />
      );
    } else if (item.type === "banner") {
      return (
        <PromotionBanner
          title={item.data.title}
          description={item.data.description}
          buttonText={item.data.buttonText}
          onPress={item.data.onPress}
        />
      );
    } else {
      return <ServiceSectionContainer section={item.data} />;
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-light-main-container">
        <ServiceScreenSkeleton />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView className="flex-1 bg-light-main-container items-center justify-center">
        <Text>Failed to load services.</Text>
        <Text className="text-light-error mt-2">
          {error instanceof Error ? error.message : "Unknown error"}
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView className="flex-1 bg-light-main-container" edges={["top"]}>
        <FlatList
          data={serviceList}
          renderItem={renderListItem}
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
