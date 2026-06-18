/**
 * Shared intent-layer types (Sui Intent Engine, spec §4.1).
 *
 * Kept in a dedicated, dependency-light module so the pure layer (store,
 * guardian, executor) can import `CompileContext` / `CompiledIntent`
 * without transitively pulling the SDK-heavy `compileIntentToPtb.ts` into
 * their import graph. `compileIntentToPtb.ts` re-exports these so the
 * spec's "import from the compiler" call-sites still resolve.
 */

import type { TToken } from "@/api/types/token";
import type { SuiChainConfig } from "@/constants/configs/chainConfig";
import type { TWallet } from "@/constants/types/walletTypes";
import type { SuiDecodedCommand } from "@/services/chains/sui/payloads";

export interface CompileContext {
  /** Paying wallet (intent.wallet discipline, SI-1). */
  wallet: TWallet;
  /** Active Sui chain — drives network gating + RPC. */
  chain: SuiChainConfig;
  /** Token registry rows, for symbol → coinType resolution (§3). */
  tokens: TToken[];
}

export interface CompiledIntent {
  /** base64 BCS — the wire/sign source of truth. */
  ptbBase64: string;
  /** Decoded structural view — drives the preview's "what it does" (§4.3). */
  decoded: SuiDecodedCommand[];
  /** Hand-written plain-language one-liner. */
  summary: string;
  /** When the venue exposes one (supply). Decimal string. */
  apy?: string;
  /** Swap quote (raw out units) → high-slippage check (§5.2). */
  expectedOut?: bigint;
  /** Price impact as a fraction (e.g. 0.032 = 3.2%) when the venue quotes it. */
  priceImpact?: number;
  /** Resolved pool/market object id, so guardian checks can read its state. */
  poolObjectId?: string;
  /** Resolved input coinType being deployed — over-concentration check (§5.2). */
  inputCoinType?: string;
  /** Resolved raw input amount being deployed (same units as `inputCoinType`). */
  inputAmountRaw?: bigint;
  /**
   * Resolved OUTPUT coinType the wallet should receive (swap only) — lets the
   * effect-mismatch guardian verify the dry-run actually credits this coin to
   * the sender, instead of trusting the venue quote alone.
   */
  outputCoinType?: string;
}
