import { TPromotionBannerProps } from "@/components/payment/PromotionBanner";
import { Href } from "expo-router";

export type ProductItem = {
  id: string;
  name: string;
  icon?: string;
  price?: string;
  description?: string;
};
export type SectionData = {
  id: string;
  title: string;
  viewAllPath?: Href;
  items: ProductItem[];
};
export type ListItemData = {
  type: "header" | "banner" | "section" | "searchBar";
  data: any;
};
export const PAYMENT_SECTIONS: SectionData[] = [
  {
    id: "recommendations",
    title: "Recommendations",
    viewAllPath: "/asset-explorer",
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
    viewAllPath: "/asset-explorer",
    items: [
      { id: "rl1", name: "PLN Token" },
      { id: "rl2", name: "Telkomsel" },
      { id: "rl3", name: "XL" },
      { id: "rl4", name: "Indosat" },
      { id: "rl5", name: "GoPay" },
    ],
  },
];

export const createPaymentListData = (
  searchQuery: string,
  setSearchQuery: (query: string) => void,
): ListItemData[] => [
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
    } as TPromotionBannerProps,
  },
  ...PAYMENT_SECTIONS.map((section) => ({
    type: "section" as const,
    data: section,
  })),
];
