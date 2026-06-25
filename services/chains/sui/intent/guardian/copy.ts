/**
 * Plain-language guardian copy (spec §9, Appendix D). Plain language is a
 * scored must-have *and* the project's differentiator (financial inclusion).
 *
 * Every string is hand-written, parameterised ONLY by numbers we control
 * (`{pct}` price-impact / concentration percent, `{n}` minutes-stale) —
 * never a raw RPC/SDK string (CLAUDE.md user-facing-errors).
 */

import type { RiskCode, Severity } from "./riskCheck";

interface CopyTemplate {
  title: string;
  detail: string;
}

/**
 * Risk-row templates keyed by `${code}:${severity}`. `{pct}` / `{n}` are
 * substituted from values the guardian computes.
 */
const RISK_COPY: Partial<Record<`${RiskCode}:${Severity}`, CopyTemplate>> = {
  "slippage.high:warn": {
    title: "High slippage",
    detail: "This swap could lose ~{pct}% to price impact. Try a smaller size.",
  },
  "slippage.high:block": {
    title: "Slippage too high",
    detail:
      "Price impact is ~{pct}% — too high to do safely. I won't prepare this.",
  },
  "oracle.stale:warn": {
    title: "Stale pool",
    detail:
      "This pool's price hasn't updated in {n} min — the rate may be stale.",
  },
  "oracle.stale:block": {
    title: "Stale pool",
    detail:
      "This pool's price hasn't updated in {n} min — too stale to use safely.",
  },
  "concentration.high:warn": {
    title: "Concentrated position",
    detail:
      "After this, ~{pct}% of your funds sit in one place — that concentrates risk.",
  },
  "concentration.high:block": {
    title: "Over-concentrated",
    detail:
      "After this, ~{pct}% of your funds sit in one place — too concentrated to recommend.",
  },
  // effect.mismatch — computed from the dry-run's REAL balance changes
  // (dryRunTransactionBlock effects), not the venue quote. "block" only:
  // an effect that doesn't match the plan is never merely a heads-up.
  "effect.mismatch:block": {
    title: "Effects don't match the plan",
    detail:
      "When I simulated this, it would also move funds it shouldn't — so I won't prepare it to sign.",
  },
};

function interpolate(
  s: string,
  params: Record<string, string | number>,
): string {
  return s.replace(/\{(\w+)\}/g, (_m, key: string) =>
    params[key] !== undefined ? String(params[key]) : `{${key}}`,
  );
}

/**
 * Build the `{ title, detail }` for a risk row, interpolating the computed
 * params. Falls back to the `warn` template for a (code, severity) pair
 * without dedicated copy.
 */
export function formatRiskCopy(args: {
  code: RiskCode;
  severity: Severity;
  params?: Record<string, string | number>;
}): CopyTemplate {
  const template =
    RISK_COPY[`${args.code}:${args.severity}`] ??
    RISK_COPY[`${args.code}:warn`];
  if (!template) {
    return { title: "Risk", detail: "" };
  }
  return {
    title: interpolate(template.title, args.params ?? {}),
    detail: interpolate(template.detail, args.params ?? {}),
  };
}
