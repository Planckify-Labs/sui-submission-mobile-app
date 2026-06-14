/**
 * `settlement/errors` — the one place settlement-layer user-facing copy
 * and `__DEV__`-guarded logging live (CLAUDE.md user-facing-errors / SI-6
 * / SP-8).
 *
 * Hard rule: end users only ever see {@link friendlySettlementError}. Raw
 * relayer / facilitator bodies, HTTP statuses, RPC payloads and internal
 * "why" labels go through {@link logSettlementDebug} and never reach a
 * production user.
 */

/** Fixed-label settlement failure copy — never embeds raw detail (SI-6). */
export function friendlySettlementError(): string {
  return "We couldn't settle this payment. Please try again.";
}

/** `__DEV__`-guarded raw logger — never reaches production users. */
export function logSettlementDebug(label: string, detail?: unknown): void {
  const dev = typeof __DEV__ !== "undefined" ? __DEV__ : false;
  if (dev) {
    console.warn(`[x402Settlement] ${label}`, detail);
  }
}
