# UMKM USDC → SEA Fiat Payout — Engineering Spec

**Status:** Draft v1 — ready for engineering kickoff
**Owner:** `mobile-app`, coordinates with `takumipay-api(/api)`
**Date:** 2026-04-20
**Supersedes:** the QR-scan payload handler in `app/scan-to-pay.tsx` — the camera + QR-reader scaffolding stays, but `handleBarCodeScanned` today only recognizes raw EVM (`0x…`) / Solana wallet addresses (see `app/scan-to-pay.tsx:29-62`). This spec extends it to also recognize merchant QRs, EMVCo national QRs (QRIS/PromptPay/PayNow/DuitNow/VietQR), and x402 URLs — via the pure classifier in §4.

## 1. Goal

**v1 scope: Indonesia only.** Philippines, Thailand, Malaysia, and Vietnam are on the roadmap (§12 Q3) but not in the shipping scope. The rest of this spec treats ID as the shipping target; architectural decisions preserve multi-country flexibility so adding each country later is a detector + channel-list entry, not a rewrite.

Let a TakumiAI wallet user pay any UMKM (micro/small merchant) in Indonesia by scanning one QR code. User holds USDC on any supported chain. Merchant receives **local fiat** (IDR / PHP / THB / MYR / VND) in their existing bank account or e-wallet (GoPay, OVO, DANA, LinkAja, GCash, PromptPay, TnG, VietQR, …). Settlement on-chain uses **USDC on Arc Network** (USDC is the native gas token — no gas-token juggling); off-ramp uses **Xendit Payouts**.

Three building blocks unify the flow:

| Block | Purpose | Doc |
| --- | --- | --- |
| **Arc Network** | Settlement chain. USDC = gas. Merchant treasury contract lives here. | `docs.arc.network` |
| **Circle Gateway** | Unified USDC balance substrate. User deposits once; the balance is spendable on any Gateway-supported EVM chain via signed attestation in <500 ms. Gateway is the **foundation** Nanopayments is built on. | `developers.circle.com/gateway` |
| **Circle Nanopayments** | **Primary gasless rail for this product.** Permissionless, built on Gateway, follows the x402 standard. User deposits USDC into Gateway once; each subsequent payment is an off-chain EIP-3009 authorization sent to the Nanopayments API, which gives instant merchant confirmation. Circle batches many authorizations into a single on-chain settlement — amortizing gas to effectively zero per payment and supporting transfer amounts down to $0.000001. | `developers.circle.com/gateway/nanopayments` |
| **x402** | HTTP-402 Payment Required protocol. The wire format Nanopayments uses when a merchant endpoint demands payment. EIP-3009 `transferWithAuthorization` is the underlying signing primitive. Usable standalone (Coinbase CDP facilitator on Base/Polygon/Arbitrum/World/Solana) or as the surface that the Nanopayments API sits behind. | `x402.org`, `docs.cdp.coinbase.com/x402` |
| **Circle Paymaster** (optional, for arbitrary contract calls) | ERC-4337 paymaster — pay gas in USDC for non-`transfer` operations (the initial Gateway deposit, treasury hooks, future agent-driven swaps). Not needed for the core scan→pay flow because Nanopayments already makes that gasless. | `developers.circle.com/paymaster` |
| **Xendit Payouts** | Off-ramp. Single endpoint disburses to 140+ banks + regional e-wallets across the 5 target countries. | `docs.xendit.co/docs/integration-payouts` |

## 1.1 User Roles

The product has two roles on one auth principal:

- **Payer** — every TakumiPay wallet is a payer by default. No extra signup. Needs only USDC on a supported chain. This spec's scan-to-pay flow is entirely a payer-side feature.
- **Merchant (UMKM)** — a payer who has additionally completed merchant onboarding: KYB (business name + country-specific tax ID: NPWP for ID, TIN-PH for PH, TIN-TH for TH, SSM for MY, MST for VN), a Xendit payout destination (one of `GOPAY` / `OVO` / `DANA` / `LINKAJA` / `BCA` / `PH_GCASH` / `TH_PROMPTPAY` / `MY_TNG` / `VN_ZALOPAY` / …), account number, and signed FX/fee disclosure. Only then can they **receive** IDR / PHP / THB / MYR / VND.

A single user can be both — the warung owner pays for coffee at another warung with the same wallet.

**Scope consequence:** merchant onboarding is additive to the existing payer app — same codebase, same auth, same device. It is **not** on the scan-to-pay critical path this spec covers, but ships here rather than in a separate web portal. Rationale: UMKM in SEA are mobile-first (no laptop), and keeping both roles on one auth principal simplifies the identity model.

### 1.1.1 Merchant onboarding — scan-QRIS-first, manual fallback

Onboarding is structured around the merchant's existing QRIS sticker. Most Indonesian UMKM already have one (BI has mandated QRIS for all new merchant QRs since 2020), and scanning it gives us three things for free: Merchant PAN, merchant display name, country code. That shrinks the form from five fields to four and gives the merchant a starting point that feels natural — they're holding the sticker in their hand.

Net-new entry points, three screens total:

1. **`app/login.tsx`** — add a second primary button beside "Sign in as Payer": **"Register as Merchant."** Equal visual weight.
2. **`app/merchant/signup-intro.tsx`** — fork the path:

   ```
   Do you have a QRIS sticker?
     [ 📷  Scan my QRIS ]          ← primary — most UMKM have one
     [ No QRIS yet — enter manually ]   ← fallback
   ```

   **Scan path:** camera opens, user aims at their own sticker, we decode EMVCo locally and extract `{ qrisPan, displayName (from tag 59), country (tag 58), stickerPhotoBase64 }`. Photo of the scanned frame is captured as lightweight evidence of the claim (Q9). Transition to the form screen with those fields pre-filled.

   **Manual path:** skip straight to the form with all fields blank and `qrisLink` left undefined.

3. **`app/merchant/signup-form.tsx`** — the final screen, identical markup on both paths. Four fields to ask (five if manual, because `displayName` isn't pre-filled):

   | Field | Stored as | Pre-filled on scan path? | Shown to payers? |
   | --- | --- | --- | --- |
   | Display name | `merchant.displayName` | ✅ from QRIS tag 59 (merchant edits casing — QRIS is ALL CAPS) | yes — on `/pay-merchant` confirmation |
   | WhatsApp number | `merchant.contactPhone` | ❌ not in QRIS — merchant types | no — contact/dispute only |
   | Payout channel | `merchant.xendit.channelCode` — v1 Indonesia enum: e-wallets `GOPAY` / `OVO` / `DANA` / `LINKAJA` / `SHOPEEPAY_ID`, banks `BCA` / `MANDIRI` / `BNI` / `BRI` / `CIMB` / `PERMATA` / `DANAMON` / `BSI`, plus "Don't see your bank?" expander. **Fetched from `takumipay-api GET /v1/merchants/channels?country=ID`** — not hardcoded in the app. | ❌ not in QRIS — merchant picks | no |
   | Account number | `merchant.xendit.accountNumber` — **polymorphic by channel**: e-wallet → phone (`+628…` for GoPay / OVO / DANA / LinkAja / ShopeePay); bank → digits-only account #. Input label, keyboard type, and length hint switch on the picked channel. | ❌ not in QRIS — merchant types | no |
   | Account holder name | `merchant.xendit.accountHolderName` — must match e-wallet/bank record exactly; Xendit validates. The name in QRIS tag 59 is the *store* name, not necessarily the e-wallet owner's legal name, so don't pre-fill. | ❌ not in QRIS — merchant types | no |

   **WhatsApp vs. e-wallet phone are separate fields.** Frequently the same digits in practice (personal phone also being the GoPay phone) but conceptually distinct — WhatsApp is contact-only and stays on our side; `accountNumber` goes to Xendit. When the picked channel is an e-wallet, show a one-tap checkbox `"Same as my WhatsApp number"` that copies the digits across but preserves both values in storage. When the channel is a bank, hide that checkbox entirely.

   Below the form on the scan path: a small **"Linked QRIS"** readonly card showing the captured sticker photo thumbnail + last-4 of the PAN + acquirer label decoded from tag 26 sub-00 (e.g. "9360****3456 · BCA"). On the manual path this card says "Not linked" with a muted "Link later in Settings" link.

   The flow silently creates a TakumiPay wallet in the background (so the merchant is also a payer — one auth principal), POSTs to `takumipay-api /v1/merchants/signup` with the composed `MerchantSignupRequest` (§6.1), and routes to the QR home screen. **No PT, no SKU, no NPWP, no signed contract** — Xendit disburses to individual e-wallet / bank accounts and our platform is the KYB'd entity of record.

4. **`app/merchant/qr.tsx`** — the merchant's home screen after onboarding. Centered JWS QR (§4.4), merchant display name, "Save to Photos" (writes a printable PNG) and "Share" (system share sheet → WhatsApp / email / AirDrop / print). Below, if `qrisPan` is linked, a muted line: *"Your existing QRIS sticker also works — customers can pay either one."* A quiet menu link to "Payouts" (deferred v1.1).

Returning merchants restore their wallet as usual; if the wallet has a merchant profile on record, `app/merchant/qr.tsx` is also exposed from Profile/Settings.

No per-merchant caps in v1. Tiered KYC (NIK + selfie → NPWP/PT) is a future concern when volume or regulatory posture demands it; ship the lean flow first and iterate on data.

**When to migrate to a separate merchant web portal:** only once a non-trivial fraction of merchants start asking for reconciliation dashboards, CSV export, or multi-staff access. That's post-v1.

## 2. User Journey

1. User opens app → Home (`app/index.tsx`).
2. Taps the red-glass **Scan** pill (`ScanToPayChatModeFloatingButtons` — already wired to `/scan-to-pay`).
3. Camera opens (`app/scan-to-pay.tsx`, already scaffolded with `expo-camera`).
4. QR is read → **Normalization Layer** (§4) classifies the payload.
5. Router dispatches to the correct screen:
   - `/send` — if it's a plain wallet address or wallet URI (existing behavior).
   - `/pay-merchant` **(new)** — if it's a TakumiPay merchant QR, a Xendit-issued QR, a national QR (QRIS/PromptPay/PayNow/DuitNow/VietQR), or an `x402://` / HTTP URL that answers with 402.
6. `/pay-merchant` shows the merchant, local-fiat amount, USDC cost (with live FX & fees), the source wallet/chain, and a **Pay** button.
7. On confirm → PIN → USDC is moved to the merchant's Arc treasury (directly, via Circle Gateway mint, or via x402 payment-header flow — §5).
8. Backend (`takumipay-api`) sees the on-chain receipt → calls Xendit `POST /v2/payouts` → merchant receives local fiat.
9. Push + receipt screen.

## 3. High-Level Architecture

```
                   ┌────────────────────────────────────────────┐
                   │               mobile-app (Expo)            │
 ┌───────┐  QR     │  scan-to-pay  →  PaymentIntentResolver     │
 │ User  │────────▶│                      │                     │
 └───────┘         │        ┌─────────────┴───────────┐         │
                   │        ▼                         ▼         │
                   │   /send (wallet)        /pay-merchant      │
                   │                         │                  │
                   │                    PayExecutor             │
                   │        ┌────────────┼─────────────┐        │
                   │        ▼            ▼             ▼        │
                   │  Direct-on-Arc  Gateway-mint   x402-pay    │
                   │        │            │             │        │
                   └────────┼────────────┼─────────────┼────────┘
                            │            │             │
                  ╔═════════▼════════════▼═════════════▼══════╗
                  ║            Arc Network (USDC = gas)       ║
                  ║  Treasury address (platform-owned EOA)    ║
                  ║  — backend indexes USDC `Transfer` events ║
                  ║    and matches (value, nonce) to intents  ║
                  ╚═════════════════════╤═════════════════════╝
                                        │ (watcher)
                            ┌───────────▼───────────┐
                            │    takumipay-api      │
                            │  Intent + Webhook +   │
                            │  Exchange-rate quote  │
                            └───────────┬───────────┘
                                        │ HTTPS (Basic auth)
                            ┌───────────▼───────────┐
                            │  Xendit Payouts v2    │
                            │  Bank / e-wallet IDR  │
                            │  PHP / THB / MYR / VND│
                            └───────────────────────┘
```

**Three-role separation** is preserved (see memory `feedback_role_separation.md`):

- **User** — approves a local-fiat amount in IDR/PHP/…; enters PIN/biometric.
- **Server (takumipay-api)** — decides amounts (FX, fees), mints payment intents, watches Arc, triggers Xendit. **Never** signs USDC transfers.
- **Wallet (mobile-app)** — only signs USDC transfers / x402 payment headers the server pre-shaped into an intent. Never sends fiat credentials or bank data.

## 4. The Normalization / Routing Layer

All payload detection is a **pure** function that runs client-side immediately after the barcode reader fires. It MUST NOT import React or networking. This keeps it testable under a Node harness and — per memory `feedback_chain_extension_discipline.md` — chain-specific detection goes behind a registry, not `if (ns === "X")` branches.

### 4.1 File Layout (new)

```
services/paymentIntent/
├── types.ts                  // `RawScan`, `PaymentIntent`, `PayChannel`
├── classify.ts               // pure classifier; dispatches to detectors
├── classify.test.ts
├── detectors/
│   ├── walletAddress.ts      // EVM 0x / Solana base58
│   ├── walletUri.ts          // solana:, ethereum:, EIP-681
│   ├── emvco.ts              // QRIS / PromptPay / PayNow / DuitNow / VietQR
│   ├── takumipay.ts          // Our own signed merchant QR (see §4.4)
│   └── x402.ts               // `x402://…` custom scheme + plain https → probe
├── detectorRegistry.ts       // `registerDetector(detector)` pattern
└── index.ts
```

### 4.2 Types

```ts
// services/paymentIntent/types.ts
export type PayChannel =
  | {
      kind: "wallet";
      namespace: "eip155" | "solana";
      address: string;
      /** Specific target chain when the payload carries one:
       *  - EIP-681 `ethereum:0x…@137` → `{ namespace: "eip155", chainId: 137 }`
       *  - `solana:<addr>` (no cluster) → `{ namespace: "solana", cluster: "mainnet-beta" }`
       *  - raw `0x…` address (no chain info) → `undefined` (scanner keeps the current
       *    EVM activeChain; only the namespace is guaranteed to switch).
       */
      target?:
        | { namespace: "eip155"; chainId: number }
        | { namespace: "solana"; cluster: "mainnet-beta" | "devnet" };
      amount?: bigint;
      token?: string;   // ERC-20 / SPL token address when the URI specifies one
    }
  | { kind: "merchant"; provider: "takumipay" | "xendit_qris" | "xendit_promptpay" | "xendit_paynow" | "xendit_duitnow" | "xendit_vietqr"; merchantId: string; amountMinor?: number; currency?: "IDR"|"PHP"|"THB"|"MYR"|"VND"; rawPayload: string }
  | { kind: "x402"; resourceUrl: string };

export interface PaymentIntent {
  source: "qr" | "deeplink" | "paste";
  channel: PayChannel;
  rawScan: string;
}
```

### 4.3 Classification Order

Checked top-to-bottom, first match wins:

1. **TakumiPay signed QR** — starts with `takumipay:` or decodes to our JWS payload (§4.4). Highest priority so we can offer the best UX when we control both sides.
2. **x402 scheme** — `x402://…` or `https://…` that the user pasted as an explicit pay-URL. Pure `https://` is **not** auto-probed (scanning a QR must not silently hit an arbitrary URL).
3. **EMVCo merchant QR** — CRC-valid EMV Co-Present QR; Merchant Account Info tag `26/27/28/29` indicates QRIS / PromptPay / PayNow / DuitNow / VietQR. Parse via `emvco-qrcps` decoder.
4. **Wallet URI** — `solana:…`, `ethereum:…@chainId` (EIP-681).
5. **Raw wallet address** — `0x[0-9a-fA-F]{40}` OR `isValidSolanaAddress(...)`.
6. **Unknown** — surface "We couldn't read that QR" with a retry button.

### 4.4 TakumiPay Signed QR Format

Backend issues at merchant onboarding; merchant prints it. Format:

```
takumipay:v1:<base64url(JWS)>
```

JWS (ES256 signed by `takumipay-api`) payload:

```json
{
  "merchantId":   "mch_abc123",
  "merchantName": "Warung Kopi Ibu Sari",
  "country":      "ID",
  "currency":     "IDR",
  "amountMinor":  null,              // null = open amount, let user type
  "reference":    "table-12",
  "iat":          1745000000,
  "exp":          1745604800
}
```

**Chain-agnostic by design.** The JWS carries **no `chainId`, no treasury address, no settlement-path hint.** All settlement routing (source chain, destination chain, treasury address, path selection) is resolved server-side at intent creation (§6.2). Reasons:

- **Future-proof against chain moves.** When we extend from EVM (Arc / Base) to Solana or any other namespace — the space-docking mechanism already in place via `WalletKitAdapter` — the same printed sticker works. No re-issue, no reprint for the merchant.
- **Treasury can rotate.** If a merchant treasury contract upgrades, or we move from Arc testnet → Arc mainnet, or we swap to a different settlement rail, the JWS stays valid.
- **Keeps the QR small.** Less data = denser QR = faster camera scan at small sticker sizes.

The JWS's only job is to answer "is this merchant real and signed by us?" — the answer to "how do we pay them?" is always the server's call at payment time. Signing keeps an offline-printed QR trustworthy; we verify the JWS on-device before quoting. Public key is bundled with the app and rotated via OTA (same channel as `EIP7702_ALLOWLIST`).

### 4.5 Detector Registry (Chain-Extension Discipline)

```ts
// services/paymentIntent/detectorRegistry.ts
export interface Detector {
  name: string;
  priority: number;           // lower first
  detect(raw: string): PaymentIntent | null;
}
const detectors: Detector[] = [];
export const register = (d: Detector) => { detectors.push(d); detectors.sort((a,b)=>a.priority-b.priority); };
export const runAll = (raw: string): PaymentIntent | null => {
  for (const d of detectors) { const hit = d.detect(raw); if (hit) return hit; }
  return null;
};
```

Adding a new country's QR (e.g. Lao KHQR) is just `register(khqrDetector)` in the detector's boot file — no changes to the scan screen or router.

### 4.6 Router

`app/scan-to-pay.tsx:handleBarCodeScanned` is refactored to classify, pre-switch `activeChain` when the payload is a wallet address, and hand off to the right screen. The user never picks a chain manually after scanning.

Four recognized payload shapes, in priority order:

1. **TakumiPay JWS QR** — our own signed merchant QR (§4.4). The detector verifies the JWS **locally** against the bundled public key (`EXPO_PUBLIC_TAKUMIPAY_QR_PUBKEY_JWK`) before the classifier returns. That gives us the `merchantId` + `treasury` *without* a network roundtrip, so the intent request hits `takumipay-api` with `{ merchantId: "mch_…" }` and the backend skips merchant resolution.
2. **QRIS / national EMVCo QR** — printed sticker the merchant already has from their bank / acquirer. CRC-checked only; no signature. The detector extracts the raw payload; the backend resolves the merchant by parsing EMVCo tag 26/27/28/29.
3. **Wallet address / URI** — EVM `0x…`, Solana base58, or `ethereum:…@chainId` / `solana:…?cluster=…`. Routes to `/send` with `activeChain` pre-switched.
4. **x402 resource URL** — `x402://…` or an explicitly-pasted 402-returning URL. Routes to `/pay-merchant` with raw x402 facilitator flow (§5.3).

```ts
const intent = classify(result.data);
if (!intent) { setScanned(false); /* show "unrecognized QR" toast */ return; }

switch (intent.channel.kind) {
  case "wallet": {
    // Chain auto-activation (the behavior today's scan-to-pay lacks):
    //   - EIP-681 URI with chainId → switch to that exact EVM chain.
    //   - solana: URI → switch to Solana (cluster from URI, else mainnet).
    //   - raw 0x… / base58 with no URI hint → switch to the matching
    //     namespace but keep the currently-active chain within it.
    // All three land on `useWallet.switchToChain(target)` which resolves a
    // wallet in the same namespace (creating a derived one if needed) AND
    // sets `activeChain`. Single seam — no `if (ns === "X")` in the scanner.
    await switchToScannedTarget(intent.channel);
    return router.replace({
      pathname: "/send",
      params: { recipientAddress: intent.channel.address,
                amount: intent.channel.amount?.toString(),
                token: intent.channel.token },
    });
  }
  case "merchant": {
    // Two sub-cases converge on /pay-merchant, but the createIntent
    // request looks different:
    //   - provider === "takumipay"  → JWS already verified locally; send
    //                                  { merchantId, rawPayload? } — server
    //                                  skips merchant lookup.
    //   - provider === "xendit_qris" → server parses EMVCo and resolves
    //                                   the merchant from our registry.
    // The sub-cases share a screen because the UX beyond this point is
    // identical (USDC→IDR quote, Nanopay sign, Xendit payout).
    return router.replace({
      pathname: "/pay-merchant",
      params: { intent: JSON.stringify(intent) },
    });
  }
  case "x402":
    return router.replace({
      pathname: "/pay-merchant",
      params: { intent: JSON.stringify(intent) },
    });
}
```

**TakumiPay JWS detector** (`services/paymentIntent/detectors/takumipay.ts`) — the detail worth pinning so the engineer doesn't improvise the verification:

```ts
import { jwtVerify, importJWK } from "jose";            // react-native-compatible via polyfills
import { publicKeyJwk } from "@/constants/takumipayKey"; // bundled JWK, rotatable via OTA

export const takumipayDetector: Detector = {
  name: "takumipay",
  priority: 10,
  async detect(raw) {
    if (!raw.startsWith("takumipay:v1:")) return null;
    const jws = raw.slice("takumipay:v1:".length);
    try {
      const key = await importJWK(publicKeyJwk, "ES256");
      const { payload } = await jwtVerify(jws, key, { algorithms: ["ES256"] });
      // payload shape: { merchantId, merchantName, country, currency, amountMinor, treasury, iat, exp }
      return {
        source:  "qr",
        rawScan: raw,
        channel: {
          kind:        "merchant",
          provider:    "takumipay",
          merchantId:  payload.merchantId as `mch_${string}`,
          amountMinor: (payload.amountMinor as number) ?? undefined,
          currency:    payload.currency as "IDR",
          rawPayload:  raw,                                // still echoed so server can log the original
        },
      };
    } catch {
      // Invalid signature / expired / malformed — fall through, other
      // detectors will not match "takumipay:v1:…" either, so the scanner
      // surfaces the generic "unrecognized QR" toast. Never silently
      // forward a tampered QR to /pay-merchant.
      return null;
    }
  },
};
```

Classifier runs synchronously everywhere else — this is the one detector that returns a Promise. `classify()` awaits each detector in priority order so the scanner pauses a few ms on TakumiPay JWS verification, which is fine (the user has already committed to the scan by the time the camera fires).

**Public key rotation:** the JWK lives in `constants/takumipayKey.ts` and ships with the app binary. When `takumipay-api` rotates its signing key, we push an EAS OTA update that replaces the JWK. Same release channel as `EIP7702_ALLOWLIST`. Scanners running on pre-rotation app versions will reject the new-key JWS (correctly — they shouldn't trust a key they've never seen); nudge users to update via the existing in-app update banner.

`switchToScannedTarget` is a thin `useWallet` helper, **not** a new `WalletKitAdapter` method — activation is a wallet-app concern, not a chain-protocol concern. Under the hood it:

1. Resolves the destination `ChainConfig` from `supportedChains` (EVM) or the Solana cluster table.
2. If `activeWallet.namespace` already matches the target namespace, just calls `setActiveChain(config)`.
3. Otherwise calls `setActiveWallet(indexOfFirstWalletInTargetNamespace)` **then** `setActiveChain(config)` — mirroring the existing namespace-align invariant in `hooks/useWallet.ts` (see `app/wallet.tsx:68-85` for the current pattern).

This is the piece missing in today's scanner: `app/scan-to-pay.tsx:44-57` routes to `/send` for both EVM and Solana addresses but never touches `activeChain`, so a user who scans a Solana address while their active chain is Ethereum lands on a broken send screen. The refactor fixes that.

## 5. Payment Execution Paths

`/pay-merchant` is a single screen that mirrors `app/withdraw.tsx` visually (the UMKM off-ramp already has the IDR e-wallet row in that screen — see `PAYMENT_PLATFORMS`, lines 28–33), but the executor picks the cheapest path:

### 5.1 Path A — Direct on Arc (preferred when the user already holds USDC on Arc)

- `WalletKit.sendTokenTransfer({ token: USDC_ARC, to: treasury, amount })` — USDC on Arc is both the asset and the gas token, so this is a single ERC-20 `transfer` call. (USDC native precision on Arc is 18 decimals; the ERC-20 interface at `0x3600…0000` exposes 6 decimals — `EvmWalletKit` picks the interface view so existing 6-decimals math keeps working.)
- Backend watches Arc via a confirmed block listener keyed on `MerchantTreasury.Settled(intentId, payer, amount)` event.

### 5.2 Path B — Circle Nanopayments *(the primary gasless rail)*

This is the path we default to for every scan-to-pay. It combines the three Circle primitives — Gateway (the deposit substrate), EIP-3009 (the signing format), and x402 (the wire protocol) — into a **single permissionless API** that delivers gas-free USDC transfers as small as $0.000001 with instant merchant confirmation. Circle batches many authorizations into one on-chain settlement, so per-payment gas amortizes to effectively zero.

**One-time setup per user** (`/onboarding/nanopay-deposit`):

1. User deposits USDC into a **Gateway Wallet** contract on any Gateway-supported EVM source chain they already hold USDC on (Ethereum, Base, Arbitrum, OP Mainnet, Polygon PoS, Avalanche, Unichain today; Arc on Circle's roadmap). This is the **only** on-chain action the user ever pays gas for in the normal flow. If the user's source chain is Base/Arbitrum, we optionally wrap the deposit with Circle Paymaster so that gas on this step is USDC-denominated too (see §5.4).
2. From this point on, the user's USDC balance is **unified across chains** — Circle tracks it in their Gateway ledger.

**Per-payment flow** (this is what fires every time the user taps Pay on `/pay-merchant`):

1. `POST /v1/pay/intents` — backend issues a quote (§6.1). Because the target is Nanopayments, the response includes a `nanopay` block with the EIP-3009 authorization fields the client must sign.
2. Mobile app calls `kit.signTransferWithAuthorization({ … })` — the wallet signs an **EIP-3009 `TransferWithAuthorization`** typed-data message. This is an off-chain `signTypedData` call. No broadcast. No approval dialog from a node. No gas from the user.
3. Mobile app POSTs the signed authorization to the Nanopayments API (`POST /v1/transfer` on Circle's Gateway) — either directly with the user's session token, or through `takumipay-api` as a proxy so merchant confirmation flows stay server-driven. Circle validates the signature, adjusts the user's unified ledger balance, and **returns an instant signed attestation to the merchant** (our backend) — this is the confirmation we show the user in <500 ms.
4. Backend receives the Nanopayments attestation → marks the intent `SETTLED` → immediately fires the Xendit payout (§6.3). The UMKM's IDR/PHP/THB/MYR/VND lands within seconds.
5. Later (seconds to minutes, batched), Circle submits the aggregated burn-intent set to the Gateway Minter on the destination chain (Arc, once supported; otherwise the merchant's settlement chain). USDC is minted to the merchant treasury, and the equivalent is burned on the user's source chain — user and merchant both saw completion long before this final settlement.

**Why this is the right default for UMKM:**

- **Truly gasless for the user.** No ETH / MATIC / gas token top-up anywhere, ever. The single deposit step can itself be gasless if paired with Paymaster on Base/Arbitrum.
- **Sub-cent amounts work.** UMKM coffee is Rp 5 000 (~$0.30). Street-vendor items go down to Rp 1 000 (~$0.06). Traditional on-chain transfers would burn that in gas. Nanopayments explicitly targets $0.000001 minimums.
- **Instant merchant UX.** Circle's attestation lands in <500 ms, so the merchant sees "PAID" on their screen before the user's phone leaves the QR code.
- **x402-compatible.** The same signed EIP-3009 authorization is a valid `X-PAYMENT` header for any x402 merchant. Agent-driven payments (§8) reuse the exact primitive with zero extra code.
- **Permissionless.** No Circle Developer account needed on the critical path — matches the product's distribution posture (any user with USDC can pay any registered UMKM).

### 5.3 Path C — Direct x402 on a non-Nanopayments merchant

If we scan an x402 resource from a merchant that isn't registered with our backend (arbitrary internet merchant, agent-initiated purchase), we fall through to the raw x402 flow: `fetch(resource)` → 402 → sign EIP-3009 → re-fetch with `X-PAYMENT` header. The Coinbase CDP facilitator settles on Base/Polygon/Arbitrum/World/Solana; on Arc we operate our own `x402-facilitator` instance. From the mobile app's perspective, the signing step is **identical** to the Nanopayments one — only the POST destination differs. The quote endpoint decides which one to target.

### 5.4 Gasless UX — Summary

The product promise: **user holds only USDC, pays only USDC, never touches ETH / MATIC / ARB / SOL**. Picking the mechanism is a server decision, not a wallet decision.

| Scenario | Gasless mechanism | Who pays on-chain gas | Notes |
| --- | --- | --- | --- |
| **Every merchant payment (default)** | **Circle Nanopayments** — off-chain EIP-3009 authorization posted to Gateway. Circle batches and settles later. | Circle's relayer, amortized across all bundled authorizations | User sees zero gas forever after the initial deposit. |
| Direct on Arc (fallback when user already holds USDC on Arc, merchant prefers same-chain immediate settlement) | Native — USDC is the gas token on Arc | User's wallet (in USDC cents) | No second asset exists. Useful for very large transfers where batching latency matters. |
| One-time Gateway deposit (onboarding only) | **Circle Paymaster** (ERC-4337) on source chains that support it (Arbitrum, Base today) | Bundler pays ETH; paymaster pulls USDC via EIP-2612 `permit`. 10% gas surcharge in USDC. | Makes even the *initial* deposit gasless for users on Arb/Base. Other source chains: user pays network gas for this single step. |
| Arbitrary merchant x402 resource (non-Nanopayments, agent mode) | EIP-3009 via x402 facilitator | Facilitator (CDP or our own on Arc) | Same signing UX as Nanopayments. Different POST target. |
| Contract calls that aren't USDC transfers (treasury hooks, future agent swaps) | **Circle Paymaster** | Bundler pays ETH; paymaster pulls USDC | Only relevant post-v1. Not on the scan-to-pay critical path. |

**Wallet-kit impact.** Per the chain-extension discipline (memory: `feedback_chain_extension_discipline.md`), we add two methods behind the same `WalletKitAdapter` port rather than branching on namespace:

```ts
// services/walletKit/types.ts (additions, M2 for EIP-3009, M3 for Paymaster)
interface WalletKitAdapter {
  /**
   * Signs EIP-3009 `TransferWithAuthorization` typed-data for USDC.
   * Used by Circle Nanopayments (the default rail) and by stand-alone
   * x402 merchant payments. Returns the raw 65-byte signature.
   */
  signTransferWithAuthorization?(args: {
    wallet: TWallet;
    chain: ChainConfig;
    usdc: string;
    from: string; to: string;
    valueMicros: bigint;
    validAfter: number; validBefore: number;
    nonce: `0x${string}`;
  }): Promise<`0x${string}`>;

  /**
   * Builds and signs an ERC-4337 UserOp that pays gas via Circle
   * Paymaster in USDC. Only used for the one-time Gateway deposit
   * (and future arbitrary contract calls). Nanopayments does not use
   * this — it's gasless by design.
   */
  sendUserOpWithUsdcPaymaster?(args: {
    wallet: TWallet;
    chain: ChainConfig;
    calls: Array<{ to: string; data: `0x${string}`; value: bigint }>;
    paymaster: string;
    permit: { deadline: bigint; v: number; r: `0x${string}`; s: `0x${string}` };
  }): Promise<{ userOp: UserOperation; userOpHash: `0x${string}` }>;
}
```

EVM kit implements both. Solana kit leaves them `undefined` (Solana's fee-payer pattern is a different primitive — see §12 Q7). UI code branches on **presence of the method**, not on namespace.

### 5.5 Built-in Wallet ↔ Nanopayments Integration

The app already has a first-party wallet (EVM + Solana, under the `WalletKitAdapter` port at `services/walletKit/types.ts:66`). The integration rules — locked, not up for rediscussion:

**Scope decisions**

- **Nanopayments is EVM-only in v1.** EIP-3009 is defined on USDC's EVM contracts. The Solana fee-payer workaround (§12 Q7) is not in scope. `SolanaWalletKit.signTransferWithAuthorization` stays `undefined`; the merchant-pay screen detects its absence and either (a) disables the scan-to-pay pill while the active wallet is Solana, with a "Switch to your EVM wallet" CTA, or (b) auto-switches to the user's EVM wallet under the same account if present. Pick (b) — mirrors the chain-auto-switch in §4.6.
- **EVM source chain for v1 testnet = Base Sepolia.** Reason: Circle Gateway already supports it, USDC faucet at `faucet.circle.com`, zero bridge dependency. **Destination chain for v1 testnet = Arc Testnet (chainId `5042002`).** When Circle lights up Arc in Gateway (§12 Q1), this is already the target; until then, the settlement half of Path B runs on Base Sepolia too — the merchant treasury contract deploys on both, and the backend watches whichever is configured. *One knob, set in `takumipay-api` config; mobile doesn't know the difference.*
- **Nanopayments submission is proxied through `takumipay-api`.** The mobile app never POSTs directly to `api.circle.com`. Reasons: (1) we want the attestation webhook uniform with the rest of our backend events so Xendit payout can fire off the same handler; (2) audit trail — every payment has a server-side record tied to the intent id; (3) we keep the Circle API key out of the device. Env flag `EXPO_PUBLIC_CIRCLE_NANOPAY_SUBMIT_VIA_SERVER` stays `true` — it exists only as a dev-time escape hatch.

**Wallet-kit surface (concrete additions)**

```ts
// services/walletKit/types.ts  (add to the existing WalletKitAdapter)

/**
 * EIP-3009 `TransferWithAuthorization` — the signing primitive Circle
 * Nanopayments accepts. EVM-only; Solana kit leaves this undefined.
 *
 * The adapter does NOT broadcast — it only returns a 65-byte signature.
 * Submission to Nanopayments is the caller's job (goes through our
 * server proxy, see §6.5).
 */
signTransferWithAuthorization?(args: {
  wallet: TWallet;
  chain: ChainConfig;                // source chain carrying the USDC balance
  usdc: `0x${string}`;                // e.g. Base Sepolia USDC
  from: `0x${string}`;
  to: `0x${string}`;                  // merchant treasury or Nanopayments sink
  valueMicros: bigint;                // 6-decimal USDC units
  validAfter: number;                 // unix seconds; usually 0
  validBefore: number;                // unix seconds; server-controlled
  nonce: `0x${string}`;               // 32-byte random, generated by the server
}): Promise<`0x${string}`>;

/**
 * One-time Gateway deposit wrapped as an ERC-4337 UserOp that pays gas
 * in USDC via Circle Paymaster. Only used on source chains where
 * Paymaster is live (Base, Arbitrum). On chains without Paymaster, fall
 * back to a plain viem `sendTransaction` — caller picks; the kit just
 * exposes both.
 *
 * EVM-only. Solana kit leaves this undefined.
 */
sendUserOpWithUsdcPaymaster?(args: {
  wallet: TWallet;
  chain: ChainConfig;
  calls: Array<{ to: `0x${string}`; data: `0x${string}`; value: bigint }>;
  paymaster: `0x${string}`;
  permit: { deadline: bigint; v: number; r: `0x${string}`; s: `0x${string}` };
}): Promise<{ userOpHash: `0x${string}` }>;
```

**New service module:**

```
services/nanopay/
├── buildAuthorization.ts      // intent.nanopay → EIP-712 typed-data object (pure)
├── buildAuthorization.test.ts
├── submitAuthorization.ts     // POST to takumipay-api proxy, returns attestation
├── gatewayDeposit.ts          // one-time onboarding deposit into GatewayWallet
├── gatewayDeposit.test.ts
├── usePaymentIntent.ts        // TanStack Query hook — status polling until SETTLED
└── index.ts
```

**Happy-path wiring:**

```ts
// app/pay-merchant.tsx (sketch)
const intent  = await api.createIntent({ merchant, amountMinor, currency: "IDR" });
const payload = buildAuthorization(intent.nanopay);                 // pure
const sig     = await kit.signTransferWithAuthorization(payload);   // wallet-sign only
const result  = await submitAuthorization(intent.id, { signature: sig, payload });
// result.status === "SETTLED" at this point — backend has already
// called Xendit; merchant's GoPay/OVO/bank is being credited.
```

**Why this design fits the existing app**

- The signer path is identical to every other `signTypedData` call the app already makes (SIWE, EIP-712 dapps) — no new crypto primitives, no new keystore access pattern, no new biometric prompt plumbing. Just a new typed-data shape.
- The only on-chain transaction in the whole flow is the *one-time* Gateway deposit during merchant-payer onboarding. Every subsequent scan-to-pay is signing-only — gasless, silent, <500 ms attestation.
- `WalletKitAdapter` stays the only seam for chain extension (memory `feedback_chain_extension_discipline.md`). No `if (namespace === "solana")` branches leak into the merchant-pay screen.

### 5.6 Path Selector

```
if (user has NOT completed Gateway deposit)      → prompt onboarding (one-time)
else if (merchant registered for Nanopayments)   → Path B (Nanopayments)        ← default
else if (intent.channel.kind === "x402")         → Path C (raw x402 + EIP-3009)
else if (user has USDC on Arc ≥ quote.usdc)      → Path A (direct on Arc)
else                                             → show "Top up USDC" CTA
```

All paths converge on the same `takumipay-api` intent id, so the Xendit payout branch is uniform.

## 6. Backend Contracts (`takumipay-api`)

All types below are the **canonical interfaces** the mobile app codes against. Implementation lives in a sibling PR to `takumipay-api`, but these shapes are binding. Authentication on every endpoint is `Authorization: Bearer <SIWE-session>` (the existing mobile-app auth, see `hooks/queries/useAuth.ts`), unless noted.

### 6.0 Shared types

```ts
// api/types/payouts.ts

/** Xendit channel code, narrowed to Indonesia v1. Update the enum when we ship other countries. */
export type ChannelCode =
  | "GOPAY" | "OVO" | "DANA" | "LINKAJA" | "SHOPEEPAY_ID"
  | "BCA" | "MANDIRI" | "BNI" | "BRI" | "CIMB" | "PERMATA" | "DANAMON" | "BSI"
  | (string & { readonly __brand: "OtherIdBank" });    // full Xendit list via /v1/merchants/channels

export type ChannelKind = "ewallet" | "bank";

export interface ChannelDescriptor {
  channelCode:   ChannelCode;
  label:         string;                              // "GoPay", "BCA", …
  kind:          ChannelKind;
  accountFormat: "phone_id" | `digits:${number}`;     // e.g. "digits:10" = 10-digit account
  priority:      number;                              // lower = shown first in picker
}

export type Currency   = "IDR";                       // v1 locked to IDR; add union when expanding
export type CountryISO = "ID";

export interface MoneyMinor {
  amountMinor: number;                                // 25_000 IDR = 25000
  currency:    Currency;
}

export interface USDCAmount {
  amountMicros: number;                               // 6-decimal USDC: 1_540_000 = 1.54 USDC
  chainId:      number;
}

export interface FxQuote {
  rate:   string;                                     // decimal as string to avoid float drift — "16234.50"
  pair:   `USDC/${Currency}`;
  source: string;                                     // "coinbase+wise"
}

export interface FeeBreakdown {
  networkUsdMicros: number;                           // gas + facilitator margin in USDC micros
  platformBps:      number;                           // our take, basis points (25 = 0.25%)
}
```

### 6.1 Merchant lifecycle

```ts
// api/types/merchant.ts

/**
 * POST /v1/merchants/signup
 * Called once from `app/merchant/signup.tsx`. Idempotent on (userId, latest submission).
 */
export interface MerchantSignupRequest {
  displayName:       string;                          // 1..80 chars, shown to payers
  contactPhone:      `+${number}`;                    // WhatsApp, E.164
  country:           CountryISO;                      // "ID" for v1
  channelCode:       ChannelCode;
  accountNumber:     string;                          // e-wallet phone (E.164) OR bank account digits
  accountHolderName: string;                          // must match the e-wallet/bank record exactly
  /** Optional — captured from scanning the merchant's existing QRIS sticker during onboarding. */
  qrisLink?: {
    qrisPan:           string;                        // tag 26 sub-tag 02 from their scanned QRIS
    stickerPhotoKey:   string;                        // object-storage key for the lightweight-evidence upload
  };
}

export interface MerchantProfile {
  merchantId:        `mch_${string}`;                 // ULID
  displayName:       string;
  contactPhone:      `+${number}`;
  country:           CountryISO;
  channel: {
    channelCode:     ChannelCode;
    accountNumberLast4: string;                       // redacted echo only
    accountHolderName:  string;
  };
  /**
   * Merchant PAN from their *existing* QRIS sticker, captured at
   * onboarding. When set, a TakumiPay user scanning the merchant's
   * QRIS sticker resolves to this profile (no need for the merchant
   * to display the TakumiPay JWS QR). Null = merchant only uses the
   * JWS QR. Unique across merchants — first claim wins.
   */
  qrisPan:           string | null;
  createdAt:         number;                          // unix seconds
  qr: {
    jws:             string;                          // `takumipay:v1:<base64url(JWS)>`
    issuedAt:        number;
    expiresAt:       number | null;                   // null = non-expiring
  };
}

/** POST /v1/merchants/signup   → 201 Created, body: MerchantProfile */
/** GET  /v1/merchants/me       → 200 OK,     body: MerchantProfile */
/** PATCH /v1/merchants/me      → 200 OK,     body: MerchantProfile
 *  Partial update of channel or display fields. Changing the channel invalidates the current QR and re-issues.
 */
export type MerchantPatch = Partial<Pick<
  MerchantSignupRequest,
  "displayName" | "contactPhone" | "channelCode" | "accountNumber" | "accountHolderName"
>>;

/** GET /v1/merchants/me/qr      → 200 OK
 *  Returns a fresh JWS (rotates the embedded `iat`). Use when the merchant wants a new printout.
 */
export interface MerchantQrResponse {
  jws:       string;
  issuedAt:  number;
  expiresAt: number | null;
  pngBase64: string;                                  // server-rendered QR image, convenient for Save-to-Photos
}

/** GET /v1/merchants/channels?country=ID   → 200 OK
 *  Ranked list. Mobile renders in order, does NOT sort client-side (filter-at-source rule).
 */
export type MerchantChannelsResponse = ChannelDescriptor[];

/** GET /v1/merchants/me/payouts?limit=20&cursor=…   → 200 OK
 *  Paginated. Used by the (deferred) payouts screen — not on the critical path for M1-M3.
 */
export interface MerchantPayoutsResponse {
  items:      MerchantPayoutItem[];
  nextCursor: string | null;
}
export interface MerchantPayoutItem {
  intentId:       `pi_${string}`;
  status:         "PENDING" | "SETTLED" | "PAID_OUT" | "FAILED";
  paidAt:         number | null;
  fiat:           MoneyMinor;
  usdcReceived:   USDCAmount;
  xenditPayoutId: string | null;
}
```

### 6.2 Payment intent lifecycle

```ts
// api/types/payment.ts

export type PaymentProvider =
  | "takumipay" | "xendit_qris"
  // future: | "xendit_promptpay" | "xendit_paynow" | "xendit_duitnow" | "xendit_vietqr"
  ;

export interface CreateIntentRequest {
  merchant: {
    provider:    PaymentProvider;
    /** Present when the scanned QR is our own TakumiPay JWS (merchant already resolved client-side). */
    merchantId?: `mch_${string}`;
    /** Raw QRIS/EMVCo payload — backend parses & resolves the merchant. */
    rawPayload?: string;
  };
  amountMinor?: number;            // null when the QR is open-amount; user types it in /pay-merchant
  currency:     Currency;
  /** Source chain the user is *likely* to pay from. Server may override if it picks a different path. */
  sourceHint?: { namespace: "eip155"; chainId: number };
}

export type PaymentPath = "nanopay" | "x402" | "direct_arc";

export interface NanopayPayload {
  usdc:          `0x${string}`;
  sourceChainId: number;
  from:          `0x${string}`;
  to:            `0x${string}`;    // merchant treasury (or Nanopayments sink depending on Circle's final routing)
  valueMicros:   number;
  validAfter:    number;
  validBefore:   number;
  nonce:         `0x${string}`;    // 32-byte random, server-generated per intent
  /** Where the mobile app POSTs the signed authorization. Always points to our proxy. */
  submitTo:      string;
}

export interface X402Payload {
  resource: string;
  scheme:   "exact";
  network:  "base" | "base-sepolia" | "arbitrum" | "polygon" | "solana";
}

export interface GaslessBlock {
  mode:              "nanopay" | "arc_native" | "x402_eip3009" | "none";
  requiresDeposit:   boolean;      // true on the user's very first Nanopay — show the onboarding sheet
  deposit?: {
    chainId:            number;
    gatewayWallet:      `0x${string}`;
    amountMicros:       number;
    useCirclePaymaster: boolean;   // true on Base/Arbitrum where Paymaster is live
  };
}

/** POST /v1/pay/intents   → 201 Created */
export interface PaymentIntent {
  intentId:  `pi_${string}`;
  createdAt: number;
  expiresAt: number;                            // 60s quote freeze
  merchant: {
    merchantId:  `mch_${string}`;
    displayName: string;                        // echo for the payer's confirmation screen
  };
  fiat:    MoneyMinor;
  usdc:    USDCAmount & { treasury: `0x${string}` };
  fx:      FxQuote;
  fees:    FeeBreakdown;
  path:    PaymentPath;
  nanopay: NanopayPayload | null;
  x402:    X402Payload    | null;
  gasless: GaslessBlock;
  status:  "QUOTED" | "SIGNED" | "SETTLED" | "PAID_OUT" | "FAILED" | "EXPIRED";
}

/** GET /v1/pay/intents/:id   → 200 OK: PaymentIntent
 *  Same shape as create. Mobile uses this for status polling (TanStack Query 3-s stale-time, not shorter — Circle attestation is <500 ms so one poll after POST is usually enough).
 */

/** POST /v1/pay/intents/:id/nanopay
 *  Mobile POSTs the signed EIP-3009 authorization. Backend proxies to Circle Nanopayments,
 *  receives the attestation, stores it, and eagerly kicks off the Xendit payout.
 */
export interface NanopaySubmitRequest {
  signature: `0x${string}`;          // 65-byte output of kit.signTransferWithAuthorization
  /** Echo of the fields from PaymentIntent.nanopay so the server can sanity-check before forwarding. */
  payload:   NanopayPayload;
}
export interface NanopaySubmitResponse {
  intentId:     `pi_${string}`;
  status:       "SETTLED" | "FAILED";
  attestation:  { id: string; receivedAt: number } | null;
  failure?:     { code: NanopayFailureCode; message: string };
}
export type NanopayFailureCode =
  | "SIGNATURE_INVALID"
  | "NONCE_REUSED"
  | "AUTHORIZATION_EXPIRED"
  | "INSUFFICIENT_GATEWAY_BALANCE"      // deposit first
  | "CIRCLE_UPSTREAM_ERROR"
  | "QUOTE_EXPIRED";

/** POST /v1/pay/intents/:id/deposit-receipt
 *  One-time, fired after the user's Gateway deposit tx confirms (onboarding).
 *  Backend waits for the Gateway attestation, then the intent it belongs to can proceed to Nanopay.
 */
export interface DepositReceiptRequest {
  txHash:        `0x${string}`;
  chainId:       number;
  useCirclePaymaster: boolean;
}
export interface DepositReceiptResponse {
  depositId: string;
  status:    "PENDING_ATTESTATION" | "CONFIRMED" | "FAILED";
}
```

### 6.3 Realtime updates

Mobile watches intent status via TanStack Query polling on `GET /v1/pay/intents/:id`. For push-style UX (notification banner when Xendit payout finishes and the merchant says "OK thanks"), `takumipay-api` emits FCM / APNs to the payer. SSE is **not** in v1 scope — polling is cheap because Nanopay attestation is sub-second.

### 6.4 Xendit payout (server-internal)

The mobile app never calls Xendit. This section is here so engineers reading the spec understand what our server does after `NanopaySubmitResponse.status === "SETTLED"`:

```ts
// In `takumipay-api` — runs after Nanopay attestation is received.
await fetch("https://api.xendit.co/v2/payouts", {
  method: "POST",
  headers: {
    Authorization:     `Basic ${base64(XENDIT_SECRET_KEY + ":")}`,
    "Idempotency-key": intent.intentId,                             // same id on retry
    "Content-Type":    "application/json",
  },
  body: JSON.stringify({
    reference_id: intent.intentId,
    channel_code: merchant.channel.channelCode,
    channel_properties: {
      account_number:      merchant.channel.accountNumber,
      account_holder_name: merchant.channel.accountHolderName,
    },
    amount:      intent.fiat.amountMinor,
    currency:    intent.fiat.currency,
    description: `TakumiPay ${intent.intentId}`,
  }),
});
```

Xendit callbacks `POST /webhooks/xendit` with `x-callback-token` for verification (`takumipay-api` side). On `PAID` → intent → `PAID_OUT`. On `FAILED` → intent → `FAILED`, refund handling per §12 Q5.

**Pluggable payout provider (space-docking mechanism, future-proofing).** The Xendit call above lives behind a `PayoutProvider` interface on `takumipay-api`. Same pattern as `WalletKitAdapter` on mobile: one port, many adapters. v1 ships a single `XenditPayoutProvider`. Future providers (Flip, Paymongo, dLocal, or our own acquirer relationship if we land BI-licensed rails) slot in as `FlipPayoutProvider` / `PaymongoPayoutProvider` without touching the intent-settlement core. Selection is per-merchant (store `merchant.payoutProvider = "xendit"`) or per-country, decided at intent creation, not at signing time. Mobile never sees the provider name — it always reads `intent.status` / `intent.fiat` and never distinguishes which rail pushed the IDR.

### 6.5 Why the Nanopayments proxy (decision locked)

`EXPO_PUBLIC_CIRCLE_NANOPAY_SUBMIT_VIA_SERVER=true` is the v1 default. The mobile app hits `takumipay-api /v1/pay/intents/:id/nanopay`; our backend is the one that talks to Circle. Rationale:

- **Uniform pipeline.** Every settled intent flows through the same backend handler that fires Xendit payout, writes receipts, emits FCM. No branching between "mobile hit Circle directly" vs "server hit Circle."
- **Audit trail.** Every payment has a server-side row tied to the intent id before Circle even returns. Disputes and refunds have a canonical record.
- **Key hygiene.** Circle Developer API key (for Gateway enrollment / attestation inspection) stays server-side. The mobile app carries no Circle credentials — Nanopayments is permissionless on the client side anyway (§5.2), so this costs us nothing.
- **Evolvability.** When we add our own Arc facilitator or swap in CCTP v2 as a fallback, the mobile app doesn't learn about it. One endpoint, stable shape.

## 7. On-Chain: Arc Network Specifics

- **RPC (testnet):** `https://rpc.testnet.arc.network`
- **Explorer:** `https://testnet.arcscan.app`
- **USDC ERC-20 interface:** `0x3600000000000000000000000000000000000000` — **6 decimals** in the interface view, 18 in the native gas view. `EvmWalletKit.parseNativeAmount` must stay on the ERC-20 view when doing merchant transfers; native-gas math only comes in for `estimateGas`.
- **CCTP v2 fallback contracts (testnet):**
  - `TokenMessengerV2` `0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA`
  - `MessageTransmitterV2` `0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275`
  - `TokenMinterV2` `0xb43db544E2c27092c107639Ad201b3dEfAbcF192`
- **Gateway contracts (testnet):**
  - `GatewayWallet` (source chains) `0x0077777d7EBA4688BDeF3E311b846F25870A19B9`
  - `GatewayMinter` (mint target) `0x0022222ABE238Cc2C7Bb1f21003F0a260052475B`
- **Mainnet addresses:** TBD — filed in §12 Q1 until Arc publishes its mainnet reference page. **v1 ships on testnet.**
- **Treasury:** v1 uses a **platform-owned EOA** (not a contract) as the USDC destination for every merchant payment. Backend matches incoming `Transfer(to=treasury, value, …)` events to pending intents by the `(value, nonce)` pair set at intent creation (§6.2 `NanopayPayload`). A `MerchantTreasury.sol` contract — referenced in the architecture diagram, §5.1, §10.1, and §13 as a forward-looking concept — is **out of v1 scope.** We'll add it when bulk settlement, on-chain fee splits, or per-merchant escrow become load-bearing. Until then, treasury = one EOA per environment, custody = our relayer key, rescue = off-chain.

Add a new `ChainConfig` entry to `constants/configs/chainConfig.ts`:

```ts
{
  namespace: "eip155",
  chain: {
    id: 5042002,
    name: "Arc Testnet",
    nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
    rpcUrls:        { default: { http: ["https://rpc.testnet.arc.network"] } },
    blockExplorers: { default: { name: "Arcscan", url: "https://testnet.arcscan.app" } },
  },
  iconUrl: "…",                   // TODO — pull official from docs.arc.network
  isTestnet: true,
},
```

No new `WalletKitAdapter` is needed — Arc is EVM, so `EvmWalletKit` already handles address validation, native balance, and signed transfers. What is new is a **tokenized** write path on `WalletKitAdapter` (§11 follow-up) so we stop piggybacking on `erc20Abi` calls inline from `app/send.tsx:414-421`.

## 8. AI Agent Mode (future extension, not v1 scope)

Same `PaymentIntent` and same `PayExecutor` can be invoked by the Takumi Agent when a user says "book me a Gojek at this address." Agent returns a structured UI card that embeds the intent id and the x402 resource — user taps Pay, same `/pay-merchant` flow fires. Per memory `feedback_agent_prompt_namespace.md`, the wallet-context prompt surfaces `namespace` and merchant availability only — it does not prescribe "EVM-only" or list disabled tools.

## 9. Security Model

- **QR authenticity** — TakumiPay QRs are JWS-signed (ES256). EMVCo QRs carry CRC-16 but no signature; we require the *merchant_id* returned by `takumipay-api`'s national-QR lookup to be whitelisted before quoting — unknown merchant IDs fall back to a "merchant not registered" error instead of proceeding.
- **Replay** — intent id is the idempotency key end-to-end (Xendit `Idempotency-key` header, Gateway attestation, on-chain `Settled(intentId, …)` event). Same id can be retried safely.
- **FX manipulation** — the mobile app shows the *local-fiat* amount as the source of truth. USDC amount is a function of it. User approves IDR, not USDC micros. Rate freeze is 60 s; after that we re-quote before the signing modal opens.
- **Scope creep** — the mobile app never handles merchant bank credentials. Xendit creds live in `takumipay-api` only.
- **Clipboard hygiene** — see `docs/clipboard-policy.md`; do not copy any merchant token / intent id to clipboard.

### 9.1 Error States Matrix (production-ready UX copy)

Every error the mobile app can encounter on the scan→pay→settle path, mapped to source, UX copy, and recovery action. Engineer implements a single `<PaymentError>` component that switches on `code`. Copy is the v1 English baseline — i18n wiring lands alongside the component.

| Code | Source | Shown as | Primary CTA | Secondary / fallback |
| --- | --- | --- | --- | --- |
| `QR_UNRECOGNIZED` | scanner classifier | "We couldn't read that QR code. Try again." | "Scan again" (reopens camera) | Back |
| `QR_TAMPERED` | TakumiPay JWS detector (signature fail) | "This TakumiPay QR isn't valid. It may have been altered." | "Scan again" | Help: `support@…` |
| `MERCHANT_NOT_ONBOARDED` | `POST /v1/pay/intents` (404) | "This merchant isn't on TakumiPay yet. Invite them?" | "Copy invite link" (WhatsApp share) | "Scan again" |
| `PAN_ALREADY_CLAIMED` | `POST /v1/merchants/signup` (409) | "This QRIS sticker is already linked to another TakumiPay merchant. If this is you, open a dispute." | "Contact support" | "Link a different QRIS" |
| `QUOTE_EXPIRED` | intent `expiresAt` elapsed OR Nanopay submit 410 | "The quoted rate expired. Refreshing…" | auto-retry → new `POST /v1/pay/intents` | Back |
| `INSUFFICIENT_GATEWAY_BALANCE` | Nanopay submit (`NanopayFailureCode`) | "You don't have enough USDC on TakumiPay. Top up first." | "Top up USDC" (launches onboarding-deposit flow) | Back |
| `REQUIRES_DEPOSIT` | `gasless.requiresDeposit: true` on first payment | Onboarding sheet: "One-time setup: deposit USDC so future payments are instant & free." | "Deposit now" (§5.2 step 1) | "Maybe later" (blocks Pay) |
| `SIGNATURE_INVALID` | Nanopay submit | "Something went wrong signing this payment. Let's try again." | "Retry" (rebuild typed-data + sign) | Back |
| `NONCE_REUSED` | Nanopay submit | same as `SIGNATURE_INVALID` (user-facing identical) | server re-issues intent with fresh nonce; client retries | Back |
| `AUTHORIZATION_EXPIRED` | Nanopay submit | same as `QUOTE_EXPIRED` | auto-re-quote | Back |
| `CIRCLE_UPSTREAM_ERROR` | Nanopay submit (5xx from Circle) | "Payment provider is having a hiccup. Try again in a moment." | "Retry" (exp backoff, max 3) | "Contact support" |
| `PAYMASTER_UNAVAILABLE` | Gateway deposit | "Gasless deposit unavailable right now. You'll pay a small network fee instead." | "Continue with network fee" (switches to plain `sendTransaction`) | "Try again later" |
| `DEPOSIT_PENDING_ATTESTATION` | post-deposit polling | skeleton spinner: "Finalizing your setup…" | — (auto-polling) | Close (keeps polling in background) |
| `DEPOSIT_FAILED` | `DepositReceiptResponse.status === "FAILED"` | "Your USDC deposit didn't go through. Your funds are safe — try again." | "Retry deposit" | "Contact support" |
| `CHAIN_RPC_UNREACHABLE` | any viem `publicClient` call timing out | "Can't reach the network right now. Check your connection." | "Retry" | Back |
| `WALLET_NAMESPACE_MISMATCH` | scanner auto-switched to EVM but user has no EVM wallet in account | "You need a TakumiAI EVM wallet to pay this merchant." | "Create EVM wallet" (routes to existing wallet creation flow) | Back |
| `XENDIT_PAYOUT_DECLINED` | Xendit webhook → intent.status = FAILED | "Merchant couldn't receive the payment (bad account, full wallet, or held by provider). Your USDC is safe." | "Contact merchant" (opens WhatsApp to their contact phone) | "Refund request" (§12 Q5) |
| `XENDIT_PAYOUT_LIMIT_EXCEEDED` | Xendit declines because of channel cap (e.g. OVO max balance) | "Merchant's [GoPay/OVO/…] balance is full. Ask them to transfer out or try later." | "Notify merchant" (WhatsApp) | "Refund request" |
| `INTENT_EXPIRED` | user left the confirmation screen for >5 min | (silent) auto-re-quote on screen focus | — | — |
| `SCAN_PERMISSION_DENIED` | `expo-camera` permission refused | "TakumiPay needs camera access to scan payment QRs." | "Open Settings" (deep-link to app permissions) | Back |
| `NETWORK_OFFLINE` | device offline detector | "You're offline. Scanning works — paying needs a connection." | "Retry" (re-checks connectivity) | Cancel |

Every copy string lives in `constants/paymentErrors.ts` keyed by code so i18n & A/B tests are one-file changes. Component location: `components/payment/PaymentError.tsx`. Telemetry: every displayed error emits a `payment_error_shown` event with `{ code, intentId?, merchantId? }`.

## 10. Environment Variables (mobile-app)

Add to `.env.example`:

```dotenv
# ── UMKM payout ─────────────────────────────────────────────────────
# Arc RPC — testnet URL is public; mainnet TBD. We override the RPC
# in `chainStore` when the active chain is Arc.
EXPO_PUBLIC_ARC_RPC_URL=https://rpc.testnet.arc.network
EXPO_PUBLIC_ARC_CHAIN_ID=5042002                                    # Arc Testnet; mainnet TBD
EXPO_PUBLIC_USDC_ARC_ADDRESS=0x3600000000000000000000000000000000000000

# Source chain for v1 Nanopayments development — USDC faucet available
# at faucet.circle.com. See §5.5 for the "source = destination = Base
# Sepolia until Arc Gateway lights up" rationale.
EXPO_PUBLIC_NANOPAY_SOURCE_CHAIN_ID=84532                            # Base Sepolia
EXPO_PUBLIC_USDC_BASE_SEPOLIA_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e

# Circle Gateway — public URLs and contract addresses; no secret needed
# on-device. (Attestation requests go through `takumipay-api`.) Gateway
# is the substrate Nanopayments is built on — the mobile app only reads
# these addresses to show the user which contract they're depositing
# into during onboarding.
EXPO_PUBLIC_CIRCLE_GATEWAY_WALLET=0x0077777d7EBA4688BDeF3E311b846F25870A19B9
EXPO_PUBLIC_CIRCLE_GATEWAY_MINTER=0x0022222ABE238Cc2C7Bb1f21003F0a260052475B

# Circle Nanopayments — the default gasless rail for this product. The
# mobile app posts signed EIP-3009 authorizations here (optionally
# proxied through takumipay-api). No API key required on-device —
# Nanopayments is permissionless. During testnet early access, the
# URL is provisional.
EXPO_PUBLIC_CIRCLE_NANOPAY_API=https://api.circle.com/v1/gateway
EXPO_PUBLIC_CIRCLE_NANOPAY_SUBMIT_VIA_SERVER=true   # if true, client POSTs to takumipay-api proxy; if false, client hits Circle directly

# Circle Paymaster — permissionless, no API key required. Only used for
# the one-time Gateway deposit (and future non-USDC-transfer calls).
# Arbitrum & Base today; Arc tracked in §12 Q1.
EXPO_PUBLIC_CIRCLE_PAYMASTER_V07=   # fill from developers.circle.com/paymaster
EXPO_PUBLIC_ERC4337_BUNDLER_BASE=
EXPO_PUBLIC_ERC4337_BUNDLER_ARBITRUM=
EXPO_PUBLIC_ERC4337_BUNDLER_ARC=    # fill once Arc paymaster support lands

# x402 — the facilitator URL we recommend by default. Mobile only reads
# this for display; the actual facilitator is chosen by the merchant's
# 402 response. EIP-3009 signing works against this facilitator with no
# additional config (gas-abstraction is implicit in the scheme).
EXPO_PUBLIC_X402_DEFAULT_FACILITATOR=https://api.cdp.coinbase.com/x402

# Public key used to verify `takumipay:v1:<JWS>` QR signatures. Rotate
# via EAS OTA update when the backend key rotates.
EXPO_PUBLIC_TAKUMIPAY_QR_PUBKEY_JWK=
```

**Secrets in `takumipay-api` only** (do NOT add to mobile):

```dotenv
# takumipay-api/.env (server)
XENDIT_SECRET_KEY=xnd_production_…            # HTTP Basic, empty password
XENDIT_WEBHOOK_TOKEN=…                         # x-callback-token verifier
CIRCLE_API_KEY=SAND_API_KEY:…                  # attestation + Mint
ARC_SETTLER_PRIVATE_KEY=0x…                    # relayer that calls GatewayMinter / submits attestations
TAKUMIPAY_QR_PRIVATE_KEY_PEM=…                 # signs merchant QRs
```

### 10.1 Testnet → Mainnet Migration Checklist

Every var here is flipped in **one config change**. Nothing in `services/` or `app/` code has to change — chain IDs and contract addresses are read from env at boot time. Run the checklist during the cut-over window:

```dotenv
# Mobile app — swap these when graduating from testnet to mainnet
EXPO_PUBLIC_ARC_RPC_URL=https://rpc.arc.network                       # was: rpc.testnet.arc.network
EXPO_PUBLIC_ARC_CHAIN_ID=<MAINNET_ID>                                 # was: 5042002    — fill from docs.arc.network once published (§12 Q1)
EXPO_PUBLIC_USDC_ARC_ADDRESS=<MAINNET_USDC>                           # was: 0x3600…00   — confirm with Circle / Arc

EXPO_PUBLIC_NANOPAY_SOURCE_CHAIN_ID=8453                              # was: 84532       — Base mainnet
EXPO_PUBLIC_USDC_BASE_SEPOLIA_ADDRESS= → EXPO_PUBLIC_USDC_BASE_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913

EXPO_PUBLIC_CIRCLE_GATEWAY_WALLET=<MAINNET_WALLET>                    # confirm with Circle
EXPO_PUBLIC_CIRCLE_GATEWAY_MINTER=<MAINNET_MINTER>                    # confirm with Circle

EXPO_PUBLIC_CIRCLE_PAYMASTER_V07=<MAINNET_PAYMASTER>                  # from developers.circle.com/paymaster

EXPO_PUBLIC_ERC4337_BUNDLER_BASE=<MAINNET_BUNDLER>                    # Pimlico/Alchemy mainnet endpoint
EXPO_PUBLIC_ERC4337_BUNDLER_ARBITRUM=<MAINNET_BUNDLER>
EXPO_PUBLIC_ERC4337_BUNDLER_ARC=<MAINNET_BUNDLER>                     # once Arc paymaster support lands

EXPO_PUBLIC_X402_DEFAULT_FACILITATOR=https://api.cdp.coinbase.com/x402  # same URL, but it now settles on mainnet by default
EXPO_PUBLIC_TAKUMIPAY_QR_PUBKEY_JWK=<ROTATED_KEY>                      # rotate to a separate prod-only signing key
```

```dotenv
# takumipay-api — swap these
XENDIT_SECRET_KEY=xnd_production_…                                     # was: xnd_development_…
XENDIT_ENV=production                                                   # was: sandbox
CIRCLE_API_KEY=LIVE_API_KEY:…                                           # was: SAND_API_KEY:…
ARC_SETTLER_PRIVATE_KEY=<prod relayer — NEW KEY, funded with mainnet USDC>
TAKUMIPAY_QR_PRIVATE_KEY_PEM=<prod signing key — NEW KEY>
```

Migration runbook (server-side):

1. Generate fresh prod signing key-pair for JWS merchant QRs. Bundle the new public JWK with an EAS OTA update — roll out 48h before go-live so pre-update clients upgrade.
2. Deploy `MerchantTreasury.sol` on Arc mainnet (when available) or the fallback settlement chain; pin address.
3. Fund prod relayer wallet with mainnet USDC on each Gateway source chain we support.
4. Flip `XENDIT_ENV=production` last — triggers real IDR disbursements on the next webhook.
5. Re-issue every onboarded merchant's TakumiPay JWS QR (server-side script, no merchant action needed — the JWS is chain-agnostic per §4.4 so merchants don't reprint). Old testnet-signed JWSes get rejected by the new pubkey; the script runs in the same window as the EAS OTA.
6. Watch the first production intent end-to-end before taking the feature out of staff-only rollout.

The chain-agnostic JWS design (§4.4) pays off here: **merchants do not need to reprint their TakumiPay stickers for the mainnet cut-over**; only the signing key rotates server-side, and the client verifies against the OTA'd pubkey.

## 11. Mobile-App Implementation Milestones

Each milestone is shippable on its own. **Do not** ship partial work at milestone boundaries.

- **M1 — Normalization layer.** `services/paymentIntent/*` + tests. Wire `app/scan-to-pay.tsx` to call `classify()`. `/pay-merchant` is a stub screen that renders the decoded intent JSON. No networking, no chain writes. **Shippable:** user can scan QRIS/TakumiPay QR and see parsed fields.
- **M2 — Nanopayments core (gasless primary rail).** Extend `WalletKitAdapter` with `signTransferWithAuthorization` (EIP-3009 typed-data signer). Add Arc `ChainConfig`. Implement Path B end-to-end against Circle Nanopayments testnet: sign → POST → display instant attestation. Backend stubs `POST /v1/pay/intents` emitting `path: "nanopay"` and proxies submission. **Shippable with a flag-gated demo of scan-to-pay where the user signs once and the merchant sees "PAID" in <500 ms.** No Xendit hookup yet — settlement is logged, not disbursed.
- **M3 — Xendit payout.** Backend integration: real quotes, real `POST /v2/payouts` calls, webhook handler, receipts. Mobile shows live status via TanStack Query invalidation. Now a Nanopayments attestation actually disburses IDR to the merchant.
- **M4 — Gateway onboarding + Paymaster-wrapped deposit.** The one-time USDC deposit into `GatewayWallet`. On Base/Arbitrum source chains, route the deposit through Circle Paymaster so the user's first-ever interaction is also gasless. Implements `sendUserOpWithUsdcPaymaster`. Everywhere else the user pays source-chain gas for this single step.
- **M5 — Raw x402 (Path C) + direct-on-Arc (Path A) fallbacks.** Re-use the EIP-3009 signer from M2 against arbitrary x402 resources (unlocks online merchants + agent payments). Implement direct-on-Arc settlement for large transfers where Nanopayments batch latency is undesirable.

Re-order is acceptable. Rule of thumb: every milestone must preserve the three-role separation and leave the Home Scan button functional.

### 11.1 Dependencies (npm packages to add)

All compatible with Expo 54 + Hermes. Pin exact versions in `package.json`; upgrade via Dependabot cadence.

| Package | Purpose | Introduced in | Notes |
| --- | --- | --- | --- |
| `jose` | EIP-712 / JWS sign + verify for the TakumiPay merchant QR detector (§4.6) | M1 | Pick the `jose` browser build; ensure `react-native-quick-crypto` or `react-native-get-random-values` polyfill is imported before first use. |
| `@emvco-qrcps/parser` *(or equivalent — see note)* | EMVCo TLV decoder + CRC-16 validation for QRIS / PromptPay / DuitNow / VietQR / QR Ph (§4.3) | M1 | No single dominant library. Short-list: `emv-qr-cps` (npm, minimal), or write ~120 LoC ourselves from the EMVCo spec. Engineer chooses — both are fine. Tests are the real contract. |
| `viem` | Already a dep. EIP-3009 typed-data signing rides its `signTypedData`; ERC-20 `transfer` for direct-on-Arc settlement (§5.1, §5.5) | — (existing) | Current version already covers everything we need. |
| `permissionless` | ERC-4337 UserOperation builder for Gateway deposit wrapped via Circle Paymaster (§5.4 table row, §5.5 `sendUserOpWithUsdcPaymaster`) | M4 | Ships with bundler clients for Pimlico/Alchemy/Stackup. Pick Pimlico unless infra already uses Alchemy. |
| `@circle-fin/gateway-sdk` *(or direct REST)* | Gateway deposit intent + attestation calls on the server. Mobile doesn't use this directly. | M4 (backend-only) | If the SDK is still pre-1.0, roll REST calls against the documented endpoints — avoid API churn. |
| `expo-camera` | Already a dep. Powers `app/scan-to-pay.tsx` + the "Scan my QRIS" merchant onboarding step (§1.1.1). | — (existing) | No version bump needed. |
| `expo-image-picker` / `expo-image-manipulator` | Capture the QRIS sticker photo during merchant onboarding (§1.1.1, §12 Q9) + compress before upload. | M3 | Compress to ≤200 KB JPEG before POST; server stores the key on the `MerchantSignupRequest.qrisLink.stickerPhotoKey` field. |
| `react-native-qrcode-svg` | Render the merchant's JWS QR on `app/merchant/qr.tsx` + export to PNG for `Save to Photos`. | M1 (onboarding shell) | High-density 400×400 at 10 % error correction is fine for a sticker print at business-card size. |
| `viem/utils` `keccak256` + `hexlify` | Already in viem. Used by `buildAuthorization.ts` for the EIP-712 domain hash. | M2 | No new dep. |
| `zod` | Already a dep. Parse every backend response + JWS payload at the boundary. | — (existing) | Every type in §6 should have a matching zod schema collocated. |

**Nothing else ships in v1 from the `nanopay` side.** Deliberately *not* in the dep list: Circle's `@circle-fin/bridge-kit` (redundant with Nanopayments for our use case), a dedicated x402 client library (the x402 path in M5 reuses `viem.signTypedData` + plain `fetch` — no library needed), and any generic "QRIS acquirer" SDK (we're not an acquirer, we only decode).

## 12. Open Questions

- **Q1 — Arc mainnet ID & Gateway availability.** The reference page currently only documents testnet addresses; Circle's "coming soon" list names Arc for Gateway. If Gateway isn't live on Arc at launch, Path B becomes `Gateway → Base → CCTP v2 → Arc`. Confirm before M4 kicks off.
- **Q2 — Merchant onboarding UX.** ✅ Locked: in-app, §1.1.1. Two buttons on `login.tsx` + single-screen form + QR home screen. No separate web portal in v1.
- **Q3 — National-QR coverage.** ✅ Locked for v1: **Indonesia QRIS only.** PromptPay (TH), DuitNow (MY), VietQR (VN), QR Ph (PH) each become their own detector + `MerchantChannelsResponse` entry when we expand. Not blocking M1–M5.
- **Q4 — KYC / transaction limits.** Xendit has per-channel holding limits (e.g. max balance in OVO/GoPay). Backend must reject quotes that would exceed the channel cap. Not a mobile concern but will surface as a 400 on `/intents`.
- **Q5 — Refund path.** If Arc-side settlement succeeds but Xendit payout fails after retries, funds are stuck in the merchant treasury. Define the manual refund runbook before production.
- **Q6 — Paymaster on EOAs.** Circle Paymaster requires ERC-4337 smart accounts; EOA support lands once EIP-7702 is live on each target chain. For v1 we either (a) upgrade each existing EOA wallet via the `authorization_list` flow gated by `EIP7702_ALLOWLIST`, or (b) gate Path A′ to users who create a smart account at onboarding. Decide before M2 ships.
- **Q7 — Solana gasless.** ✅ Locked: **Solana is out of v1 Nanopayments scope** (§5.5). EIP-3009 is EVM-only; the Solana fee-payer workaround is deferred. If the payer's active wallet is Solana when they tap Scan, the merchant-pay screen auto-switches to their EVM wallet (same auth principal) — same pattern as §4.6.
- **Q9 — QRIS PAN claim verification.** At onboarding the merchant asserts "this QRIS Merchant PAN is mine." v1 mitigations: unique-constraint the `qrisPan` column (first claim wins → duplicate claim returns `PAN_ALREADY_CLAIMED`), require a photo upload of the physical sticker as lightweight evidence archived for manual dispute review, and trust-on-first-use otherwise. Real merchants notice immediately when TakumiPay payouts stop reaching them; dispute reverses the claim. Stronger verification (e.g. SMS to a phone number bound to the QRIS at the acquirer level) requires acquirer API access — post-v1.
- **Q8 — Closed vs open merchant network.** V1 assumes the scanned QRIS / PromptPay / DuitNow / VietQR / QR Ph merchant has **already onboarded with us** (their merchant ID is in `takumipay-api`'s registry alongside a Xendit `channel_code` + `account_number`). Paying a merchant the backend has never seen requires either (a) proxying through a QRIS acquirer license so we can route over the national QR rails natively, or (b) Xendit exposing a "pay any QRIS acquirer ID" disbursement channel. Decide before marketing says "pay any UMKM." If we ship closed-network v1, the unknown-merchant error on `POST /v1/pay/intents` must be explicit in the mobile UI: *"This merchant isn't on TakumiPay yet — invite them."*

## 13. Credential Setup Guide (for the user to do later)

1. **Xendit** *(blocker for M3 — start first, KYB takes days)*
   - Create a **business account** at [`dashboard.xendit.co`](https://dashboard.xendit.co). Pick Indonesia as the primary country. Upload KYB docs (company registration / SIUP / NIB — TakumiPay's entity docs, **not** individual merchants'). Approval: usually 2–5 business days.
   - In the dashboard, activate the payout rails we need: *Settings → Activation → "Payouts to E-Wallets"* (enables GOPAY / OVO / DANA / LINKAJA / SHOPEEPAY_ID) and *"Payouts to Bank Accounts"* (enables BCA, Mandiri, BNI, BRI, etc.). Each rail may require a brief per-channel activation form — fill them in the order listed.
   - *Settings → Developers → API Keys* → generate a **Test Secret Key** first (format: `xnd_development_…`) for M3 dev. Generate the **Production Secret Key** (`xnd_production_…`) only once the integration passes staging. Auth is HTTP Basic: `Authorization: Basic base64(SECRET_KEY + ":")` (empty password).
   - *Settings → Developers → Callbacks* → register webhook URL `https://<your-takumipay-api-host>/webhooks/xendit`. Xendit generates a `x-callback-token` — copy it now; you can't see it again.
   - Stash in `takumipay-api/.env`:
     ```
     XENDIT_SECRET_KEY=xnd_development_…       # or xnd_production_… in prod
     XENDIT_WEBHOOK_TOKEN=…
     XENDIT_ENV=sandbox                         # "sandbox" | "production"
     ```
   - Sandbox testing: Xendit's test mode simulates payouts instantly, no real IDR moves. Flip `XENDIT_ENV` once you're confident. Per-channel fees are only billed in production.
2. **Circle Gateway + Nanopayments** *(blocker for M2 — apply in parallel with Xendit)*
   - Apply for early access at [`circle.com/gateway`](https://www.circle.com/gateway) (access window runs through 2026-06-30; enrolment covers both Gateway and Nanopayments — same approval).
   - Once approved, [`app.circle.com`](https://app.circle.com) → *Developer Console → API Keys* → generate a key. Save as `CIRCLE_API_KEY` in `takumipay-api/.env`. **Do not** put this in mobile `.env` — Nanopayments is client-permissionless, the key is backend-only.
   - Fund a server-side relayer wallet with testnet USDC via [`faucet.circle.com`](https://faucet.circle.com) on Base Sepolia (v1 source chain) and Arc Testnet (v1 destination). Save the relayer private key as `ARC_SETTLER_PRIVATE_KEY`.
   - In the Circle Dashboard, wire the Nanopayments merchant-attestation webhook to `https://<your-takumipay-api-host>/webhooks/circle-nanopay`. The instant attestation Circle emits after each authorization is what unblocks the Xendit payout in §6.4.
   - No mobile-app Circle keys anywhere. The mobile app carries Gateway *contract addresses* (public) and the chain IDs, that's it.
3. **Arc Network**
   - No account needed. For testnet, fund a wallet at Arc's Circle Faucet (link in `docs.arc.network`). For mainnet, Arc + USDC go live per Arc's release schedule.
   - Deploy `MerchantTreasury.sol` from `takumipay-api/contracts/` via `forge create --rpc-url $ARC_RPC --private-key $ARC_SETTLER_PRIVATE_KEY`.
4. **Circle Paymaster**
   - **No account required.** Pull the canonical paymaster contract address per chain from `developers.circle.com/paymaster` and paste into `EXPO_PUBLIC_CIRCLE_PAYMASTER_V07`. Arbitrum and Base are the two supported mainnets at the time of writing; Arc support tracked in §12 Q1.
   - Provision an ERC-4337 bundler per chain — Pimlico and Alchemy both offer permissioned endpoints; obtain API keys and paste them into the `EXPO_PUBLIC_ERC4337_BUNDLER_*` vars.
   - No custom paymaster contract to deploy. Usage is metered at 10% of the underlying gas cost (passed through to the user, surfaced in the intent quote's `fees.gasSurchargeBps` field).
5. **x402**
   - For the Coinbase CDP facilitator (Base/Polygon/Arbitrum/World/Solana): sign up at `cdp.coinbase.com`, create a project, enable x402, generate an API key. First 1,000 tx/month are free.
   - For our Arc facilitator: deploy the `x402-facilitator` reference server alongside `takumipay-api`, pointed at Arc RPC and a relayer wallet.
6. **TakumiPay QR signing key**
   - Generate once: `openssl ecparam -name prime256v1 -genkey -noout -out qr-key.pem`.
   - Extract public JWK with `jose` or `node-jose` and paste into `EXPO_PUBLIC_TAKUMIPAY_QR_PUBKEY_JWK`. Keep the private PEM in `takumipay-api/.env` as `TAKUMIPAY_QR_PRIVATE_KEY_PEM`. Rotate yearly.

## 14. References

- Xendit Payouts — `docs.xendit.co/docs/integration-payouts`, channel codes at `docs.xendit.co/id/xendisburse/channel-codes`, API reference at `xendit.github.io/apireference`
- Arc Network — `docs.arc.network/arc/tutorials/deploy-on-arc`, contracts at `docs.arc.network/arc/references/contract-addresses`, bridge SDK at `docs.arc.network/app-kit/bridge`
- Circle Gateway — `developers.circle.com/gateway`, product page `circle.com/gateway`, technical guide at `developers.circle.com/gateway/concepts/technical-guide`, "Reinventing Crosschain UX" blog post
- **Circle Nanopayments** *(primary gasless rail)* — `developers.circle.com/gateway/nanopayments`, product page `circle.com/nanopayments`, launch post "Powering the Agentic Economy with Circle Nanopayments" (`circle.com/blog/circle-nanopayments-launches-on-testnet-as-the-core-primitive-for-agentic-economic-activity`)
- Circle Paymaster *(only for the one-time Gateway deposit + future non-transfer calls)* — `developers.circle.com/paymaster`, product page `circle.com/paymaster`, launch post "Introducing Circle Paymaster: Pay gas fees in USDC" (`circle.com/blog/introducing-circle-paymaster`), Arbitrum quickstart at `docs.arbitrum.io/for-devs/third-party-docs/Circle/usdc-paymaster-quickstart`
- EIP-3009 `transferWithAuthorization` (gasless primitive USDC v2 implements natively) — `eips.ethereum.org/EIPS/eip-3009`
- ERC-4337 account abstraction (paymaster contract shape) — `eips.ethereum.org/EIPS/eip-4337`
- x402 — `x402.org`, spec at `github.com/coinbase/x402`, EVM exact scheme at `github.com/coinbase/x402/blob/main/specs/schemes/exact/scheme_exact_evm.md`, CDP facilitator at `docs.cdp.coinbase.com/x402/welcome`, network support at `docs.cdp.coinbase.com/x402/network-support`
- Repo anchors — `app/index.tsx:86`, `components/home/Main/ScanToPayChatModeFloatingButtons.tsx:36`, `app/scan-to-pay.tsx:29-62`, `app/send.tsx:398-435`, `app/withdraw.tsx:28-33`, `services/walletKit/types.ts:66`, `constants/configs/chainConfig.ts:68`
