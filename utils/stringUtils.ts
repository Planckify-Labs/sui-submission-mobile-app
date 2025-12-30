/**
 * Capitalizes the first letter of a string
 *
 * @example
 * capitalize("hello world") // "Hello world"
 */
export function capitalize(str: string): string {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Converts a string to title case (each word capitalized)
 *
 * @example
 * titleCase("hello world") // "Hello World"
 */
export function titleCase(str: string): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Extracts initials from a name
 *
 * @example
 * toInitials("John Doe") // "JD"
 * toInitials("John Doe Smith", 3) // "JDS"
 * toInitials("John") // "JO"
 */
export function toInitials(name: string, maxChars = 2): string {
  if (!name) return "";

  const words = name.trim().split(/\s+/);

  if (words.length >= maxChars) {
    return words
      .slice(0, maxChars)
      .map((word) => word[0])
      .join("")
      .toUpperCase();
  }

  // If not enough words, take chars from first word
  return name.substring(0, maxChars).toUpperCase();
}

/**
 * Converts camelCase or snake_case to readable words
 *
 * @example
 * toReadableWords("getUserData") // "Get User Data"
 * toReadableWords("get_user_data") // "Get User Data"
 */
export function toReadableWords(str: string): string {
  if (!str) return "";

  return str
    .replace(/_/g, " ")
    .replace(/([A-Z])/g, " $1")
    .trim()
    .split(" ")
    .map((word) => capitalize(word))
    .join(" ");
}

type TTruncateTextParams = {
  text: string;
  maxLength: number;
  suffix?: string;
};

/**
 * Truncates text to a maximum length with suffix
 *
 * @example
 * truncateText({ text: "Hello World", maxLength: 5 }) // "Hello…"
 * truncateText({ text: "Hello", maxLength: 10 }) // "Hello"
 */
export function truncateText({
  text,
  maxLength,
  suffix = "…",
}: TTruncateTextParams): string {
  if (!text) return "";
  if (text.length <= maxLength) return text;

  return text.slice(0, maxLength) + suffix;
}

/**
 * Removes all non-digit characters from a string
 *
 * @example
 * extractDigits("+62 812-3456-7890") // "6281234567890"
 */
export function extractDigits(str: string): string {
  return str.replace(/\D/g, "");
}

/**
 * Checks if a string is empty or contains only whitespace
 *
 * @example
 * isBlank("") // true
 * isBlank("   ") // true
 * isBlank("hello") // false
 */
export function isBlank(str: string | null | undefined): boolean {
  return !str || str.trim().length === 0;
}
