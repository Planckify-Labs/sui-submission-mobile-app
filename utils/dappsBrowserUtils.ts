import { CATEGORY_STYLES, COLORS } from "../constants/dapps-browser";

export const formatAddress = (address: string): string => {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

export const getDappDomain = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

export const getCategoryIcon = (categoryName: string) => {
  const name = categoryName.toLowerCase();

  if (name.includes("defi")) {
    return { type: "defi", color: CATEGORY_STYLES.defi.color };
  } else if (name.includes("dex")) {
    return { type: "dex", color: CATEGORY_STYLES.dex.color };
  } else if (name.includes("gaming") || name.includes("game")) {
    return { type: "gaming", color: CATEGORY_STYLES.gaming.color };
  }

  return { type: "default", color: CATEGORY_STYLES.default.color };
};

export const getCategoryColor = (categoryName: string): string => {
  const name = categoryName.toLowerCase();

  if (name.includes("defi")) {
    return CATEGORY_STYLES.defi.bgColor;
  } else if (name.includes("dex")) {
    return CATEGORY_STYLES.dex.bgColor;
  } else if (name.includes("gaming")) {
    return CATEGORY_STYLES.gaming.bgColor;
  }

  return CATEGORY_STYLES.default.bgColor;
};

export const generateSkeletonData = (
  count: number,
  prefix: string = "skeleton",
) => {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index}`,
  }));
};

export const getButtonStyle = (
  isActive: boolean,
  variant: "primary" | "secondary" = "primary",
) => {
  const baseStyle = "w-12 h-12 rounded-2xl items-center justify-center";

  if (variant === "primary") {
    return `${baseStyle} ${isActive ? "bg-light" : "bg-light opacity-50"}`;
  }

  return `${baseStyle} bg-light`;
};

export const getIconColor = (isActive: boolean): string => {
  return isActive ? COLORS.PRIMARY_RED : COLORS.GRAY_400;
};
