/**
 * Append the on-chain intent receipt to a PTB (spec §10).
 *
 * Adds `takumi_intent::intent_receipt::record(descriptor, clock)` as the final
 * command of the swap/supply PTB, so the action and its audit-log event sign
 * and execute as ONE atomic transaction. This is also what makes the testnet
 * swap a genuine multi-command PTB (swap → transfer → record), demonstrating
 * PTB composability on-chain — not just a single call.
 *
 * No-op when no Package ID is configured (`intentReceipt.config.ts`), so the
 * default testnet path is unchanged until the module is published. The Clock
 * is the shared object at `0x6` (`SUI_CLOCK_OBJECT_ID`); `descriptor` is the
 * plain-language intent, never a raw SDK string (CLAUDE.md user-facing-errors).
 */

import type { Transaction } from "@mysten/sui/transactions";
import { SUI_CLOCK_OBJECT_ID } from "@mysten/sui/utils";

const RECEIPT_MODULE = "intent_receipt";
const RECEIPT_FUNCTION = "record";

/**
 * Max descriptor length sent on-chain. The Move module caps at 256 BYTES as
 * defense-in-depth; we truncate well below that here (by code points, so a
 * multi-byte symbol is never split) so a pathological user-typed amount can't
 * bloat — or, via the Move cap, abort — the receipt and take the swap with it.
 */
const MAX_DESCRIPTOR_CHARS = 120;

function boundDescriptor(descriptor: string): string {
  const points = Array.from(descriptor); // split by code point, not UTF-16 unit
  if (points.length <= MAX_DESCRIPTOR_CHARS) return descriptor;
  return `${points.slice(0, MAX_DESCRIPTOR_CHARS - 1).join("")}…`;
}

export function appendIntentReceipt(
  tx: Transaction,
  args: { packageId?: string; descriptor: string },
): void {
  const { packageId, descriptor } = args;
  // Default-off: unpublished/unconfigured → leave the PTB exactly as built.
  if (!packageId) return;
  tx.moveCall({
    target: `${packageId}::${RECEIPT_MODULE}::${RECEIPT_FUNCTION}`,
    arguments: [
      tx.pure.string(boundDescriptor(descriptor)),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });
}
