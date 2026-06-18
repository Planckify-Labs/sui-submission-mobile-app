/**
 * Effect-mismatch risk check (spec §5.2) — the one check that reasons over
 * the PTB's REAL effects, not a venue quote. This is the "why Sui" guardian
 * signal: before signing, we `dryRunTransactionBlock` the exact PTB and
 * inspect the precise `balanceChanges` it would produce (official Sui
 * `BalanceChange`: a signed per-coin net delta per owner — negative = leaves
 * the wallet, positive = received). A quote is the venue grading its own
 * homework; the dry-run effects are the ground truth of what the transaction
 * actually does — and they're only this inspectable because a PTB is one
 * atomic, simulatable transaction.
 *
 * For a swap the only effects the SIGNER should see are: the input coin
 * decreases, the output coin increases, and native SUI decreases for gas.
 * We flag (block) when the simulated effects disagree with that plan:
 *   • a non-input, non-SUI coin LEAVES the wallet (the PTB would move funds
 *     the user didn't intend — e.g. a malformed/hostile build), or
 *   • the output coin is NOT credited back to the signer (you wouldn't
 *     actually receive what you swapped for).
 * A clean swap passes silently — so a green "Looks safe" now means "I
 * simulated your exact transaction and its real effects match the plan."
 *
 * Conservative & fail-open (SI-6): we only flag on a SUCCESSFUL dry-run with
 * sender balance changes to reason about. A null/reverting dry-run is handled
 * by the executor's revert gate; missing data never false-blocks here.
 */

import { normalizeStructTag, normalizeSuiAddress } from "@mysten/sui/utils";
import { formatRiskCopy } from "../copy";
import type { RiskCheck, RiskCheckArgs, RiskFlag } from "../riskCheck";

const SUI_NATIVE_COIN_TYPE = "0x2::sui::SUI";

function sameType(a: string, b: string): boolean {
  try {
    return normalizeStructTag(a) === normalizeStructTag(b);
  } catch {
    return a === b;
  }
}

function sameAddress(a: string, b: string): boolean {
  try {
    return normalizeSuiAddress(a) === normalizeSuiAddress(b);
  } catch {
    return a === b;
  }
}

export function createEffectMismatchCheck(): RiskCheck {
  return {
    code: "effect.mismatch",
    async run({
      intent,
      compiled,
      dryRun,
      ctx,
    }: RiskCheckArgs): Promise<RiskFlag | null> {
      // Only swaps have the simple "input → output to self" effect model we
      // can verify. Supply/withdraw mint market coins (a richer effect shape)
      // — the dry-run revert gate still covers them; we don't false-flag here.
      if (intent.action !== "swap") return null;
      if (!compiled.inputCoinType) return null;
      // Reason only over a SUCCESSFUL simulation; a reverting/absent dry-run
      // is the executor's revert gate, not ours.
      if (!dryRun || dryRun.status !== "success") return null;

      const sender = ctx.wallet.address;
      const senderChanges = dryRun.balanceChanges.filter((c) =>
        sameAddress(c.owner, sender),
      );
      // Nothing to reason about (no sender effects in the simulation) — don't
      // invent a risk; minOut + the revert gate still protect the user.
      if (senderChanges.length === 0) return null;

      const inputType = compiled.inputCoinType;

      // (1) Any coin that ISN'T the input and ISN'T native SUI (gas) leaving
      // the signer's wallet is an effect the plan never asked for → block.
      const unexpectedOutflow = senderChanges.some(
        (c) =>
          c.amount < 0n &&
          !sameType(c.coinType, inputType) &&
          !sameType(c.coinType, SUI_NATIVE_COIN_TYPE),
      );

      // (2) The output coin must actually be credited back to the signer.
      // Skip this when the output IS native SUI — gas confounds the net SUI
      // delta there (it can net negative even on a correct SUI-out swap).
      let outputNotCredited = false;
      const outType = compiled.outputCoinType;
      if (outType && !sameType(outType, SUI_NATIVE_COIN_TYPE)) {
        outputNotCredited = !senderChanges.some(
          (c) => sameType(c.coinType, outType) && c.amount > 0n,
        );
      }

      if (!unexpectedOutflow && !outputNotCredited) return null;

      const copy = formatRiskCopy({
        code: "effect.mismatch",
        severity: "block",
      });
      return { code: "effect.mismatch", severity: "block", ...copy };
    },
  };
}
