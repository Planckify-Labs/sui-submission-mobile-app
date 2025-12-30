type TDateFormatPreset = "short" | "long" | "datetime" | "dateOnly" | "timeOnly";

type TFormatDateParams = {
  date: Date | string | number;
  preset?: TDateFormatPreset;
  locale?: string;
};

const DATE_FORMAT_OPTIONS: Record<TDateFormatPreset, Intl.DateTimeFormatOptions> = {
  short: {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  },
  long: {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  },
  datetime: {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  },
  dateOnly: {
    day: "2-digit",
    month: "short",
    year: "numeric",
  },
  timeOnly: {
    hour: "2-digit",
    minute: "2-digit",
  },
};

const DEFAULT_LOCALE = "id-ID";

/**
 * Formats a date with preset formats
 *
 * @example
 * formatDate({ date: new Date() }) // "30 Des 2025, 10:30"
 * formatDate({ date: "2025-12-30", preset: "long" }) // "30 Desember 2025, 10:30"
 * formatDate({ date: new Date(), preset: "dateOnly" }) // "30 Des 2025"
 */
export function formatDate({
  date,
  preset = "short",
  locale = DEFAULT_LOCALE,
}: TFormatDateParams): string {
  if (!date) return "N/A";

  try {
    const dateObj = date instanceof Date ? date : new Date(date);

    if (isNaN(dateObj.getTime())) {
      return String(date);
    }

    return dateObj.toLocaleDateString(locale, DATE_FORMAT_OPTIONS[preset]);
  } catch {
    return String(date);
  }
}

/**
 * Returns relative time string (e.g., "2 hours ago", "yesterday")
 *
 * @example
 * getRelativeTime(new Date(Date.now() - 3600000)) // "1 hour ago"
 */
export function getRelativeTime(
  date: Date | string | number,
  locale = DEFAULT_LOCALE,
): string {
  if (!date) return "N/A";

  try {
    const dateObj = date instanceof Date ? date : new Date(date);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - dateObj.getTime()) / 1000);

    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

    if (diffInSeconds < 60) {
      return rtf.format(-diffInSeconds, "second");
    }
    if (diffInSeconds < 3600) {
      return rtf.format(-Math.floor(diffInSeconds / 60), "minute");
    }
    if (diffInSeconds < 86400) {
      return rtf.format(-Math.floor(diffInSeconds / 3600), "hour");
    }
    if (diffInSeconds < 604800) {
      return rtf.format(-Math.floor(diffInSeconds / 86400), "day");
    }

    return formatDate({ date: dateObj, preset: "dateOnly", locale });
  } catch {
    return String(date);
  }
}
