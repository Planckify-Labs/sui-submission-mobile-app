type TFormatCurrencyParams = {
  amount: number | string;
  currency: string;
  showSymbol?: boolean;
};

// Currency to locale mapping for proper formatting
const CURRENCY_LOCALE_MAP: Record<string, string> = {
  IDR: "id-ID",
  SGD: "en-SG",
  USD: "en-US",
  EUR: "de-DE",
  GBP: "en-GB",
  JPY: "ja-JP",
  MYR: "ms-MY",
  THB: "th-TH",
  VND: "vi-VN",
  PHP: "en-PH",
  AUD: "en-AU",
  CNY: "zh-CN",
  KRW: "ko-KR",
  INR: "en-IN",
};

/**
 * Formats a number as currency with proper locale and symbol
 *
 * @example
 * formatCurrency({ amount: 50000, currency: "IDR" }) // "Rp50.000"
 * formatCurrency({ amount: 100, currency: "SGD" }) // "S$100.00"
 * formatCurrency({ amount: 100, currency: "USD" }) // "$100.00"
 * formatCurrency({ amount: 50000, currency: "IDR", showSymbol: false }) // "50.000"
 */
export function formatCurrency({
  amount,
  currency,
  showSymbol = true,
}: TFormatCurrencyParams): string {
  const numAmount = typeof amount === "string" ? parseFloat(amount) : amount;

  if (isNaN(numAmount)) {
    return showSymbol ? `${currency} 0` : "0";
  }

  const locale = CURRENCY_LOCALE_MAP[currency] || "en-US";

  try {
    const formatter = new Intl.NumberFormat(locale, {
      style: showSymbol ? "currency" : "decimal",
      currency: showSymbol ? currency : undefined,
      minimumFractionDigits: currency === "IDR" || currency === "JPY" ? 0 : 2,
      maximumFractionDigits: currency === "IDR" || currency === "JPY" ? 0 : 2,
    });

    return formatter.format(numAmount);
  } catch {
    // Fallback for unsupported currencies
    const formatted = numAmount.toLocaleString(locale);
    return showSymbol ? `${currency} ${formatted}` : formatted;
  }
}

/**
 * Formats a number with thousand separators (no currency symbol)
 *
 * @example
 * formatNumber(50000) // "50,000"
 * formatNumber("1234567.89") // "1,234,567.89"
 */
export function formatNumber(
  value: number | string,
  locale = "en-US",
): string {
  const num = typeof value === "string" ? parseFloat(value) : value;

  if (isNaN(num)) {
    return "0";
  }

  return num.toLocaleString(locale);
}

/**
 * Parses a formatted currency string back to number
 *
 * @example
 * parseCurrency("Rp50.000") // 50000
 * parseCurrency("$1,234.56") // 1234.56
 */
export function parseCurrency(formattedValue: string): number {
  // Remove all non-numeric characters except decimal separators
  const cleaned = formattedValue.replace(/[^\d.,\-]/g, "");

  // Handle different decimal separators (comma vs period)
  // If both exist, assume last one is decimal separator
  const lastComma = cleaned.lastIndexOf(",");
  const lastPeriod = cleaned.lastIndexOf(".");

  let normalized: string;

  if (lastComma > lastPeriod) {
    // European format: 1.234,56
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    // US format: 1,234.56
    normalized = cleaned.replace(/,/g, "");
  }

  const result = parseFloat(normalized);
  return isNaN(result) ? 0 : result;
}
