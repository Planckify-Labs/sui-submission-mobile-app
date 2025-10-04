import { Dimensions } from "react-native";

export const { width: SCREEN_WIDTH } = Dimensions.get("window");

export const PROMO_CARD_WIDTH = SCREEN_WIDTH * 0.85;
export const POPULAR_CARD_WIDTH = 200;

export const COLORS = {
  PRIMARY_RED: "#c71c4b",
  MATTE_BLACK: "#000000",
  GRAY_400: "#9CA3AF",
  GRAY_600: "#6B7280",
  WHITE: "#FFFFFF",
  TRANSPARENT_WHITE_20: "rgba(255, 255, 255, 0.2)",
} as const;

export const ANIMATION = {
  SCROLL_THROTTLE: 8,
  SCROLL_TIMEOUT: 250,
  SCROLL_THRESHOLD: 0.3,
  DECELERATION_RATE: 0.98,
} as const;

export const ICON_SIZES = {
  SMALL: 16,
  MEDIUM: 20,
  LARGE: 24,
} as const;

export const CATEGORY_STYLES = {
  defi: {
    color: "#3b82f6",
    bgColor: "bg-blue-500/10",
  },
  dex: {
    color: "#10b981",
    bgColor: "bg-green-500/10",
  },
  gaming: {
    color: "#8b5cf6",
    bgColor: "bg-purple-500/10",
  },
  default: {
    color: COLORS.PRIMARY_RED,
    bgColor: "bg-light-primary-red/10",
  },
} as const;
