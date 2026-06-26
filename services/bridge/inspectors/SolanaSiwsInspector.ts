/**
 * SIWS payload inspector per solana-adapter-spec §4.8.
 *
 * Patches the `ApprovalIntent.payload` with the canonicalised SIWS
 * `message` field (the bytes the signer will actually sign), and
 * emits a `danger` annotation if the dApp's `domain` disagrees with
 * the origin host (§10.4 inv 1).
 *
 * Runs only on Solana + `signIn` kind.
 */

import type { SolanaSignInPayload } from "@/services/chains/solana/payloads";
import { buildSiwsMessage } from "@/services/chains/solana/siws";
import { originKey } from "@/services/permissions/caip";
import type { ApprovalIntent } from "../approval";
import type { IntentAnnotation, IntentInspector } from "../inspector";

function buildMismatchAnnotation(
  declared: string,
  origin: string,
): IntentAnnotation {
  return {
    code: "siws.domain-mismatch",
    severity: "danger",
    title: "SIWS domain mismatch",
    detail: `The site claims domain "${declared}" but is served from "${origin}". Rejecting this request is recommended.`,
    source: "local",
  };
}

export const SolanaSiwsInspector: IntentInspector = {
  name: "solana-siws",
  priority: 20,
  mode: "auto",
  namespaces: ["solana"],
  async inspect(intent: ApprovalIntent) {
    if (intent.kind !== "signIn") {
      return { annotations: [], verdict: "allow" };
    }
    const payload = intent.payload as SolanaSignInPayload;
    const annotations: IntentAnnotation[] = [];

    const declaredDomain = (payload.domain ?? "").trim();
    const originHost = originKey(intent.origin.url);
    if (declaredDomain && originHost && declaredDomain !== originHost) {
      annotations.push(buildMismatchAnnotation(declaredDomain, originHost));
    }

    let builtMessage: string | undefined;
    try {
      builtMessage = buildSiwsMessage(payload);
    } catch (err) {
      // `detail` renders in the user-facing RiskBanner — never surface the
      // raw parser error message. Keep it to __DEV__ logs only.
      if (__DEV__) {
        console.warn("[SolanaSiwsInspector] buildSiwsMessage failed", err);
      }
      annotations.push({
        code: "siws.invalid-input",
        severity: "warn",
        title: "SIWS input invalid",
        detail: "This sign-in request couldn't be read and may be malformed.",
        source: "local",
      });
    }

    return {
      annotations,
      verdict: annotations.some((a) => a.severity === "danger")
        ? "require-extra-confirmation"
        : "allow",
      patch: builtMessage
        ? ({
            ...(intent.payload as object),
            message: builtMessage,
          } as Partial<ApprovalIntent["payload"]>)
        : undefined,
    };
  },
};
