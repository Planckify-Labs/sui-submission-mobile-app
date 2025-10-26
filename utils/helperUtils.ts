import * as Clipboard from "expo-clipboard";
import { Alert } from "react-native";

export async function copyToClipboard(
  text: string,
  label: string,
): Promise<boolean> {
  try {
    await Clipboard.setStringAsync(text);
    Alert.alert("Copied", `${label} copied to clipboard`);
    return true;
  } catch (error) {
    console.error("Clipboard error:", error);
    Alert.alert("Error", "Failed to copy to clipboard");
    return false;
  }
}

function truncateToDecimals(num: number, decimals: number): number {
  const multiplier = Math.pow(10, decimals);
  return Math.trunc(num * multiplier) / multiplier;
}

export function formatTokenAmount(value: string | number): string {
  const num = typeof value === "string" ? parseFloat(value) : value;

  if (isNaN(num) || num === 0) {
    return "0";
  }

  const absNum = Math.abs(num);
  const sign = num < 0 ? "-" : "";

  if (absNum < 0.01) {
    const str = absNum.toFixed(10);
    const match = str.match(/0\.(0*)([1-9]\d?)/);
    if (match) {
      const zeros = match[1].length;
      const significantDigits = match[2];
      return `${sign}0.${"0".repeat(zeros)}${significantDigits}`;
    }
    const truncated = truncateToDecimals(absNum, 6);
    return `${sign}${truncated}`.replace(/\.?0+$/, "");
  }

  if (absNum < 1) {
    const truncated = truncateToDecimals(absNum, 1);
    return `${sign}${truncated}`;
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
