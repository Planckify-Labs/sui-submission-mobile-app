/**
 * Pure selection helpers extracted from `NamespacePicker.tsx` so they can be
 * unit-tested under the Node test harness without a React Native renderer.
 *
 * Kept separate from the component file because:
 *   - the repo has no `@testing-library/react-native` (see `package.json`),
 *     so a full render test would require adding a harness;
 *   - the selection logic is the only interesting behavior — the card chrome
 *     is pass-through, and the order guarantee is enforced by the registry
 *     (covered by `services/walletKit/registry.test.ts`).
 *
 * RN render / snapshot coverage is tracked as a TODO until the app adopts a
 * component-test library (Task 21 follow-up).
 */

import type { Namespace } from "@/services/chains/types";

/**
 * Returns the next `selected` array when the user taps `ns` in a picker of
 * the given `mode`.
 *
 * - `single`: replaces selection with `[ns]` (or clears it if the same
 *   namespace is tapped again and `allowDeselect` is true — default `false`
 *   to match radio-card semantics).
 * - `multi`:  toggles membership of `ns` while preserving the existing order
 *   of the other entries.
 */
export function computeNextSelection(
  prev: Namespace[],
  ns: Namespace,
  mode: "single" | "multi",
  options?: { allowDeselect?: boolean },
): Namespace[] {
  if (mode === "single") {
    if (options?.allowDeselect && prev.length === 1 && prev[0] === ns) {
      return [];
    }
    return [ns];
  }
  // mode === "multi"
  if (prev.includes(ns)) {
    return prev.filter((x) => x !== ns);
  }
  return [...prev, ns];
}
