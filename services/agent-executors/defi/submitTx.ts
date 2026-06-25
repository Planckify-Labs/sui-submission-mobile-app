/**
 * Phantom-failure-safe EVM submission.
 *
 * A bare `walletClient.sendTransaction` signs AND broadcasts in one
 * call. When the broadcast RPC errors *after* the signed transaction
 * already propagated to the mempool, viem throws — but the transaction
 * still mines. Callers that treat that throw as "nothing happened" then
 * tell the user the action failed while their funds actually moved
 * (the exact bug reported against `defi_withdraw`).
 *
 * This helper removes the ambiguity by splitting the two phases:
 *
 *   1. prepare + sign locally — a failure here is BEFORE any broadcast,
 *      so chain state is genuinely unchanged (`not_broadcast`);
 *   2. broadcast the raw tx — we already hold the deterministic hash, so
 *      a broadcast error is never assumed safe: we probe for a receipt
 *      (`mined`) and otherwise report `unconfirmed` (the tx may have
 *      landed — never claim "unchanged", never blindly retry).
 *
 * Requires a local (offline-signing) account — every on-device DeFi
 * wallet is mnemonic-derived, so `account.signTransaction` is present.
 */

import { keccak256, type PublicClient, type WalletClient } from "viem";

export interface EvmCallRequest {
  to: `0x${string}`;
  data?: `0x${string}`;
  value?: bigint;
}

export type SubmitOutcome =
  /** Broadcast accepted by the node; receipt poller resolves the rest. */
  | { kind: "submitted"; hash: `0x${string}` }
  /** Broadcast errored but a receipt was found — `success` is authoritative. */
  | { kind: "mined"; hash: `0x${string}`; success: boolean }
  /** Failed before broadcast — chain state is unchanged. */
  | { kind: "not_broadcast" }
  /** Broadcast errored, no receipt within the probe window — outcome unknown. */
  | { kind: "unconfirmed"; hash: `0x${string}` };

/** How long to wait for a receipt after an ambiguous broadcast error. */
const RECEIPT_PROBE_TIMEOUT_MS = 20_000;

export async function submitEvmCall(
  walletClient: WalletClient,
  publicClient: PublicClient,
  call: EvmCallRequest,
  opts?: { receiptTimeoutMs?: number },
): Promise<SubmitOutcome> {
  const account = walletClient.account;
  // No local account / can't sign offline → we can't hold the hash, so
  // there's nothing to broadcast. Caller treats this as a safe failure.
  if (!account || typeof account.signTransaction !== "function") {
    return { kind: "not_broadcast" };
  }

  // 1. Prepare + sign. Any throw here is pre-broadcast (gas estimate
  //    revert, insufficient funds, bad nonce) — nothing hit the chain.
  let serialized: `0x${string}`;
  try {
    const request = await walletClient.prepareTransactionRequest({
      to: call.to,
      data: call.data,
      value: call.value ?? 0n,
      account,
      chain: walletClient.chain,
    } as Parameters<WalletClient["prepareTransactionRequest"]>[0]);
    serialized = (await walletClient.signTransaction(
      request as Parameters<WalletClient["signTransaction"]>[0],
    )) as `0x${string}`;
  } catch {
    return { kind: "not_broadcast" };
  }

  // Deterministic hash of the signed tx — known even if the broadcast
  // RPC errors after the tx already propagated.
  const hash = keccak256(serialized);

  // 2. Broadcast the raw, already-signed transaction.
  try {
    await publicClient.sendRawTransaction({
      serializedTransaction: serialized,
    });
    return { kind: "submitted", hash };
  } catch {
    // Broadcast errored — but the signed tx (with `hash`) may still have
    // propagated and mined. NEVER assume "unchanged"; probe for a
    // receipt to learn the true outcome.
    try {
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        timeout: opts?.receiptTimeoutMs ?? RECEIPT_PROBE_TIMEOUT_MS,
      });
      return { kind: "mined", hash, success: receipt.status === "success" };
    } catch {
      return { kind: "unconfirmed", hash };
    }
  }
}
