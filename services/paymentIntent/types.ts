/**
 * Payment-intent types — see `docs/umkm-usdc-payout-spec.md` §4.2.
 *
 * These types are the normalised shape every scanned / pasted / deep-linked
 * payment payload collapses into before the router decides which screen to
 * show. They are **chain-agnostic at the classifier layer** (per memory
 * `feedback_chain_extension_discipline.md`); any per-chain logic lives
 * inside an individual `Detector` (see `detectorRegistry.ts`), never as
 * `if (namespace === "X")` branches in shared code.
 */

export type PayChannel =
  | {
      kind: "wallet";
      namespace: "eip155" | "solana";
      address: string;
      /**
       * Specific target chain when the payload carries one:
       *  - EIP-681 `ethereum:0x…@137` → `{ namespace: "eip155", chainId: 137 }`
       *  - `solana:<addr>` (no cluster) → `{ namespace: "solana", cluster: "mainnet-beta" }`
       *  - raw `0x…` address (no chain info) → `undefined` (scanner keeps the current
       *    EVM activeChain; only the namespace is guaranteed to switch).
       */
      target?:
        | { namespace: "eip155"; chainId: number }
        | { namespace: "solana"; cluster: "mainnet-beta" | "devnet" };
      amount?: bigint;
      /** ERC-20 / SPL token address when the URI specifies one. */
      token?: string;
    }
  | {
      kind: "merchant";
      provider:
        | "takumipay"
        | "xendit_qris"
        | "xendit_promptpay"
        | "xendit_paynow"
        | "xendit_duitnow"
        | "xendit_vietqr";
      merchantId: string;
      amountMinor?: number;
      currency?: "IDR" | "PHP" | "THB" | "MYR" | "VND";
      rawPayload: string;
    }
  | { kind: "x402"; resourceUrl: string };

export interface PaymentIntent {
  source: "qr" | "deeplink" | "paste";
  channel: PayChannel;
  rawScan: string;
}

/**
 * The opaque string the barcode reader / deep-link handler / paste buffer
 * hands us. `classify()` is the only function allowed to parse it.
 */
export type RawScan = string;
