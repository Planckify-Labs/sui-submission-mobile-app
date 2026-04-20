# UMKM USDC → SEA Fiat Payout — Engineering Spec

**Status:** Draft v1 — ready for engineering kickoff
**Owner:** `mobile-app`, coordinates with `takumipay-api(/api dir)`
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

**Who plays which role on the Circle Nanopayments side (§5.2):**

- **Circle-side "buyer" = payer.** Holds USDC in a Gateway balance, signs an x402 payment authorization. The signing primitive depends on the payer's namespace: EIP-3009 typed-data on EVM, partially-signed Solana transaction on SVM (§5.2.1). Both schemes are first-class — the product is chain-agnostic by design.
- **Circle-side "seller" = `takumipay-api` itself.** The on-chain recipient (`payTo`) is a single platform-owned address per namespace (one EVM EOA at `PLATFORM_TREASURY_ADDRESS_EVM`, one Solana keypair at `PLATFORM_TREASURY_ADDRESS_SVM`). Not per-merchant. Merchants never hold USDC, never have a Gateway balance, never have a wallet on any chain, and never appear in the Circle ledger.
- **Merchant** is a downstream Xendit payout destination, not a Circle seller. The platform consumes USDC → fires Xendit → merchant receives IDR in their existing GoPay/OVO/bank account.

**Copy audience rule.** Strings rendered on payer-only surfaces may reference USDC, chains, gas, and signatures — payers are crypto-native and chose the product because they hold USDC. Strings rendered on merchant surfaces (or strings a merchant may read — invite messages, shared receipts, WhatsApp notifications) reference only TakumiPay and IDR. When in doubt, ask who's reading this: if the answer is "merchant or both," USDC disappears.

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
   | Payout channel | `merchant.xendit.channelCode` — v1 Indonesia enum: e-wallets `GOPAY` / `OVO` / `DANA` / `LINKAJA` / `SHOPEEPAY` / `ASTRAPAY` / `JENIUSPAY`, banks `BCA` / `MANDIRI` / `BNI` / `BRI` / `CIMB` / `PERMATA` / `DANAMON` / `BSI`, plus "Don't see your bank?" expander. **Fetched from `takumipay-api GET /v1/merchants/channels?country=ID`** — not hardcoded in the app. | ❌ not in QRIS — merchant picks | no |
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
                   │  Direct-on-Arc  Nanopay-sign   x402-pay    │
                   │   (Path A)       (Path B,      (Path C)    │
                   │                   default)                  │
                   │        │            │             │        │
                   └────────┼────────────┼─────────────┼────────┘
                            │            │             │
                  ╔═════════▼════════════▼═════════════▼══════╗
                  ║            Arc Network (USDC = gas)       ║
                  ║  PLATFORM_TREASURY_ADDRESS (platform EOA) ║
                  ║  — single seller address for all payers   ║
                  ║  — credited via Circle settle response    ║
                  ║    (Path B); backend watches USDC         ║
                  ║    `Transfer` events only for Path A      ║
                  ║    direct-on-Arc fallback                 ║
                  ╚═════════════════════╤═════════════════════╝
                                        │ (settle 200 OK for B, event for A)
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
- **Server (takumipay-api)** — decides amounts (FX, fees), mints payment intents, proxies signed authorizations to Circle's `/gateway/v1/x402/settle`, fires Xendit on the synchronous settle 200 OK. Watches Arc on-chain only for the Path A fallback. **Never** signs USDC transfers (the platform's `ARC_SETTLER_PRIVATE_KEY` only signs treasury withdrawals — never payer transfers).
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
- **Treasury can rotate.** If `PLATFORM_TREASURY_ADDRESS` moves, or we migrate from Arc testnet → Arc mainnet, or we swap to a different settlement rail, the JWS stays valid.
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

### 5.1 Path A — Direct on Arc (fallback when user already holds USDC on Arc and wants same-chain immediate settlement)

- `WalletKit.sendTokenTransfer({ token: USDC_ARC, to: PLATFORM_TREASURY_ADDRESS, amount })` — USDC on Arc is both the asset and the gas token, so this is a single ERC-20 `transfer` call. The recipient is the **single platform treasury** (same EOA used as Circle's `payTo` for Path B), not a per-merchant contract. Merchant accounting lives in `takumipay-api`'s DB, not on-chain. (USDC native precision on Arc is 18 decimals; the ERC-20 interface at `0x3600…0000` exposes 6 decimals — `EvmWalletKit` picks the interface view so existing 6-decimals math keeps working.)
- Backend matches incoming `Transfer(to=PLATFORM_TREASURY_ADDRESS, value, …)` events to pending intents by the `(value, nonce)` pair set at intent creation (§6.2 `NanopayPayload.nonce`). Path A uses the `nonce` as the `data` payload in a companion event log — Path B does not need it since Circle's settle response is the trigger.

### 5.2 Path B — Circle Nanopayments *(the primary gasless rail)*

This is the path we default to for every scan-to-pay. It combines the three Circle primitives — Gateway (the deposit substrate), EIP-3009 (the signing format), and x402 (the wire protocol) — into a **single permissionless API** that delivers gas-free USDC transfers as small as $0.000001 with instant merchant confirmation. Circle batches many authorizations into one on-chain settlement, so per-payment gas amortizes to effectively zero.

Circle validates signatures and computes batch settlement inside an **AWS Nitro Enclave** (a trusted execution environment). Even Circle employees cannot access the keys — the non-custodial property is enforced by the enclave, not by policy. This matters for the v1 trust story: "TakumiPay is not a crypto custodian; user funds are held in a Circle-operated enclave that neither Circle nor we can drain unilaterally."

**On-chain seller address.** The `payTo` on every Nanopayments settle call is the single platform-owned EVM address (`PLATFORM_TREASURY_ADDRESS`, env var on `takumipay-api`). Merchants do not appear on-chain — they are downstream IDR payout destinations resolved by `takumipay-api` after the settle 200 OK.

**One-time setup per user** (`/onboarding/nanopay-deposit`):

1. User deposits USDC into a **Gateway Wallet** contract on any Gateway-supported source chain they already hold USDC on. Current Gateway testnet domain enum (from `/v1/info`): Ethereum (0), Avalanche (1), OP (2), Arbitrum (3), Solana (5), Base (6), Polygon PoS (7), Unichain (10), Sonic (13), World Chain (14), Sei (16), HyperEVM (19), **Arc (26)**. This is the **only** on-chain action the user ever pays gas for in the normal flow. If the user's source chain is Base/Arbitrum, we optionally wrap the deposit with Circle Paymaster so that gas on this step is USDC-denominated too (see §5.4).
2. From this point on, the user's USDC balance is **unified across domains** — Circle tracks it in their Gateway ledger, queryable via `POST /v1/balances`.

**Per-payment flow** (this is what fires every time the user taps Pay on `/pay-merchant`):

1. `POST /v1/pay/intents` — backend issues a quote (§6.1). Because the target is Nanopayments, the response includes a `nanopay` block with the EIP-3009 authorization fields the client must sign.
2. Mobile app calls `kit.signTransferWithAuthorization({ … })` — the wallet signs an **EIP-3009 `TransferWithAuthorization`** typed-data message. The EIP-712 domain is the `GatewayWallet` contract on the source chain (not USDC), pulled from `GET /gateway/v1/x402/supported`. This is an off-chain `signTypedData` call. No broadcast. No approval dialog from a node. No gas from the user. Gateway requires `validBefore ≥ now + 3 days` or it rejects with `authorization_validity_too_short`.
3. Mobile app POSTs the signed authorization to `takumipay-api`, which proxies it to Circle's **`POST /gateway/v1/x402/settle`** (base `https://gateway-api-testnet.circle.com` or `https://gateway-api.circle.com`). The request body is `{ paymentPayload, paymentRequirements }` — the payload wraps the EIP-3009 signature, the requirements echo the `scheme` / `network` (CAIP-2, e.g. `eip155:5042002`) / `asset` / `amount` / `payTo` / `maxTimeoutSeconds` / `extra.verifyingContract` values the mobile app already consumed. Circle validates the signature, locks the sender's Gateway balance, returns `{ success: true, transaction: <uuid>, network, payer }` in <500 ms — this is the attestation we show the user as "PAID." On failure Circle returns `{ success: false, errorReason }` with a well-defined enum (`insufficient_balance` / `nonce_already_used` / `authorization_expired` / `authorization_validity_too_short` / …); §9.1 maps each to a user-facing error. `/gateway/v1/x402/verify` is available as a read-only pre-flight check for the UX polish case but is not part of the correctness path — production uses `settle()` directly.
4. Backend receives the settle 200 OK → marks the intent `SETTLED` → immediately fires the Xendit payout (§6.3). The UMKM's IDR/PHP/THB/MYR/VND lands within seconds.
5. Later (seconds to minutes, batched), Circle settles the aggregated authorizations on-chain and credits the **platform's Gateway balance** on the destination domain. The platform withdraws on demand to its Arc hot wallet (or keeps the balance in the Gateway ledger as working capital) — user and merchant both saw completion long before this final settlement, and neither's experience is tied to the batch cadence.

**Why this is the right default for UMKM:**

- **Truly gasless for the user.** No ETH / MATIC / gas token top-up anywhere, ever. The single deposit step can itself be gasless if paired with Paymaster on Base/Arbitrum.
- **Sub-cent amounts work.** UMKM coffee is Rp 5 000 (~$0.30). Street-vendor items go down to Rp 1 000 (~$0.06). Traditional on-chain transfers would burn that in gas. Nanopayments explicitly targets $0.000001 minimums.
- **Instant merchant UX.** Circle's attestation lands in <500 ms, so the merchant sees "PAID" on their screen before the user's phone leaves the QR code.
- **x402-compatible.** The same signed EIP-3009 authorization is a valid `X-PAYMENT` header for any x402 merchant. Agent-driven payments (§8) reuse the exact primitive with zero extra code.
- **Permissionless.** No Circle Developer account needed on the critical path — matches the product's distribution posture (any user with USDC can pay any registered UMKM).

### 5.2.1 Path B-SVM — Solana x402 (M6 — slot ready, integration deferred)

The chain-agnostic counterpart to §5.2's EVM scheme. Same product surface from the payer's perspective — scan, confirm, PIN, "PAID" — but the signing primitive and the settlement mechanic are different.

**Wire format.** Per the x402 SVM spec (`scheme_exact_svm`), `paymentPayload.payload = { transaction: "<base64-encoded partially-signed versioned Solana transaction>" }`. The transaction contains:

1. ComputeBudget: `SetComputeUnitLimit` (instruction 0)
2. ComputeBudget: `SetComputeUnitPrice` (instruction 1)
3. SPL Token (or Token-2022) `TransferChecked` — the actual USDC transfer
4. *(optional)* SPL Memo program with `intent_id` for off-chain correlation
5. *(optional)* Lighthouse program assertions

**`PaymentRequirements` shape.** Mirrors the EVM block but populates Solana-flavored fields:

```json
{
  "scheme":            "exact",
  "network":           "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  "asset":             "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "amount":            "1000",
  "payTo":             "<PLATFORM_TREASURY_ADDRESS_SVM>",
  "maxTimeoutSeconds": 60,
  "extra": {
    "feePayer": "<facilitator's Solana pubkey>",
    "memo":     "pi_<intentId>"
  }
}
```

The TransferChecked destination resolves to the Associated Token Account PDA for `(owner = payTo, mint = asset)`. The facilitator signs as `feePayer` (paying SOL gas) and submits the fully-signed transaction to Solana mainnet. The user signs only their own transfer authorization — they never see SOL, never hold SOL, never pay SOL.

**Per-payment flow:**

1. `POST /v1/pay/intents` — backend builds the partially-signed transaction (or hands the mobile app the instruction blueprint) and returns it as `PaymentIntent.nanopay` with discriminator `kind: "svm_partial_tx"`.
2. Mobile app calls `kit.signX402SvmPayment({ transaction })` — the Solana wallet adds its signature over the message bytes. Returns the updated base64 transaction.
3. Mobile app POSTs the signed payload to `takumipay-api`, which proxies to **either**: (a) Circle's `POST /gateway/v1/x402/settle` if `/gateway/v1/x402/supported` lists `solana:*` as a supported network, or (b) a Solana-compatible x402 facilitator's settle endpoint otherwise. Backend boot-time discovery decides which.
4. Facilitator validates the partial signature, adds `feePayer` signature, submits to Solana, returns `{ success, transaction (signature), network, payer }` once confirmed.
5. Backend marks intent `SETTLED` → fires Xendit (§6.4). Same downstream pipeline as Path B-EVM.

**Economic profile vs. Path B-EVM:**

| | Path B-EVM (Nanopayments) | Path B-SVM (Solana x402) |
| --- | --- | --- |
| Per-payment gas | ~0 (batched at Gateway layer) | ~$0.0001 (Solana per-tx, paid by facilitator) |
| Sub-cent floor | ✅ down to $0.000001 | ✅ effective floor ~$0.001 (still well below UMKM minimums) |
| Settlement latency | Synchronous (<500 ms attestation) | ~1–2 s (Solana confirmation + facilitator submit) |
| Merchant UX | "PAID" instant | "PAID" within 2 s |

For UMKM payment sizes (Rp 1 000 = $0.06 minimum), both schemes work cleanly. Sub-cent agentic flows in §8 stay EVM-only since Solana's per-tx floor exceeds the minimum.

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
   * Signs EIP-3009 `TransferWithAuthorization` typed-data bound to the
   * Gateway batched-wallet contract (the EIP-712 domain's
   * `verifyingContract`, NOT the USDC contract — see §5.5 for the full
   * rationale). Used by Circle Nanopayments (the default rail) and by
   * stand-alone x402 merchant payments. Returns the raw 65-byte signature.
   */
  signTransferWithAuthorization?(args: {
    wallet: TWallet;
    chain: ChainConfig;
    gatewayWallet: string;            // EIP-712 `verifyingContract` (Gateway contract, not USDC)
    domainName: string;               // from /gateway/v1/x402/supported
    domainVersion: string;
    usdc: string;
    from: string; to: string;
    valueMicros: bigint;
    validAfter: number; validBefore: number;  // validBefore ≥ now + 3 days
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

- **Chain-agnostic by architecture; phased rollout by milestone.** The product targets all 13 Gateway-supported domains long-term (Ethereum, Avalanche, OP, Arbitrum, **Solana**, Base, Polygon PoS, Unichain, Sonic, World Chain, Sei, HyperEVM, Arc) so any user holding USDC on any supported chain can pay any onboarded merchant. There are two distinct x402 schemes that get the user there:
  - **EVM scheme (`exact` on `eip155:*` networks)** — EIP-3009 typed-data signed against `GatewayWallet`. Settles via Circle Nanopayments (batched, sub-cent capable). **Ships in M2.**
  - **SVM scheme (`exact` on `solana:*` networks)** — base64 partially-signed Solana versioned transaction with TransferChecked + ComputeBudget instructions; facilitator signs as `feePayer` and submits per-tx. Whether Circle's Nanopayments x402 settle endpoint accepts the SVM scheme TBD — backend resolves via `GET /gateway/v1/x402/supported` at boot; if Circle doesn't support it natively yet, fall back to a Solana-compatible facilitator (Coinbase CDP, rapid402, or self-hosted). Per-tx Solana fees (~$0.0001 in SOL) are paid by the facilitator, not the user — still gasless from the payer's perspective. **Ships in M6** (§11). The wallet-kit method `signX402SvmPayment` (§5.5 below) is defined now so the integration is one adapter implementation when M6 lands, not a refactor.
- **Source and destination chain for v1 testnet = Arc Testnet (chainId `5042002`, Circle domain `26`).** Arc is first-class in Gateway as of testnet Feb 2026 — `chain: "arcTestnet"` is the example chain in Circle's own buyer quickstart. Users who happen to hold USDC on Base Sepolia / Arbitrum Sepolia / Solana / etc. deposit from there into Gateway; the unified balance is payable from any source domain regardless. No separate "settlement chain" bookkeeping is required on mobile — the destination domain rides on `PaymentIntent.nanopay` from the backend.
- **Merchant-pay screen is namespace-aware, not EVM-locked.** When the active wallet is Solana and M6 has not shipped, the screen detects the absent SVM adapter and offers (a) "Switch to your EVM wallet" CTA if the user has both, or (b) "Top up USDC on a supported chain" if they don't. Once M6 ships, both namespaces sign in place — no auto-switch.
- **Nanopayments submission is proxied through `takumipay-api`.** The mobile app never POSTs directly to `gateway-api-testnet.circle.com`. Reasons: (1) we want the settle response uniform with the rest of our backend events so Xendit payout can fire off the same handler; (2) audit trail — every payment has a server-side record tied to the intent id; (3) keystore hygiene — the mobile wallet's private key stays in `expo-secure-store`; we sign on-device, proxy the signed payload. Gateway settle itself is permissionless (no API key — the OpenAPI shows `security: []`), so the proxy is a discipline choice, not a credential constraint. Env flag `EXPO_PUBLIC_CIRCLE_NANOPAY_SUBMIT_VIA_SERVER` stays `true` — it exists only as a dev-time escape hatch.

**Wallet-kit surface (concrete additions)**

```ts
// services/walletKit/types.ts  (add to the existing WalletKitAdapter)

/**
 * EIP-3009 `TransferWithAuthorization` — the signing primitive Circle
 * Nanopayments accepts. EVM-only; Solana kit leaves this undefined.
 *
 * Crucial detail: the EIP-712 domain points at Circle's `GatewayWallet`
 * contract on the source chain — NOT the USDC contract. Circle exposes
 * `{ name, version, verifyingContract }` via `GET /gateway/v1/x402/supported`
 * per source network; backend fetches that at boot and pipes it into
 * `PaymentIntent.nanopay` so mobile doesn't hardcode anything. Signing
 * against the USDC contract (the standard EIP-3009 domain) will pass
 * `/gateway/v1/x402/verify` but fail settle — don't do it.
 *
 * The adapter does NOT broadcast — it only returns a 65-byte signature.
 * Submission to Nanopayments is the caller's job (goes through our
 * server proxy, see §6.5).
 */
signTransferWithAuthorization?(args: {
  wallet: TWallet;
  chain: ChainConfig;                       // source chain carrying the USDC balance
  gatewayWallet: `0x${string}`;             // EIP-712 `verifyingContract` — the Gateway batched-wallet contract
  domainName: string;                       // e.g. "GatewayWalletBatched" — from /gateway/v1/x402/supported
  domainVersion: string;                    // e.g. "1"
  usdc: `0x${string}`;                      // the USDC asset address (embedded in TransferWithAuthorization type fields)
  from: `0x${string}`;
  to: `0x${string}`;                        // = PLATFORM_TREASURY_ADDRESS_EVM; merchant resolution is off-chain
  valueMicros: bigint;                      // 6-decimal USDC units
  validAfter: number;                       // unix seconds; usually 0
  validBefore: number;                      // unix seconds; MUST be ≥ now + 3 days — shorter windows fail settle with `authorization_validity_too_short`
  nonce: `0x${string}`;                     // 32-byte random, generated by the server
}): Promise<`0x${string}`>;

/**
 * x402 SVM scheme — sign a partially-signed Solana versioned transaction
 * for the Path B-SVM rail (§5.2.1). Only `SolanaWalletKit` implements this;
 * EVM kits leave it `undefined`. The transaction comes pre-built by the
 * backend (instructions: ComputeBudget × 2, TransferChecked, optional Memo).
 * The wallet adds the user's signature over the transaction message bytes;
 * the facilitator later adds the `feePayer` signature and submits.
 *
 * Returns the updated base64 transaction with the user's signature attached.
 */
signX402SvmPayment?(args: {
  wallet: TWallet;
  cluster: "mainnet-beta" | "devnet";
  /** Base64-encoded versioned Solana transaction (partially signed by feePayer placeholder). */
  transaction: string;
}): Promise<string>;

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
if (user has NOT completed Gateway deposit)              → prompt onboarding (one-time)
else if (intent.channel.kind === "merchant") {
    if      (activeWallet.namespace === "eip155")         → Path B-EVM (Nanopayments, EIP-3009)
    else if (activeWallet.namespace === "solana"
             && kit.signX402SvmPayment != null)           → Path B-SVM (Solana x402)
    else                                                  → show "Switch to supported wallet" sheet
}
else if (intent.channel.kind === "x402")                  → Path C (raw x402, scheme matches namespace)
else if (user has USDC on Arc ≥ quote.usdc)               → Path A (direct on Arc)
else                                                      → show "Top up USDC" CTA
```

Path B is the default for every merchant, not conditional on per-merchant registration. Nanopayments is permissionless on the seller side (Circle's `payTo` is our single `PLATFORM_TREASURY_ADDRESS_<NS>`); any `merchant` intent resolves to Path B automatically. The `merchant` kind covers both (a) TakumiPay-issued JWS QRs and (b) indexed QRIS stickers whose PAN matched a registered merchant in `takumipay-api`'s DB. If the scan is an EMVCo QR whose PAN is **not** in our DB, `POST /v1/pay/intents` returns `MERCHANT_NOT_ONBOARDED` and the mobile app surfaces the invite copy from §9.1.

Namespace detection rides on `WalletKitAdapter` presence-of-method, not `if (ns === "X")` — per memory `feedback_chain_extension_discipline.md`. Adding a new chain's x402 scheme (e.g. HyperEVM's own variant, Sei's scheme) means implementing the corresponding adapter method; the path selector picks it up automatically.

All paths converge on the same `takumipay-api` intent id, so the Xendit payout branch is uniform.

## 6. Backend Contracts (`takumipay-api`)

All types below are the **canonical interfaces** the mobile app codes against. Implementation lives in a sibling PR to `takumipay-api`, but these shapes are binding. Authentication on every endpoint is `Authorization: Bearer <SIWE-session>` (the existing mobile-app auth, see `hooks/queries/useAuth.ts`), unless noted.

### 6.0 Shared types

```ts
// api/types/payouts.ts

/** Xendit channel code, narrowed to Indonesia v1. Update the enum when we ship other countries. */
export type ChannelCode =
  | "GOPAY" | "OVO" | "DANA" | "LINKAJA" | "SHOPEEPAY" | "ASTRAPAY" | "JENIUSPAY"
  | "BCA" | "MANDIRI" | "BNI" | "BRI" | "CIMB" | "PERMATA" | "DANAMON" | "BSI"
  | (string & { readonly __brand: "OtherIdBank" });    // full Xendit list via /v1/merchants/channels

// Verification note: the exact channel_code strings above are based on
// Xendit's public docs + acceptance-channels page. Xendit occasionally
// renames codes (e.g. MANDIRI_SYARIAH → BSI in 2021, SHOPEEPAY has
// suffixed variants in some regions). Backend engineer should sanity-
// check each code against Xendit Test Mode during M3 by submitting a
// dry-run POST /v2/payouts — the API returns a validation error for
// unknown channel_codes. Any corrections land in the Xendit config
// file (no mobile release needed — served via /v1/merchants/channels).

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

/** Discriminated union — namespace decides which scheme the wallet signs.
 *  Backend picks based on the payer's source chain at intent creation. */
export type NanopayPayload = EvmNanopayPayload | SvmNanopayPayload;

export interface EvmNanopayPayload {
  kind:          "evm_eip3009";
  usdc:          `0x${string}`;
  sourceChainId: number;
  /** EIP-712 domain bound to Circle's `GatewayWallet` batched-wallet contract on the source chain,
   *  pulled from `GET /gateway/v1/x402/supported` at backend boot time. The mobile adapter signs against
   *  these values — do NOT sign against the USDC contract's domain (that passes verify but fails settle). */
  domain: {
    name:              string;         // e.g. "GatewayWalletBatched"
    version:           string;         // e.g. "1"
    verifyingContract: `0x${string}`;  // Gateway contract address on `sourceChainId`
  };
  from:          `0x${string}`;
  to:            `0x${string}`;    // PLATFORM_TREASURY_ADDRESS_EVM — single platform-owned EOA; merchants resolved off-chain
  valueMicros:   number;
  validAfter:    number;
  /** Must be ≥ now + 3 days (259 200 s). Gateway rejects shorter windows with `authorization_validity_too_short`. */
  validBefore:   number;
  nonce:         `0x${string}`;    // 32-byte random, server-generated per intent
  /** Where the mobile app POSTs the signed authorization. Always points to our proxy. */
  submitTo:      string;
  /** Mirrors Circle's `PaymentRequirements` shape so the proxy can forward with zero transformation. */
  requirements: {
    scheme:            "exact";
    network:           string;      // CAIP-2, e.g. "eip155:5042002" for Arc Testnet
    asset:             `0x${string}`;
    amount:            string;      // atomic units (= valueMicros stringified)
    payTo:             `0x${string}`;
    maxTimeoutSeconds: number;
  };
}

export interface SvmNanopayPayload {
  kind:        "svm_partial_tx";
  cluster:     "mainnet-beta" | "devnet";
  /** USDC SPL mint address on the cluster (mainnet: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v) */
  usdcMint:    string;
  /** Pre-built base64-encoded versioned Solana transaction. Contains:
   *  ComputeBudget(SetComputeUnitLimit), ComputeBudget(SetComputeUnitPrice),
   *  TransferChecked(amount, mint, decimals), optional Memo for intent correlation.
   *  Mobile adapter signs over the message bytes and returns the updated base64. */
  transaction: string;
  from:        string;             // payer's Solana pubkey (base58)
  to:          string;             // PLATFORM_TREASURY_ADDRESS_SVM (base58)
  valueMicros: number;             // 6-decimal USDC units
  submitTo:    string;             // takumipay-api proxy URL
  requirements: {
    scheme:            "exact";
    network:           string;     // e.g. "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" (mainnet-beta)
    asset:             string;     // = usdcMint
    amount:            string;     // = valueMicros stringified
    payTo:             string;
    maxTimeoutSeconds: number;
    extra: {
      feePayer: string;            // facilitator's Solana pubkey
      memo?:    string;            // = `pi_${intentId}` for off-chain correlation
    };
  };
}

export interface X402Payload {
  resource: string;
  scheme:   "exact";
  /** CAIP-2 network identifier — matches the wire format Circle Gateway and the Coinbase CDP facilitator use.
   *  Examples: "eip155:5042002" (Arc Testnet), "eip155:84532" (Base Sepolia), "eip155:8453" (Base mainnet),
   *  "eip155:42161" (Arbitrum), "eip155:137" (Polygon), "solana:mainnet". */
  network:  string;
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

`EXPO_PUBLIC_CIRCLE_NANOPAY_SUBMIT_VIA_SERVER=true` is the v1 default. The mobile app POSTs signed authorizations to `takumipay-api /v1/pay/intents/:id/nanopay`; our backend is the one that talks to Circle's Gateway API.

**Circle Gateway API surface** — all under base `https://gateway-api-testnet.circle.com` (test) / `https://gateway-api.circle.com` (prod). The entire Gateway OpenAPI declares `security: []` — no API key is required on any of these endpoints. Keys are only needed for the Developer Console (attestation inspection, dashboards, webhooks):

| Endpoint | Used by | Purpose |
| --- | --- | --- |
| `POST /gateway/v1/x402/settle` | `takumipay-api` | **The core endpoint** for Path B. Accepts `{ paymentPayload, paymentRequirements }`. Returns `{ success, transaction, network, payer?, errorReason? }` in <500 ms. This is the "PAID" attestation. |
| `POST /gateway/v1/x402/verify` | `takumipay-api` (optional) | Read-only pre-flight check. Validates scheme / network / asset / signature / temporal / address+amount. Does **not** check balance or nonce. Use only for UX polish before showing the PIN sheet — production paths call `settle` directly. |
| `GET /gateway/v1/x402/supported` | `takumipay-api` (at boot) | Returns supported payment kinds per network, including the `GatewayWallet` `extra.verifyingContract` the mobile app must sign against, asset list, and authorized signer addresses. Cache at backend boot; pipe verifying contract into `PaymentIntent.nanopay.domain`. |
| `GET /gateway/v1/x402/transfers/{id}` | `takumipay-api` (reconciliation) | Fetches a settled transfer by the UUID returned from `/settle`. Status progresses `received → batched → confirmed → completed` (or `failed`). Use for reconciliation dashboards; not on the payout critical path (we fire Xendit off the settle 200 OK). |
| `POST /v1/balances` | `takumipay-api` (ops) | Query the platform's Gateway balance across domains. Used by the withdrawal/liquidity job that moves USDC from Gateway to the Arc hot wallet. |
| `POST /v1/deposits` | `takumipay-api` (onboarding) | Returns pending deposits for a depositor address — lets backend confirm the user's one-time `GatewayWallet.deposit(…)` tx was observed by Circle without re-watching the chain ourselves. |
| `POST /v1/transfer` + `/v1/estimate` + `/v1/info` | reference only | Cross-chain `BurnIntent` product (different typed-data shape — `{ maxBlockHeight, maxFee, spec: { sourceDomain, destinationDomain, … } }`). Not on the scan-to-pay critical path. Used if/when we need explicit cross-chain withdrawal to an EVM chain other than Arc. |

Domain IDs (`Domain` enum from `/v1/info`): 0 Ethereum · 1 Avalanche · 2 OP · 3 Arbitrum · 5 Solana · 6 Base · 7 Polygon PoS · 10 Unichain · 13 Sonic · 14 World Chain · 16 Sei · 19 HyperEVM · **26 Arc.** Network identifiers in x402 payloads are CAIP-2 strings (`eip155:<chainId>`, e.g. `eip155:5042002` for Arc Testnet).

Circle SDK options if the backend engineer prefers typed helpers over raw HTTP:
- `@circle-fin/x402-batching/server` — exposes `createGatewayMiddleware({ sellerAddress })` (Express) and `BatchFacilitatorClient` (framework-agnostic). Use `facilitator.settle(payload, requirements)` directly; the docs explicitly call out that `settle()` is optimized for low latency and should be used in production instead of `verify() → settle()`.
- `@circle-fin/x402-batching/client` — buyer-side SDK with `GatewayClient.deposit()` / `pay()` / `withdraw()` / `getBalances()`. **Not** used on mobile (requires a raw `privateKey` in-process, which breaks our `expo-secure-store` invariant). The mobile app signs EIP-3009 through its own `WalletKitAdapter` and sends the signed payload to `takumipay-api`. The SDK is fine on backend for withdrawal / balance ops where the relayer key lives in env.

Settle failure enum (from the OpenAPI) maps 1:1 to §9.1 error codes: `unsupported_scheme` / `unsupported_network` / `unsupported_asset` / `invalid_payload` / `address_mismatch` / `amount_mismatch` / `invalid_signature` → `SIGNATURE_INVALID`; `authorization_not_yet_valid` / `authorization_expired` / `authorization_validity_too_short` → `QUOTE_EXPIRED`; `self_transfer` / `unsupported_domain` / `wallet_not_found` → `CIRCLE_UPSTREAM_ERROR`; `insufficient_balance` → `INSUFFICIENT_GATEWAY_BALANCE`; `nonce_already_used` → `NONCE_REUSED`.

Rationale for the v1 proxy:

- **Uniform pipeline.** Every settled intent flows through the same backend handler that fires Xendit payout, writes receipts, emits FCM. No branching between "mobile hit Circle directly" vs "server hit Circle."
- **Audit trail.** Every payment has a server-side row tied to the intent id before Circle even returns. Disputes and refunds have a canonical record.
- **Keystore hygiene.** Mobile wallet keys stay in `expo-secure-store`; we sign on-device, proxy the signed payload. No private-key export to an SDK. Gateway settle is permissionless (no API key — `security: []`), so the proxy is a discipline choice, not a credential constraint.
- **Evolvability.** When we add our own Arc facilitator or swap in CCTP v2 as a fallback, the mobile app doesn't learn about it. One endpoint, stable shape.

### 6.6 Database schema (`takumipay-api`)

Six new tables. Columns deliberately mirror the §6 API types — the on-wire shape is the canonical contract, this section just names the persistence. Engine-agnostic (Postgres/MySQL fine); use whatever `takumipay-api` already has. Existing tables are untouched except the two inserts in §7.1.

**Sensitive fields** (encrypt at rest — use KMS, `pgcrypto`, or application-level envelope encryption — whichever the backend already uses elsewhere):

- `merchants.xendit_account_number`
- `xendit_payouts.account_number_encrypted`

Nothing else here is sensitive — JWS signatures and tx hashes are public.

#### `merchants`

Merchant profile. Created by `POST /v1/merchants/signup` (§6.1). One row per auth principal; `user_id` is the foreign key back into the existing `users` table.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `TEXT PK` | ULID, `mch_…` |
| `user_id` | `FK users` | unique (one merchant profile per user) |
| `display_name` | `TEXT NOT NULL` | |
| `contact_phone` | `TEXT NOT NULL` | WhatsApp, E.164 |
| `country` | `CHAR(2) NOT NULL` | `"ID"` for v1 |
| `xendit_channel_code` | `TEXT NOT NULL` | e.g. `"GOPAY"`, `"BCA"` |
| `xendit_account_number` | `BYTEA NOT NULL` | **encrypted at rest** |
| `xendit_account_holder_name` | `TEXT NOT NULL` | |
| `qris_pan` | `TEXT UNIQUE NULL` | first-claim-wins (§12 Q9) |
| `qris_sticker_photo_key` | `TEXT NULL` | object-storage key for evidence photo |
| `jws_qr` | `TEXT NOT NULL` | cached signed JWS so we don't re-sign on every read |
| `jws_issued_at` | `TIMESTAMPTZ NOT NULL` | |
| `jws_expires_at` | `TIMESTAMPTZ NULL` | null = non-expiring |
| `payout_provider` | `TEXT NOT NULL DEFAULT 'xendit'` | pluggability hook (§6.4) |
| `created_at`, `updated_at` | `TIMESTAMPTZ` | |

#### `payment_intents`

Every scan-to-pay attempt. Created by `POST /v1/pay/intents` (§6.2). `nanopay_nonce` is the 32-byte random the EIP-3009 authorization is signed against. For Path A (direct on Arc) it's also the correlation key the on-chain `Transfer(to=PLATFORM_TREASURY_ADDRESS)` event watcher matches against. For Path B (Nanopayments, the default) we don't need an event watcher — the settle response's `transaction` UUID is stored on the row instead (column `circle_settle_tx_uuid` on `nanopay_submissions`).

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `TEXT PK` | ULID, `pi_…` |
| `payer_user_id` | `FK users` | |
| `merchant_id` | `FK merchants` | |
| `fiat_amount_minor` | `INTEGER NOT NULL` | e.g. 25000 for IDR 25,000 |
| `fiat_currency` | `TEXT NOT NULL` | `"IDR"` for v1 |
| `usdc_amount_micros` | `BIGINT NOT NULL` | 6-decimal USDC |
| `usdc_source_chain_id` | `INTEGER NOT NULL` | e.g. `84532` (Base Sepolia) |
| `usdc_treasury_address` | `TEXT NOT NULL` | platform EOA |
| `fx_rate` | `NUMERIC NOT NULL` | |
| `fx_pair` | `TEXT NOT NULL` | e.g. `"USDC/IDR"` |
| `fx_source` | `TEXT NOT NULL` | |
| `fees_network_usd_micros` | `INTEGER NOT NULL` | |
| `fees_platform_bps` | `INTEGER NOT NULL` | |
| `path` | `TEXT NOT NULL` | `"nanopay" \| "x402" \| "direct_arc"` |
| `nanopay_nonce` | `BYTEA UNIQUE NOT NULL` | 32 bytes — matches on-chain `Transfer` event correlation |
| `nanopay_valid_after`, `nanopay_valid_before` | `INTEGER NOT NULL` | unix seconds |
| `gasless_mode` | `TEXT NOT NULL` | `"nanopay" \| "arc_native" \| "x402_eip3009" \| "none"` |
| `requires_deposit` | `BOOLEAN NOT NULL` | |
| `status` | `TEXT NOT NULL` | `"QUOTED" \| "SIGNED" \| "SETTLED" \| "PAID_OUT" \| "FAILED" \| "EXPIRED"` |
| `created_at`, `expires_at`, `updated_at` | `TIMESTAMPTZ` | |

#### `nanopay_submissions`

The signed authorizations the mobile app POSTs to our proxy, which we then forward to Circle. Separate from `payment_intents` so we can track retries (signature invalid → user re-signs → new row) and the Circle attestation arrival independently of the intent lifecycle.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `TEXT PK` | |
| `intent_id` | `FK payment_intents` | |
| `signature` | `BYTEA NOT NULL` | 65 bytes |
| `submitted_at` | `TIMESTAMPTZ NOT NULL` | |
| `circle_settle_tx_uuid` | `UUID NULL` | `transaction` from `POST /gateway/v1/x402/settle` 200 response |
| `circle_settle_response_received_at` | `TIMESTAMPTZ NULL` | wall clock when settle returned |
| `circle_settle_network` | `TEXT NULL` | CAIP-2 network identifier from settle response |
| `failure_code` | `TEXT NULL` | one of `NanopayFailureCode` (§6.2) — mapped from settle `errorReason` |
| `failure_message` | `TEXT NULL` | raw `errorReason` echo for debugging |

#### `xendit_payouts`

One row per Xendit `POST /v2/payouts` call. The `reference_id` equals `intent_id` and is used as the Idempotency-Key so retries don't double-disburse. The full Xendit response is stashed as JSONB for debugging failed payouts — Xendit occasionally returns nested error structures that are painful to normalize up-front.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `TEXT PK` | |
| `intent_id` | `FK payment_intents` | |
| `xendit_payout_id` | `TEXT UNIQUE NULL` | Xendit's own id from their response |
| `reference_id` | `TEXT NOT NULL` | `= intent_id` (idempotency-key) |
| `channel_code` | `TEXT NOT NULL` | echo of merchant's channel at payout time |
| `account_number_encrypted` | `BYTEA NOT NULL` | **encrypted at rest** |
| `amount` | `INTEGER NOT NULL` | fiat minor units |
| `currency` | `TEXT NOT NULL` | `"IDR"` for v1 |
| `status` | `TEXT NOT NULL` | `"PENDING" \| "PROCESSING" \| "COMPLETED" \| "FAILED"` |
| `requested_at`, `completed_at`, `webhook_received_at` | `TIMESTAMPTZ` | |
| `xendit_response_body` | `JSONB NULL` | full Xendit response, for debugging |

#### `gateway_deposits`

One-time USDC deposit each user makes into `GatewayWallet` on their source chain. Prerequisite for any Nanopay payment. A user has zero or one `CONFIRMED` row; pending/failed rows may accumulate.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `TEXT PK` | |
| `user_id` | `FK users` | |
| `source_chain_id` | `INTEGER NOT NULL` | |
| `tx_hash` | `TEXT NOT NULL` | |
| `amount_micros` | `BIGINT NOT NULL` | |
| `used_circle_paymaster` | `BOOLEAN NOT NULL` | tracks whether gasless onboarding worked |
| `status` | `TEXT NOT NULL` | `"PENDING_ATTESTATION" \| "CONFIRMED" \| "FAILED"` |
| `created_at`, `confirmed_at` | `TIMESTAMPTZ` | |

#### `merchant_qris_claims`

Audit trail for QRIS PAN disputes (§12 Q9). Separate table — not inline on `merchants` — so that claim history survives merchant profile updates and can't be silently overwritten. Ops tool reads from here when resolving disputes.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `TEXT PK` | |
| `merchant_id` | `FK merchants` | |
| `qris_pan` | `TEXT NOT NULL` | |
| `sticker_photo_key` | `TEXT NOT NULL` | object-storage key |
| `claimed_at` | `TIMESTAMPTZ NOT NULL` | |
| `reviewed_at` | `TIMESTAMPTZ NULL` | |
| `dispute_status` | `TEXT NOT NULL DEFAULT 'none'` | `"none" \| "open" \| "resolved_valid" \| "resolved_invalid"` |

#### Indexes

```
CREATE UNIQUE INDEX ON merchants (user_id);
CREATE UNIQUE INDEX ON merchants (qris_pan) WHERE qris_pan IS NOT NULL;
CREATE INDEX        ON payment_intents (status, expires_at);   -- background expiry sweeper
CREATE UNIQUE INDEX ON payment_intents (nanopay_nonce);
CREATE INDEX        ON payment_intents (merchant_id, created_at DESC);  -- merchant payout history
CREATE INDEX        ON nanopay_submissions (intent_id);
CREATE INDEX        ON xendit_payouts (intent_id);
CREATE UNIQUE INDEX ON xendit_payouts (xendit_payout_id) WHERE xendit_payout_id IS NOT NULL;
CREATE INDEX        ON gateway_deposits (user_id, status);     -- "has this user completed onboarding?"
CREATE INDEX        ON merchant_qris_claims (qris_pan);
```

#### What's **not** in the schema (deliberate)

- **No `is_merchant` flag on `users`.** Existence of a `merchants.user_id = users.id` row is the source of truth. Cheaper than denormalizing, no drift risk.
- **No `channels` table.** Xendit `channel_code` enum is served by `takumipay-api` as config (either a hand-maintained JSON file or fetched from Xendit's channel-list endpoint and cached). Hardcoding a table would just add churn when Xendit renames channels (`SHOPEEPAY_ID` has moved before).
- **No `treasury_contracts` table.** v1 treasury is a single platform EOA per §7 — one address per environment, lives in env vars, doesn't need a DB row.

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
- **Treasury:** v1 uses a **platform-owned EOA** (`PLATFORM_TREASURY_ADDRESS`) as the single USDC seller address for all payments, both Path A and Path B. For Path B (Nanopayments, the default), the platform treasury is Circle's `payTo` — funds credit to the platform's Gateway balance and are withdrawn on demand. For Path A (direct-on-Arc fallback), the same address receives USDC via a plain ERC-20 `transfer`. Merchant accounting (which merchant the payment belongs to, how much IDR to disburse, which Xendit channel) lives in `takumipay-api`'s DB only — never on-chain. A `PlatformTreasury.sol` contract with on-chain fee splits, bulk settlement, or escrow is **out of v1 scope.** We'll add it when those features become load-bearing. Until then, treasury = one EOA per environment, custody = our relayer key, rescue = off-chain.

### 7.1 Backend database setup for Arc (`takumipay-api`)

Three inserts and one audit pass. Mobile's `useBlockchains()` and `useTokens()` hooks pick the rows up automatically on the next cache refresh; no mobile release required after this.

**Insert 1 — `blockchains` row for Arc Testnet:**

```
INSERT INTO blockchains (chain_id, name, is_evm, rpc_url, explorer_url,
                         native_currency, is_testnet, is_active)
VALUES (5042002, 'Arc Testnet', true, 'https://rpc.testnet.arc.network',
        'https://testnet.arcscan.app', 'USDC', true, true);
```

Note `native_currency = 'USDC'`, **not `'ETH'`.** This is Arc's defining quirk — gas is paid in USDC. If the backend currently assumes every EVM row has `native_currency = 'ETH'` in any code path (gas-price helpers, analytics labels, balance-formatting utilities), that code misbehaves on Arc. See audit below.

**Insert 2 — `tokens` row for USDC-as-native on Arc:**

```
INSERT INTO tokens (symbol, name, contract_address, decimals, blockchain_id,
                    is_stablecoin, is_native_currency, is_active)
VALUES ('USDC', 'USD Coin', '0x3600000000000000000000000000000000000000',
        6,                                    -- ERC-20 interface view — USDC micros
        <id of the Arc row above>,
        true, true,                           -- is_stablecoin + is_native_currency both true
        true);
```

Decimals = 6 is the **ERC-20 interface view** of Arc USDC. The underlying precompile has an 18-decimal "native gas view" too, but every read path (`balanceOf`, `transfer`, `transferWithAuthorization`) and every mobile-side amount calculation uses the 6-decimal view — same math as USDC on Ethereum / Base / Polygon / Arbitrum. The 18-decimal view only matters if backend ever calls `estimateGas` on a native-transfer path, which Nanopayments avoids entirely.

**Insert 3 — mainnet cut-over.** When Arc mainnet launches (§12 Q1), flip `is_testnet` to `false`, swap `chain_id` / `rpc_url` / `explorer_url` to the mainnet values, re-point the Arc USDC token row at the mainnet contract. No schema changes.

**Audit — grep for hardcoded ETH assumptions.** Quick sweep the `takumipay-api` codebase for:

```
grep -r "'ETH'"        takumipay-api/src/
grep -r '"ETH"'        takumipay-api/src/
grep -r "nativeCurrency" takumipay-api/src/
grep -rE "native.*ETH" takumipay-api/src/
```

Common offender locations: gas-price fetch helpers, analytics event tagging (`chain_family = "ethereum"` assumptions), balance-formatting utilities that hardcode `decimals: 18` for EVM natives. Anything that branches on `native_currency` string-equal should be updated to read the row value, not a hardcoded constant.

**Space-docking payoff.** Because chain metadata lives in the DB and is fetched by the mobile's existing `useBlockchains()` hook (per memory `feedback_filter_at_source.md`), adding Arc is literally "insert two rows + audit grep." No mobile release, no `WalletKitAdapter` subclass, no `if (chainId === 5042002)` branches anywhere. Future chains (Arc mainnet, Solana-Arc bridge settlement, whatever) follow the exact same two-row pattern.

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

## 8. AI Agent Mode (integration-ready; actual integration post-v1)

This section is **architecture only** — no code ships for agent mode in v1. The goal is that when we do wire agent mode in (post-M6), it is a thin connector on `takumi-agent-api` plus a chat-message renderer on mobile, not a rewrite of any primitive in this spec.

### 8.1 Integration surface — what agent mode consumes

The existing primitives already compose cleanly for agent-initiated payments because none of them assume a human-driven origin:

| Primitive | Who owns it | Already agent-ready? |
| --- | --- | --- |
| `POST /v1/pay/intents` (§6.2) | `takumipay-api` | ✅ — the request shape (`merchant` + `amountMinor` + `currency`) accepts either a scanned QR payload *or* a structured merchant reference. Agent uses the latter. |
| `GET /v1/pay/intents/:id` (§6.2) | `takumipay-api` | ✅ — polling is already the mobile-side status model. Agent-initiated intents surface via the same endpoint. |
| `GET /v1/merchants/lookup?q=…` *(new, post-v1)* | `takumipay-api` | Stub it **now** as an empty 501 so the agent-api MCP tool contract can point at a stable URL. Implement when agent mode ships. |
| `NanopayPayload` discriminated union (§6.2) | shared type | ✅ — EVM / SVM discrimination means agent-initiated intents work on whichever namespace the user's active wallet is in. |
| `kit.signTransferWithAuthorization` / `signX402SvmPayment` (§5.5) | mobile `WalletKitAdapter` | ✅ — the signer doesn't know who typed the intent into existence. |
| `/pay-merchant?intentId=…` route | mobile `app/pay-merchant.tsx` | ✅ — agent-emitted intents are rendered by the same screen, just deep-linked instead of reached by scan. This is the load-bearing reason the route takes `intentId` (not raw payload) as its primary param. |

**Explicit non-goals for agent mode** (these stay human-only by design):

- Agent does not sign transactions. Never. The three-role invariant (memory `feedback_role_separation.md`) is load-bearing. Signing requires user PIN/biometric, which means the physical device holder — not an LLM.
- Agent does not pick the namespace, chain, or gasless rail. The path selector (§5.6) is mobile-side; the agent produces an intent and hands control to the wallet.
- Agent does not bypass merchant onboarding. Unknown merchant → same `MERCHANT_NOT_ONBOARDED` error as a manual scan (§9.1) — the agent surfaces the invite flow in chat rather than forcing a payment.

### 8.2 MCP tool contract (to be added on `takumi-agent-api` post-v1)

When we ship agent mode, `takumi-agent-api` gains three MCP tools. Their names and shapes are pinned now so the current engineering doesn't accidentally couple to a different naming scheme:

```ts
// takumi-agent-api/src/mcp/tools/merchants.ts — sketch, not v1 scope

tool("lookup_merchant", {
  description: "Find an onboarded TakumiPay merchant by name, phone, or QRIS PAN.",
  input: z.object({
    query:   z.string().min(2),
    country: z.enum(["ID"]).default("ID"),
  }),
  // returns a short list of `{ merchantId, displayName, country }` — the agent
  // picks one and confirms with the user before creating an intent.
});

tool("create_payment_intent", {
  description: "Create a payment intent so the user can pay a merchant in local fiat.",
  input: z.object({
    merchantId:  z.string().regex(/^mch_/),
    amountMinor: z.number().int().positive(),  // IDR smallest unit
    currency:    z.enum(["IDR"]),
    memo:        z.string().max(140).optional(),
  }),
  // delegates to takumipay-api `POST /v1/pay/intents` with a server-to-server
  // bearer token scoped to agent-initiated intents. Returns the same
  // `PaymentIntent` shape from §6.2.
});

tool("get_payment_intent_status", {
  description: "Check whether a payment intent has been paid, failed, or expired.",
  input: z.object({ intentId: z.string().regex(/^pi_/) }),
  // wraps GET /v1/pay/intents/:id; agent uses this to close the loop
  // ("I see your coffee is paid — receipt on the way").
});
```

No `sign_payment` tool. No `submit_authorization` tool. The agent's surface stops at intent creation.

### 8.3 How agent mode renders a payment intent in chat

When `create_payment_intent` returns, the agent's tool-result payload is a structured block the mobile chat renders as a tappable card — not a raw JSON dump:

```ts
// The shape the agent emits as an `@ai-sdk/react` tool-result. Mobile renders
// it via a new <PaymentIntentCard> in components/home/TakumiAgent/.
interface AgentPaymentCard {
  type:         "payment_intent";
  intentId:     `pi_${string}`;
  merchant:     { displayName: string; country: CountryISO };
  fiat:         MoneyMinor;
  usdc:         USDCAmount;          // pre-computed, rendered as "~1.54 USDC"
  expiresAt:    number;
  /** Deep-link the card's "Pay" button navigates to. Expo Router already
   *  handles this scheme; see app/_layout.tsx linking config. */
  deepLink:     `takumipay://pay-merchant?intentId=${string}`;
}
```

Tap on the card → deep-link fires → `app/pay-merchant.tsx` opens with `intentId` as the route param → identical pay screen the user sees after a QR scan → PIN → sign → settle → Xendit → IDR lands. The agent's involvement ends when the card renders.

**Why a card, not a button that auto-signs:** three-role separation. A "confirm with one tap" card that auto-signs would mean the agent, in effect, decided to spend the user's USDC. A card that routes to the regular pay screen means the user re-confirms amount + merchant + PIN every time. Identical UX to a manual scan-to-pay — the agent just replaced the camera.

### 8.4 Namespace and chain discipline in agent mode

Per memory `feedback_agent_prompt_namespace.md`, the agent's wallet-context prompt surfaces `namespace` only — it does not prescribe "EVM-only", list disabled tools, or tell the model "this won't work on Solana." The MCP tool surface above is namespace-agnostic: `create_payment_intent` returns a `PaymentIntent` whose `NanopayPayload` discriminator (§6.2) is already resolved by the backend for whichever namespace the payer's active wallet is in. The agent never branches on `"eip155"` vs `"solana"`. If a namespace hasn't shipped its x402 scheme yet (e.g. pre-M6 Solana), the path selector on mobile (§5.6) handles the "switch to supported wallet" affordance — same UX as a manual scan, zero agent-specific code.

Per memory `feedback_chain_extension_discipline.md`, no `if (ns === "X")` appears in the MCP tool implementations or in `<PaymentIntentCard>`. Adding a chain is still "register detector + implement adapter method" — agent mode does not become a new place where chain-specific logic leaks.

### 8.5 What ships in v1 to make §8.1–8.4 work

Nothing extra. Every v1 deliverable (M1–M6 in §11) already produces the primitives agent mode consumes. The only v1 work that exists *because* of this section is:

1. **`/pay-merchant?intentId=…` accepts the intent id as the source of truth.** Do not wire the screen to require the raw QR payload; always resolve the intent by id. This is the deep-link contract agent mode needs.
2. **`PaymentIntent` is self-contained** — `displayName`, `fiat`, `usdc`, `expiresAt` are all on the shape. No additional fetch required to render a card. Already the case in §6.2.
3. **Idempotency on `POST /v1/pay/intents`** — agents retry. The endpoint should treat `(userId, merchantId, amountMinor, currency)` within a short window (30 s) as the same intent. Already hinted in §6.1 ("Idempotent on (userId, latest submission)") for merchant signup; apply the same discipline here. Low-effort backend change in M3.

When agent mode ships, the actual integration work is: one MCP tool file on `takumi-agent-api`, one `<PaymentIntentCard>` component in `components/home/TakumiAgent/`, one linking entry in `app/_layout.tsx`. No changes to the payment primitives.

## 9. Security Model

- **QR authenticity** — TakumiPay QRs are JWS-signed (ES256). EMVCo QRs carry CRC-16 but no signature; we require the *merchant_id* returned by `takumipay-api`'s national-QR lookup to be whitelisted before quoting — unknown merchant IDs fall back to a "merchant not registered" error instead of proceeding.
- **Replay** — intent id is the idempotency key end-to-end (Xendit `Idempotency-key` header; Path B correlation via the Gateway settle response's `transaction` UUID stored against `intent_id`; Path A correlation via the on-chain USDC `Transfer(to=PLATFORM_TREASURY_ADDRESS)` event matched on `(value, nonce)`). Circle's own nonce-reuse guard (`nonce_already_used` in the settle `errorReason` enum) closes the last hole: resubmitting the same signed authorization is always a no-op at Circle. Same intent id can be retried safely.
- **FX manipulation** — the mobile app shows the *local-fiat* amount as the source of truth. USDC amount is a function of it. User approves IDR, not USDC micros. Rate freeze is 60 s; after that we re-quote before the signing modal opens.
- **Scope creep** — the mobile app never handles merchant bank credentials. Xendit creds live in `takumipay-api` only.
- **Clipboard hygiene** — see `docs/clipboard-policy.md`; do not copy any merchant token / intent id to clipboard.

### 9.1 Error States Matrix (production-ready UX copy)

Every error the mobile app can encounter on the scan→pay→settle path, mapped to source, UX copy, and recovery action. Engineer implements a single `<PaymentError>` component that switches on `code`. Copy is the v1 English baseline — i18n wiring lands alongside the component.

| Code | Source | Shown as | Primary CTA | Secondary / fallback |
| --- | --- | --- | --- | --- |
| `QR_UNRECOGNIZED` | scanner classifier | "We couldn't read that QR code. Try again." | "Scan again" (reopens camera) | Back |
| `QR_TAMPERED` | TakumiPay JWS detector (signature fail) | "This TakumiPay QR isn't valid. It may have been altered." | "Scan again" | Help: `support@…` |
| `MERCHANT_NOT_ONBOARDED` | `POST /v1/pay/intents` (404) | "This merchant isn't part of the TakumiPay ecosystem yet. Invite them?" | "Copy invite link" (WhatsApp share) | "Scan again" |
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

# Default source chain for the user's one-time Gateway deposit. Most
# users land here on Arc Testnet directly (USDC faucet at
# faucet.circle.com covers Arc); the user can deposit from any other
# supported source chain — Gateway unifies the balance across all 13
# domains. Read by the onboarding screen only.
EXPO_PUBLIC_NANOPAY_SOURCE_CHAIN_ID=5042002                          # Arc Testnet (Circle domain 26)
EXPO_PUBLIC_USDC_BASE_SEPOLIA_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e   # only used when the user explicitly picks Base Sepolia at deposit

# Circle Gateway — public contract addresses, no secret required.
# `GatewayWallet` is also the EIP-712 `verifyingContract` for the
# EIP-3009 signature (the canonical address per source chain is fetched
# at backend boot from `GET /gateway/v1/x402/supported`; the env value
# below is the testnet default for Arc and is shown to the user during
# onboarding so they know which contract they're depositing into).
EXPO_PUBLIC_CIRCLE_GATEWAY_WALLET=0x0077777d7EBA4688BDeF3E311b846F25870A19B9
EXPO_PUBLIC_CIRCLE_GATEWAY_MINTER=0x0022222ABE238Cc2C7Bb1f21003F0a260052475B

# Circle Nanopayments — the default gasless rail. Endpoint is part of
# the public Gateway API, no key required (the OpenAPI declares
# `security: []` for /gateway/v1/x402/*). Mobile never hits Circle
# directly in v1 — every signed authorization is POSTed to
# takumipay-api, which proxies to the URL below. The flag exists only
# as a dev-time escape hatch.
EXPO_PUBLIC_CIRCLE_NANOPAY_API=https://gateway-api-testnet.circle.com   # https://gateway-api.circle.com in prod
EXPO_PUBLIC_CIRCLE_NANOPAY_SUBMIT_VIA_SERVER=true                       # v1 locked to true; mobile POSTs to takumipay-api proxy

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
CIRCLE_API_KEY=SAND_API_KEY:…                  # OPTIONAL — Developer Console only; settle endpoints are permissionless
PLATFORM_TREASURY_ADDRESS_EVM=0x…              # platform-owned EOA; seller `payTo` for Path B-EVM + Path A
PLATFORM_TREASURY_ADDRESS_SVM=…                # platform-owned Solana keypair pubkey (base58); seller `payTo` for Path B-SVM — M6 only, can be blank until then
ARC_SETTLER_PRIVATE_KEY=0x…                    # EVM private key for PLATFORM_TREASURY_ADDRESS_EVM — also signs balance withdrawals
SVM_SETTLER_PRIVATE_KEY=…                      # Solana private key for PLATFORM_TREASURY_ADDRESS_SVM — M6 only
TAKUMIPAY_QR_PRIVATE_KEY_PEM=…                 # signs merchant QRs
```

### 10.1 Testnet → Mainnet Migration Checklist

Every var here is flipped in **one config change**. Nothing in `services/` or `app/` code has to change — chain IDs and contract addresses are read from env at boot time. Run the checklist during the cut-over window:

```dotenv
# Mobile app — swap these when graduating from testnet to mainnet
EXPO_PUBLIC_ARC_RPC_URL=https://rpc.arc.network                       # was: rpc.testnet.arc.network
EXPO_PUBLIC_ARC_CHAIN_ID=<MAINNET_ID>                                 # was: 5042002    — fill from docs.arc.network once published (§12 Q1)
EXPO_PUBLIC_USDC_ARC_ADDRESS=<MAINNET_USDC>                           # was: 0x3600…00   — confirm with Circle / Arc

EXPO_PUBLIC_NANOPAY_SOURCE_CHAIN_ID=<ARC_MAINNET_ID>                  # was: 5042002 (Arc Testnet) — flip to Arc mainnet domain when published (§12 Q1)
EXPO_PUBLIC_USDC_BASE_SEPOLIA_ADDRESS= → EXPO_PUBLIC_USDC_BASE_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913    # only relevant if users still deposit from Base; Arc remains the recommended default

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
CIRCLE_API_KEY=LIVE_API_KEY:…                                           # only if using Developer Console; settle is permissionless
EXPO_PUBLIC_CIRCLE_NANOPAY_API=https://gateway-api.circle.com           # was: gateway-api-testnet.circle.com (server-side env mirror)
PLATFORM_TREASURY_ADDRESS=<prod EOA — NEW KEY>                          # was: testnet platform treasury
ARC_SETTLER_PRIVATE_KEY=<prod relayer — NEW KEY, funded with mainnet USDC>
TAKUMIPAY_QR_PRIVATE_KEY_PEM=<prod signing key — NEW KEY>
```

Migration runbook (server-side):

1. Generate fresh prod signing key-pair for JWS merchant QRs. Bundle the new public JWK with an EAS OTA update — roll out 48h before go-live so pre-update clients upgrade.
2. Generate a fresh `PLATFORM_TREASURY_ADDRESS` (EOA) for mainnet; pin in `takumipay-api/.env`. No contract to deploy in v1 — see §7. If/when the `PlatformTreasury.sol` contract becomes load-bearing, its mainnet deploy step lands here.
3. Fund the prod relayer wallet with mainnet USDC on each Gateway source chain we support.
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
- **M6 — Solana x402 scheme (Path B-SVM).** Implement `SolanaWalletKit.signX402SvmPayment` — the adapter slot defined in M2 stays `undefined` until this milestone. Backend: discover Solana support via `/gateway/v1/x402/supported` at boot; if Circle's settle endpoint accepts `solana:*` networks, use it directly — otherwise integrate a Solana-compatible x402 facilitator (Coinbase CDP, rapid402, or self-hosted). Provision `PLATFORM_TREASURY_ADDRESS_SVM` (a Solana keypair) and its USDC ATA. Unlocks every user who holds USDC on Solana — a meaningful reach expansion since Solana is one of the largest USDC footprints outside Ethereum. **Shippable:** a Solana-native payer scans the same UMKM QR and pays without switching wallets.

Re-order is acceptable for M4–M6. Rule of thumb: every milestone must preserve the three-role separation and leave the Home Scan button functional.

### 11.1 Dependencies (npm packages to add)

All compatible with Expo 54 + Hermes. Pin exact versions in `package.json`; upgrade via Dependabot cadence.

| Package | Purpose | Introduced in | Notes |
| --- | --- | --- | --- |
| `jose` | EIP-712 / JWS sign + verify for the TakumiPay merchant QR detector (§4.6) | M1 | Pick the `jose` browser build; ensure `react-native-quick-crypto` or `react-native-get-random-values` polyfill is imported before first use. |
| `@emvco-qrcps/parser` *(or equivalent — see note)* | EMVCo TLV decoder + CRC-16 validation for QRIS / PromptPay / DuitNow / VietQR / QR Ph (§4.3) | M1 | No single dominant library. Short-list: `emv-qr-cps` (npm, minimal), or write ~120 LoC ourselves from the EMVCo spec. Engineer chooses — both are fine. Tests are the real contract. |
| `viem` | Already a dep. EIP-3009 typed-data signing rides its `signTypedData`; ERC-20 `transfer` for direct-on-Arc settlement (§5.1, §5.5) | — (existing) | Current version already covers everything we need. |
| `permissionless` | ERC-4337 UserOperation builder for Gateway deposit wrapped via Circle Paymaster (§5.4 table row, §5.5 `sendUserOpWithUsdcPaymaster`) | M4 | Ships with bundler clients for Pimlico/Alchemy/Stackup. Pick Pimlico unless infra already uses Alchemy. |
| `@circle-fin/x402-batching` *(server entry)* | Gateway settle + verify + balance / deposit / withdraw calls on the server. Use `BatchFacilitatorClient.settle(payload, requirements)` directly — Circle's docs explicitly recommend `settle()` over `verify() → settle()` in production for latency. Mobile doesn't import this (the buyer-side `GatewayClient` requires a raw private key, which breaks our `expo-secure-store` invariant). | M2 (backend-only) | If the SDK is pre-1.0 or you hit issues, the underlying HTTP API (`POST /gateway/v1/x402/settle`) is permissionless and stable — fall back to `fetch`. |
| `expo-camera` | Already a dep. Powers `app/scan-to-pay.tsx` + the "Scan my QRIS" merchant onboarding step (§1.1.1). | — (existing) | No version bump needed. |
| `expo-image-picker` / `expo-image-manipulator` | Capture the QRIS sticker photo during merchant onboarding (§1.1.1, §12 Q9) + compress before upload. | M3 | Compress to ≤200 KB JPEG before POST; server stores the key on the `MerchantSignupRequest.qrisLink.stickerPhotoKey` field. |
| `react-native-qrcode-svg` | Render the merchant's JWS QR on `app/merchant/qr.tsx` + export to PNG for `Save to Photos`. | M1 (onboarding shell) | High-density 400×400 at 10 % error correction is fine for a sticker print at business-card size. |
| `viem/utils` `keccak256` + `hexlify` | Already in viem. Used by `buildAuthorization.ts` for the EIP-712 domain hash. | M2 | No new dep. |
| `zod` | Already a dep. Parse every backend response + JWS payload at the boundary. | — (existing) | Every type in §6 should have a matching zod schema collocated. |

**Nothing else ships in v1 from the `nanopay` side.** Deliberately *not* in the dep list: Circle's `@circle-fin/bridge-kit` (redundant with Nanopayments for our use case), a dedicated x402 client library (the x402 path in M5 reuses `viem.signTypedData` + plain `fetch` — no library needed), and any generic "QRIS acquirer" SDK (we're not an acquirer, we only decode).

## 12. Open Questions

- **Q1 — Arc mainnet ID & Gateway availability.** ✅ Partially resolved (testnet). Arc is Circle domain `26` and is first-class in Gateway as of testnet Feb 2026 — `chain: "arcTestnet"` is the example chain in Circle's own buyer SDK quickstart, and the supported-chains list returned by `GET /v1/info` includes Arc alongside the other 12 EVM/Solana domains. Path B's "Gateway → Base → CCTP v2 → Arc" fallback is no longer required. Mainnet domain ID + USDC contract still TBD until Arc publishes its mainnet reference page; flip in `EXPO_PUBLIC_ARC_CHAIN_ID` (§10.1) when available.
- **Q2 — Merchant onboarding UX.** ✅ Locked: in-app, §1.1.1. Two buttons on `login.tsx` + single-screen form + QR home screen. No separate web portal in v1.
- **Q3 — National-QR coverage.** ✅ Locked for v1: **Indonesia QRIS only.** PromptPay (TH), DuitNow (MY), VietQR (VN), QR Ph (PH) each become their own detector + `MerchantChannelsResponse` entry when we expand. Not blocking M1–M5.
- **Q4 — KYC / transaction limits.** Xendit has per-channel holding limits (e.g. max balance in OVO/GoPay). Backend must reject quotes that would exceed the channel cap. Not a mobile concern but will surface as a 400 on `/intents`.
- **Q5 — Refund path.** If Circle settle succeeds (Path B) or the Arc on-chain transfer confirms (Path A) but the Xendit payout fails after retries, USDC is sitting in `PLATFORM_TREASURY_ADDRESS` (or the platform's Gateway balance) against an intent that never disbursed IDR. Define the manual refund runbook before production — likely: refund back to the payer's source chain via Gateway `POST /v1/transfer` (cross-chain) or a plain ERC-20 return on Arc.
- **Q6 — Paymaster on EOAs.** ✅ Resolved upstream — Circle Paymaster supports EOAs via EIP-7702 since July 2025 (post-Pectra), live on Arbitrum + Base. No special smart-account onboarding required; existing EOA wallets can consume Paymaster-sponsored UserOps via `authorization_list`. Engineer should still gate the path behind the existing `EIP7702_ALLOWLIST` per our own security discipline.
- **Q7 — Solana gasless.** ✅ In scope, shipping in **M6** (§11). Architectural slot defined in M2 (`SolanaWalletKit.signX402SvmPayment`, `NanopayPayload` discriminated union). M2–M5 run EVM-only while the Solana integration lands; until M6 ships, a Solana-active payer is offered "Switch to supported wallet" in the path selector (§5.6). **Open questions still live:** (a) does Circle's Nanopayments `/gateway/v1/x402/settle` accept `solana:*` networks natively, or do we integrate a separate Solana x402 facilitator? Answered at M6 kickoff via `GET /gateway/v1/x402/supported`. (b) Is the x402 SVM scheme (`scheme_exact_svm`) stable enough to build on — track the RFC in `github.com/coinbase/x402/issues/646` (Deadline Validation + Smart Wallet Support).
- **Q9 — QRIS PAN claim verification.** At onboarding the merchant asserts "this QRIS Merchant PAN is mine." v1 mitigations: unique-constraint the `qrisPan` column (first claim wins → duplicate claim returns `PAN_ALREADY_CLAIMED`), require a photo upload of the physical sticker as lightweight evidence archived for manual dispute review, and trust-on-first-use otherwise. Real merchants notice immediately when TakumiPay payouts stop reaching them; dispute reverses the claim. Stronger verification (e.g. SMS to a phone number bound to the QRIS at the acquirer level) requires acquirer API access — post-v1.
- **Q8 — Closed vs open merchant network.** V1 assumes the scanned QRIS / PromptPay / DuitNow / VietQR / QR Ph merchant has **already onboarded with us** (their merchant ID is in `takumipay-api`'s registry alongside a Xendit `channel_code` + `account_number`). Paying a merchant the backend has never seen requires either (a) proxying through a QRIS acquirer license so we can route over the national QR rails natively, or (b) Xendit exposing a "pay any QRIS acquirer ID" disbursement channel. Decide before marketing says "pay any UMKM." If we ship closed-network v1, the unknown-merchant error on `POST /v1/pay/intents` surfaces as `MERCHANT_NOT_ONBOARDED` in §9.1 with copy *"This merchant isn't part of the TakumiPay ecosystem yet. Invite them?"* — merchant-framed, no USDC/IDR language in the fallback.

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
2. **Circle Gateway + Nanopayments** *(blocker for M2)*
   - **No early-access application required for testnet.** The Gateway x402 endpoints (`/gateway/v1/x402/settle`, `/verify`, `/supported`, `/transfers`) are permissionless — the OpenAPI declares `security: []` for the whole API. Just point `takumipay-api` at `https://gateway-api-testnet.circle.com` and start sending requests. Mainnet base URL is `https://gateway-api.circle.com`; same shape, no key.
   - **Optional:** Sign up at [`app.circle.com`](https://app.circle.com) and generate `CIRCLE_API_KEY` if you want the Developer Console (transfer history dashboards, webhook configuration, attestation inspection). Not on the critical path for v1. If used, save as `CIRCLE_API_KEY` in `takumipay-api/.env`. **Do not** put this in mobile `.env`.
   - Mint the platform's seller address: generate a fresh EOA, save the private key as `ARC_SETTLER_PRIVATE_KEY` in `takumipay-api/.env`, save its public address as `PLATFORM_TREASURY_ADDRESS` (this is the `payTo` Circle sees on every settle call). Fund it with testnet USDC via [`faucet.circle.com`](https://faucet.circle.com) on Arc Testnet (v1 source + destination) — additional source chains are nice-to-have for users who deposit from elsewhere.
   - At backend boot, `takumipay-api` calls `GET /gateway/v1/x402/supported` once and caches `{ name, version, verifyingContract }` per source chain — these are the EIP-712 domain values the mobile adapter signs against. Refresh on a slow cron (daily) or on settle errors that look domain-related.
   - **No webhooks needed for the critical path.** The settle response is synchronous and is the trigger for Xendit (§6.4). Circle's transfer-status endpoint (`GET /gateway/v1/x402/transfers/{id}`) is for reconciliation, not for unblocking the payout.
   - No mobile-app Circle keys anywhere. The mobile app carries Gateway *contract addresses* (public) and the chain IDs, that's it.
3. **Arc Network**
   - No account needed. For testnet, fund a wallet at Arc's Circle Faucet (link in `docs.arc.network`). For mainnet, Arc + USDC go live per Arc's release schedule.
   - No contract to deploy in v1 — `PLATFORM_TREASURY_ADDRESS` is an EOA funded per environment. If/when a `PlatformTreasury.sol` contract becomes load-bearing (on-chain fee splits, escrow, bulk settle), deploy it via `forge create --rpc-url $ARC_RPC --private-key $ARC_SETTLER_PRIVATE_KEY` and repoint `PLATFORM_TREASURY_ADDRESS`.
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
- x402 — `x402.org`, official docs at `docs.x402.org/introduction`, spec at `github.com/coinbase/x402`, **EVM `exact` scheme** at `github.com/coinbase/x402/blob/main/specs/schemes/exact/scheme_exact_evm.md`, **SVM (Solana) `exact` scheme** at `github.com/coinbase/x402/blob/main/specs/schemes/exact/scheme_exact_svm.md`, Solana getting-started guide at `solana.com/developers/guides/getstarted/intro-to-x402`, CDP facilitator at `docs.cdp.coinbase.com/x402/welcome`, network support at `docs.cdp.coinbase.com/x402/network-support`, candidate Solana facilitators: `github.com/rapid402/rapid402-sdk`, `x402-solana.com`
- Repo anchors — `app/index.tsx:86`, `components/home/Main/ScanToPayChatModeFloatingButtons.tsx:36`, `app/scan-to-pay.tsx:29-62`, `app/send.tsx:398-435`, `app/withdraw.tsx:28-33`, `services/walletKit/types.ts:66`, `constants/configs/chainConfig.ts:68`
