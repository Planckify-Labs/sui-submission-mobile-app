/**
 * Plain-language guardian copy — Bahasa Indonesia + English (spec §9,
 * Appendix D). Plain language is a scored must-have *and* the project's
 * differentiator (financial inclusion).
 *
 * Every string is hand-written, parameterised ONLY by numbers we control
 * (`{pct}` price-impact / concentration percent, `{n}` minutes-stale) —
 * never a raw RPC/SDK string (CLAUDE.md user-facing-errors). The card
 * renders the user's locale; the checks emit the canonical English copy
 * onto the `RiskFlag` and the same templates localise on the card.
 */

import type { RiskCode, Severity } from "./riskCheck";

export type GuardianLocale = "en" | "id";

interface CopyTemplate {
  title: string;
  detail: string;
}

type LocalizedTemplate = Record<GuardianLocale, CopyTemplate>;

/**
 * Risk-row templates keyed by `${code}:${severity}`. `{pct}` / `{n}` are
 * substituted from values the guardian computes.
 */
const RISK_COPY: Partial<Record<`${RiskCode}:${Severity}`, LocalizedTemplate>> =
  {
    "slippage.high:warn": {
      en: {
        title: "High slippage",
        detail:
          "This swap could lose ~{pct}% to price impact. Try a smaller size.",
      },
      id: {
        title: "Slippage tinggi",
        detail:
          "Swap ini bisa rugi ~{pct}% karena dampak harga. Coba jumlah lebih kecil.",
      },
    },
    "slippage.high:block": {
      en: {
        title: "Slippage too high",
        detail:
          "Price impact is ~{pct}% — too high to do safely. I won't prepare this.",
      },
      id: {
        title: "Slippage terlalu tinggi",
        detail:
          "Dampak harga ~{pct}% — terlalu tinggi untuk aman. Saya tidak akan menyiapkannya.",
      },
    },
    "oracle.stale:warn": {
      en: {
        title: "Stale pool",
        detail:
          "This pool's price hasn't updated in {n} min — the rate may be stale.",
      },
      id: {
        title: "Pool basi",
        detail: "Harga pool ini belum update {n} menit — kursnya mungkin basi.",
      },
    },
    "oracle.stale:block": {
      en: {
        title: "Stale pool",
        detail:
          "This pool's price hasn't updated in {n} min — too stale to use safely.",
      },
      id: {
        title: "Pool basi",
        detail:
          "Harga pool ini belum update {n} menit — terlalu basi untuk dipakai dengan aman.",
      },
    },
    "concentration.high:warn": {
      en: {
        title: "Concentrated position",
        detail:
          "After this, ~{pct}% of your funds sit in one place — that concentrates risk.",
      },
      id: {
        title: "Posisi terkonsentrasi",
        detail:
          "Setelah ini, ~{pct}% dana kamu di satu tempat — itu memusatkan risiko.",
      },
    },
    "concentration.high:block": {
      en: {
        title: "Over-concentrated",
        detail:
          "After this, ~{pct}% of your funds sit in one place — too concentrated to recommend.",
      },
      id: {
        title: "Terlalu terkonsentrasi",
        detail:
          "Setelah ini, ~{pct}% dana kamu di satu tempat — terlalu terpusat untuk disarankan.",
      },
    },
    // effect.mismatch — computed from the dry-run's REAL balance changes
    // (dryRunTransactionBlock effects), not the venue quote. "block" only:
    // an effect that doesn't match the plan is never merely a heads-up.
    "effect.mismatch:block": {
      en: {
        title: "Effects don't match the plan",
        detail:
          "When I simulated this, it would also move funds it shouldn't — so I won't prepare it to sign.",
      },
      id: {
        title: "Efeknya tidak sesuai rencana",
        detail:
          "Saat saya simulasikan, transaksi ini juga memindahkan dana yang seharusnya tidak — jadi saya tidak akan menyiapkannya untuk ditandatangani.",
      },
    },
  };

/** Verdict chip + decline copy used by the card and the executor. */
export const VERDICT_COPY: Record<
  "safe" | "warn" | "blocked" | "expired" | "unsafe",
  LocalizedTemplate
> = {
  safe: {
    en: { title: "Looks safe.", detail: "" },
    id: { title: "Aman.", detail: "" },
  },
  warn: {
    en: { title: "Heads up.", detail: "" },
    id: { title: "Perhatian.", detail: "" },
  },
  blocked: {
    en: {
      title: "Not recommended — I won't prepare this to sign.",
      detail: "",
    },
    id: {
      title:
        "Tidak disarankan — saya tidak akan menyiapkannya untuk ditandatangani.",
      detail: "",
    },
  },
  expired: {
    en: {
      title: "That preview expired — let me re-check and show you again.",
      detail: "",
    },
    id: {
      title: "Preview-nya kedaluwarsa — saya cek ulang dan tampilkan lagi.",
      detail: "",
    },
  },
  unsafe: {
    en: {
      title: "Conditions changed — re-previewing for safety.",
      detail: "",
    },
    id: {
      title: "Kondisi berubah — saya cek ulang demi keamanan.",
      detail: "",
    },
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
 * Build the `{ title, detail }` for a risk row in the requested locale,
 * interpolating the computed params. Falls back to the `warn` template for
 * a (code, severity) pair without dedicated copy, and to English for an
 * unknown locale.
 */
export function formatRiskCopy(args: {
  code: RiskCode;
  severity: Severity;
  params?: Record<string, string | number>;
  locale?: GuardianLocale;
}): CopyTemplate {
  const locale: GuardianLocale = args.locale === "id" ? "id" : "en";
  const template =
    RISK_COPY[`${args.code}:${args.severity}`] ??
    RISK_COPY[`${args.code}:warn`];
  if (!template) {
    return { title: "Risk", detail: "" };
  }
  const chosen = template[locale];
  return {
    title: interpolate(chosen.title, args.params ?? {}),
    detail: interpolate(chosen.detail, args.params ?? {}),
  };
}
