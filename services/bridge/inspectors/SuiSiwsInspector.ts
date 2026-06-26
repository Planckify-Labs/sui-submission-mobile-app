/**
 * Sui SIWS inspector — pure parser, no RPC. Builds the canonical SIWS
 * message string and emits domain-mismatch / expired / not-yet-valid
 * annotations.
 *
 * Spec reference: `docs/sui-dapp-bridge-spec.md` §8.3.
 */

import type { SuiSignInPayload } from "@/services/chains/sui/payloads";
import { buildSiwsMessage } from "@/services/chains/sui/siws";
import { originKey } from "@/services/permissions/caip";
import type { ApprovalIntent } from "../approval";
import type { IntentAnnotation, IntentInspector } from "../inspector";

export const SuiSiwsInspector: IntentInspector = {
  name: "sui-siws",
  priority: 25,
  mode: "auto",
  namespaces: ["sui"],
  async inspect(intent: ApprovalIntent) {
    if (intent.kind !== "signIn") {
      return { annotations: [], verdict: "allow" };
    }
    const payload = intent.payload as SuiSignInPayload;
    const annotations: IntentAnnotation[] = [];

    const declaredDomain = (payload.domain ?? "").trim();
    const originHost = originKey(intent.origin.url);
    if (declaredDomain && originHost && declaredDomain !== originHost) {
      annotations.push({
        code: "siws.domain-mismatch",
        severity: "danger",
        title: "SIWS domain mismatch",
        detail: `The site claims domain "${declaredDomain}" but is served from "${originHost}". Rejecting this request is recommended.`,
        source: "sui-siws",
      });
    }

    const now = Date.now();
    if (payload.expirationTime) {
      const exp = Date.parse(payload.expirationTime);
      if (Number.isFinite(exp) && exp < now) {
        annotations.push({
          code: "siws.expired",
          severity: "danger",
          title: "SIWS message expired",
          detail: `Expiration time ${payload.expirationTime} is in the past.`,
          source: "sui-siws",
        });
      }
    }
    if (payload.notBefore) {
      const nbf = Date.parse(payload.notBefore);
      if (Number.isFinite(nbf) && nbf > now) {
        annotations.push({
          code: "siws.not-yet-valid",
          severity: "warn",
          title: "SIWS message not yet valid",
          detail: `Not Before ${payload.notBefore} is in the future.`,
          source: "sui-siws",
        });
      }
    }

    let builtMessage: string | undefined;
    try {
      builtMessage = buildSiwsMessage(payload);
    } catch (err) {
      // `detail` renders in the user-facing RiskBanner — never surface the
      // raw parser error message. Keep it to __DEV__ logs only.
      if (__DEV__) {
        console.warn("[SuiSiwsInspector] buildSiwsMessage failed", err);
      }
      annotations.push({
        code: "siws.invalid-input",
        severity: "warn",
        title: "SIWS input invalid",
        detail: "This sign-in request couldn't be read and may be malformed.",
        source: "sui-siws",
      });
    }

    return {
      annotations,
      verdict: annotations.some((a) => a.severity === "danger")
        ? "require-extra-confirmation"
        : "allow",
      patch: builtMessage
        ? ({
            ...(payload as object),
            message: builtMessage,
          } as Partial<ApprovalIntent["payload"]>)
        : undefined,
    };
  },
};
