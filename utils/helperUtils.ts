import * as Clipboard from "expo-clipboard";
import Constants from "expo-constants";

export async function copyToClipboard(
  text: string,
  label: string,
): Promise<boolean> {
  try {
    await Clipboard.setStringAsync(text);
    console.log("Copied:", `${label} copied to clipboard`);
    return true;
  } catch (error) {
    console.error("Clipboard error:", error);
    console.error("Error: Failed to copy to clipboard");
    return false;
  }
}

function truncateToDecimals(num: number, decimals: number): number {
  const multiplier = Math.pow(10, decimals);
  return Math.trunc(num * multiplier) / multiplier;
}

type FormatTokenAmountOptions = {
  /** Use K/M/B suffixes for large numbers (default: true) */
  simplify?: boolean;
};

export function formatTokenAmount(
  value: string | number,
  options: FormatTokenAmountOptions = {},
): string {
  const { simplify = true } = options;
  const num = typeof value === "string" ? parseFloat(value) : value;

  if (isNaN(num) || num === 0) {
    return "0";
  }

  const absNum = Math.abs(num);
  const sign = num < 0 ? "-" : "";

  // Handle very small numbers
  if (absNum < 0.000001) {
    if (simplify) {
      const str = absNum.toFixed(12);
      const match = str.match(/0\.(0*)([1-9]\d{0,1})/);
      if (match) {
        const zeroCount = match[1].length;
        const significantDigits = match[2];
        const subscripts = ["₀", "₁", "₂", "₃", "₄", "₅", "₆", "₇", "₈", "₉"];
        const subscriptZeros = zeroCount
          .toString()
          .split("")
          .map((d) => subscripts[parseInt(d)])
          .join("");
        return `${sign}0.0${subscriptZeros}${significantDigits}`;
      }
    }
    return `${sign}<0.000001`;
  }

  // For non-simplified format, use locale string with appropriate decimals
  if (!simplify) {
    if (absNum < 1) {
      return `${sign}${absNum.toLocaleString("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 6,
      })}`;
    }
    if (absNum < 1000) {
      return `${sign}${absNum.toLocaleString("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 4,
      })}`;
    }
    return `${sign}${absNum.toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}`;
  }

  // Simplified format with K/M/B suffixes
  if (absNum < 0.001) {
    const str = absNum.toFixed(12);
    const match = str.match(/0\.(0*)([1-9]\d{0,1})/);
    if (match) {
      const zeroCount = match[1].length;
      const significantDigits = match[2];
      const subscripts = ["₀", "₁", "₂", "₃", "₄", "₅", "₆", "₇", "₈", "₉"];
      const subscriptZeros = zeroCount
        .toString()
        .split("")
        .map((d) => subscripts[parseInt(d)])
        .join("");
      return `${sign}0.0${subscriptZeros}${significantDigits}`;
    }
    return `${sign}<0.001`;
  }

  if (absNum < 0.01) {
    const truncated = truncateToDecimals(absNum, 4);
    return `${sign}${truncated}`.replace(/0+$/, "").replace(/\.$/, "");
  }
  if (absNum < 1) {
    const truncated = truncateToDecimals(absNum, 2);
    return `${sign}${truncated}`.replace(/0+$/, "").replace(/\.$/, "");
  }

  if (absNum < 100) {
    const truncated = truncateToDecimals(absNum, 1);
    return `${sign}${truncated}`;
  }

  if (absNum < 1000) {
    return `${sign}${Math.trunc(absNum)}`;
  }

  if (absNum < 1_000_000) {
    const thousands = absNum / 1000;
    if (thousands >= 100) {
      return `${sign}${Math.trunc(thousands)}K`;
    }
    if (thousands >= 10) {
      return `${sign}${Math.trunc(thousands)}K`;
    }
    const truncated = truncateToDecimals(thousands, 1);
    return `${sign}${truncated}K`;
  }

  if (absNum < 1_000_000_000) {
    const millions = absNum / 1_000_000;
    if (millions >= 100) {
      return `${sign}${Math.trunc(millions)}M`;
    }
    if (millions >= 10) {
      return `${sign}${Math.trunc(millions)}M`;
    }
    if (absNum % 1_000_000 === 0) {
      return `${sign}${Math.trunc(millions)}M`;
    }
    const truncated = truncateToDecimals(millions, 1);
    return `${sign}${truncated}M`.replace(/\.0M$/, "M");
  }

  const billions = absNum / 1_000_000_000;
  if (billions >= 100) {
    return `${sign}${Math.trunc(billions)}B`;
  }
  if (billions >= 10) {
    return `${sign}${Math.trunc(billions)}B`;
  }
  if (absNum % 1_000_000_000 === 0) {
    return `${sign}${Math.trunc(billions)}B`;
  }
  const truncated = truncateToDecimals(billions, 1);
  return `${sign}${truncated}B`.replace(/\.0B$/, "B");
}

export const generateAPIUrl = (relativePath: string) => {
  const origin = Constants.experienceUrl.replace("exp://", "http://");

  const path = relativePath.startsWith("/") ? relativePath : `/${relativePath}`;

  if (process.env.NODE_ENV === "development") {
    return origin.concat(path);
  }

  if (!process.env.EXPO_PUBLIC_API_BASE_URL) {
    throw new Error(
      "EXPO_PUBLIC_API_BASE_URL environment variable is not defined",
    );
  }

  return process.env.EXPO_PUBLIC_API_BASE_URL.concat(path);
};
