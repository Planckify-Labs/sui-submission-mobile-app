/**
 * Creates a case-insensitive search filter function for an array of objects
 *
 * @example
 * const tokens = [{ name: "Bitcoin", symbol: "BTC" }, { name: "Ethereum", symbol: "ETH" }];
 * const filter = createSearchFilter<typeof tokens[0]>("bit", ["name", "symbol"]);
 * tokens.filter(filter); // [{ name: "Bitcoin", symbol: "BTC" }]
 */
export function createSearchFilter<T extends Record<string, unknown>>(
  query: string,
  fields: (keyof T)[],
): (item: T) => boolean {
  if (!query) return () => true;

  const lowerQuery = query.toLowerCase();

  return (item: T) =>
    fields.some((field) => {
      const value = item[field];
      if (typeof value === "string") {
        return value.toLowerCase().includes(lowerQuery);
      }
      if (typeof value === "number") {
        return String(value).includes(lowerQuery);
      }
      return false;
    });
}

type TFilterListParams<T> = {
  items: T[];
  query: string;
  fields: (keyof T)[];
};

/**
 * Filters a list by searching across specified fields (case-insensitive)
 *
 * @example
 * const wallets = [
 *   { name: "Main", address: "0x123" },
 *   { name: "Savings", address: "0x456" }
 * ];
 * filterList({ items: wallets, query: "main", fields: ["name", "address"] });
 * // [{ name: "Main", address: "0x123" }]
 */
export function filterList<T extends Record<string, unknown>>({
  items,
  query,
  fields,
}: TFilterListParams<T>): T[] {
  if (!query) return items;

  const filter = createSearchFilter<T>(query, fields);
  return items.filter(filter);
}

/**
 * Highlights matching text by wrapping it with markers
 * Useful for search result highlighting
 *
 * @example
 * highlightMatch("Hello World", "wor") // "Hello <mark>Wor</mark>ld"
 */
export function highlightMatch(
  text: string,
  query: string,
  openTag = "<mark>",
  closeTag = "</mark>",
): string {
  if (!query || !text) return text;

  const regex = new RegExp(`(${escapeRegex(query)})`, "gi");
  return text.replace(regex, `${openTag}$1${closeTag}`);
}

/**
 * Escapes special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
