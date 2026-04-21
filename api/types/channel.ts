/**
 * Payout-channel (QRIS type) response shape from the backend's
 * `GET /v1/merchants/channels?country=<iso>` endpoint (task 28 + spec
 * §6.1). Each row is a Channel from the seeded `channels` table.
 *
 * `accountFormat` is a hint string (`"phone_id"`, `"digits:10"`, etc.)
 * rather than a raw regex — mobile validators interpret it at the
 * input field. `minAmountIdr` / `maxAmountIdr` are Xendit's published
 * per-channel payout caps; `feeIdr` is the disbursement fee we'll bill
 * per successful payout.
 */
export interface TChannel {
  channelCode: string;
  label: string;
  kind: "ewallet" | "bank";
  accountFormat: string;
  priority: number;
  minAmountIdr: number;
  maxAmountIdr: number;
  feeIdr: number;
  /**
   * Public HTTPS URL of the channel's brand icon (e.g. GoPay logo).
   * Null when ops hasn't uploaded a matching asset yet — the picker
   * falls back to the kind-based Wallet/Building2 glyph.
   */
  iconUrl: string | null;
}
