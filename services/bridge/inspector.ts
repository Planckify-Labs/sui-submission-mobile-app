import type { ApprovalIntent } from "./approval";

export type RiskSeverity = "info" | "warn" | "danger";

export interface IntentAnnotation {
  code: string;
  severity: RiskSeverity;
  title: string;
  detail?: string;
  source: "local" | "agent" | "allowlist" | "simulation" | string;
  data?: unknown;
}

export type InspectorVerdict = "allow" | "require-extra-confirmation" | "block";

export interface InspectionResult {
  annotations: IntentAnnotation[];
  verdict: InspectorVerdict;
  patch?: Partial<ApprovalIntent["payload"]>;
}

export interface IntentInspector {
  readonly name: string;
  readonly priority: number;
  readonly mode: "auto" | "on-demand";
  readonly namespaces?: string[];
  inspect(
    intent: ApprovalIntent,
    prior: IntentAnnotation[],
    signal: AbortSignal,
  ): Promise<InspectionResult>;
}

const inspectors: IntentInspector[] = [];

export const InspectorRegistry = {
  register(inspector: IntentInspector): void {
    if (inspectors.find((i) => i.name === inspector.name)) return;
    inspectors.push(inspector);
    inspectors.sort((a, b) => a.priority - b.priority);
  },
  list(mode: "auto" | "on-demand"): IntentInspector[] {
    return inspectors.filter((i) => i.mode === mode);
  },
  get(name: string): IntentInspector | null {
    return inspectors.find((i) => i.name === name) ?? null;
  },
  clear(): void {
    inspectors.length = 0;
  },
};

const DEFAULT_TIMEOUT_MS = 2000;

const VERDICT_RANK: Record<InspectorVerdict, number> = {
  allow: 0,
  "require-extra-confirmation": 1,
  block: 2,
};

const SECURITY_CRITICAL_FIELDS = new Set([
  "to",
  "value",
  "data",
  "delegator",
  "transaction",
]);

function stricterVerdict(
  a: InspectorVerdict,
  b: InspectorVerdict,
): InspectorVerdict {
  return VERDICT_RANK[a] >= VERDICT_RANK[b] ? a : b;
}

function sanitizePatch(
  patch: InspectionResult["patch"],
): InspectionResult["patch"] {
  if (!patch || typeof patch !== "object") return undefined;
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (SECURITY_CRITICAL_FIELDS.has(key)) continue;
    clean[key] = value;
  }
  return clean;
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  signal: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("inspector.timeout"));
    }, ms);
    const abortHandler = () => {
      clearTimeout(timer);
      reject(new Error("inspector.aborted"));
    };
    signal.addEventListener("abort", abortHandler, { once: true });
    promise.then(
      (v) => {
        clearTimeout(timer);
        signal.removeEventListener("abort", abortHandler);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        signal.removeEventListener("abort", abortHandler);
        reject(e);
      },
    );
  });
}

function dedupeAnnotations(xs: IntentAnnotation[]): IntentAnnotation[] {
  const seen = new Set<string>();
  const out: IntentAnnotation[] = [];
  for (const a of xs) {
    if (seen.has(a.code)) continue;
    seen.add(a.code);
    out.push(a);
  }
  return out;
}

export async function runPipeline(
  intent: ApprovalIntent,
  mode: "auto" | "on-demand",
  signal: AbortSignal,
): Promise<InspectionResult> {
  const list = InspectorRegistry.list(mode).filter(
    (i) => !i.namespaces || i.namespaces.includes(intent.namespace),
  );
  let annotations: IntentAnnotation[] = [];
  let verdict: InspectorVerdict = "allow";
  let mergedPatch: Record<string, unknown> | undefined;

  for (const inspector of list) {
    const prior = Object.freeze([...annotations]) as IntentAnnotation[];
    try {
      const result = await withTimeout(
        inspector.inspect(intent, prior, signal),
        DEFAULT_TIMEOUT_MS,
        signal,
      );
      annotations = dedupeAnnotations([...annotations, ...result.annotations]);
      verdict = stricterVerdict(verdict, result.verdict);
      const patch = sanitizePatch(result.patch);
      if (patch) {
        mergedPatch = { ...(mergedPatch ?? {}), ...patch };
      }
    } catch (e) {
      const err = e as Error;
      if (err.message === "inspector.timeout") {
        annotations = dedupeAnnotations([
          ...annotations,
          {
            code: `inspector.skipped.${inspector.name}`,
            severity: "info",
            title: "Inspection skipped",
            detail: `${inspector.name} did not respond in time`,
            source: inspector.name,
          },
        ]);
      } else if (err.message !== "inspector.aborted") {
        // `detail` is rendered verbatim in RiskBanner. Never put raw
        // error messages (RPC hex, JSON, stack traces) in front of the
        // user — keep the technical reason in __DEV__ logs only.
        if (__DEV__) {
          console.warn(`[inspector] ${inspector.name} threw`, err.message, err);
        }
        annotations = dedupeAnnotations([
          ...annotations,
          {
            code: `inspector.error.${inspector.name}`,
            severity: "warn",
            title: "Inspection failed",
            detail: `${inspector.name} couldn't complete its check.`,
            source: inspector.name,
          },
        ]);
      }
    }
  }

  return { annotations, verdict, patch: mergedPatch };
}

export async function runSingleInspector(
  name: string,
  intent: ApprovalIntent,
  signal: AbortSignal,
): Promise<InspectionResult | null> {
  const inspector = InspectorRegistry.get(name);
  if (!inspector) return null;
  try {
    const result = await withTimeout(
      inspector.inspect(intent, intent.annotations, signal),
      DEFAULT_TIMEOUT_MS,
      signal,
    );
    return {
      annotations: result.annotations,
      verdict: result.verdict,
      patch: sanitizePatch(result.patch),
    };
  } catch {
    return null;
  }
}
