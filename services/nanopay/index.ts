/**
 * `services/nanopay/` — Circle Nanopayments (Path B) mobile wiring.
 *
 * Barrel re-exports so `app/pay-merchant.tsx` and the agent tool site
 * can `import { buildAuthorizationFromIntent, useIntentStatus } from
 * "@/services/nanopay";` without knowing the internal file layout.
 *
 * Layering (strict):
 *   - `types.ts`              — wire shapes; no runtime behaviour.
 *   - `buildAuthorization.ts` — pure reshape; no network, no signing.
 *   - `submit.ts`             — network; no signing.
 *   - `useIntentStatus.ts`    — TanStack Query glue; no signing, no reshape.
 *
 * A future Solana Nanopay variant (M6 task 42) lives in
 * `services/nanopay/svm/*` and gets its own barrel — never merged into
 * this file with a namespace branch. See memory
 * `feedback_chain_extension_discipline.md`.
 */

export {
  type BuildAuthorizationContext,
  buildAuthorizationFromIntent,
  MissingNanopayDomainError,
  MissingNanopayPayloadError,
  SourceChainMismatchError,
} from "./buildAuthorization";
export {
  type BuildPathCAuthorizationArgs,
  buildPathCAuthorization,
  type ExecutePathCArgs,
  type ExecutePathCResult,
  executePathC,
  parseX402Challenge,
  type X402Challenge,
  X402ChallengeParseError,
  X402FetchError,
  X402SettlementError,
} from "./pathCRawX402";
export {
  NanopaySubmitError,
  redactForLog,
  type SubmitNanopayAuthorizationArgs,
  type SubmitResult,
  submitNanopayAuthorization,
} from "./submit";
export {
  type CreateIntentRequest,
  type Currency,
  isTerminalIntentStatus,
  type NanopayPayload,
  type NanopaySignArgs,
  type PaymentIntentResponse,
  type PaymentIntentStatus,
  type SubmitNanopayRequest,
  type SubmitNanopayResponse,
  TERMINAL_INTENT_STATUSES,
} from "./types";
export {
  intentQueryKey,
  useCreateIntent,
  useIntentStatus,
  useSubmitNanopay,
} from "./useIntentStatus";
