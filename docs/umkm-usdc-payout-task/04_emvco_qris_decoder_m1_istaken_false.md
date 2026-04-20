# Task 04 — EMVCo TLV parser + CRC-16 validator (QRIS)

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** umkm-usdc-payout-spec.md §4.3 #3, §1.1.1, §11.1 (package note), milestone M1

## Why this matters

Most Indonesian UMKM already have a QRIS sticker from their acquirer.
To onboard them via the "Scan my QRIS" path (§1.1.1) and to recognize
their sticker on the payer side, we need to decode the EMVCo Co-Present
payload locally — **no network**. The decoder also validates CRC-16 so
tampered or misread stickers don't slip into the merchant registry.
The spec leaves the library choice to the engineer: pick a minimal npm
lib (e.g. `emv-qr-cps`) or hand-roll ~120 LoC — tests are the contract.

## Scope

1. Land code under `services/emvco/` — the directory exists today but
   is empty. Create `services/emvco/index.ts` and
   `services/emvco/parse.ts` exposing:
   - `parseEmvco(raw: string): { tags: Record<string, string>, crcValid: boolean }`
   - `extractQrisFields(tags): { qrisPan?: string, acquirerSubTag00?: string, merchantName?: string, currency?: string, country?: string }`
2. Implement TLV parsing per EMVCo Co-Present spec: each field is
   `<tag:2 digits><length:2 digits><value:length chars>`, concatenated.
3. Validate CRC-16/CCITT-FALSE (poly `0x1021`, init `0xFFFF`, no refin
   / refout, no xor-out) over the payload up to and including
   `"6304"` — compare against the trailing 4 hex chars.
4. Extract the QRIS-relevant fields:
   - Tag **26** — Merchant Account Information (nested sub-tags):
     sub-tag `00` = acquirer GUID/label (used for the "BCA / Mandiri"
     label in §1.1.1), sub-tag `01` or `02` carries the merchant PAN.
   - Tag **58** — Country Code (`"ID"`).
   - Tag **59** — Merchant Name (store name, ALL CAPS in QRIS).
   - Tag **53** — Currency (ISO 4217 numeric, `"360"` for IDR).
5. Create `services/paymentIntent/detectors/emvco.ts`: if `crcValid`
   and tag 58 === `"ID"`, emit a `merchant` channel with
   `provider: "xendit_qris"`, `merchantId: ""` (server resolves by
   PAN), `rawPayload: raw`.
6. Priority: below TakumiPay JWS and x402, above wallet URI /
   wallet address.
7. Add `services/emvco/parse.test.ts` with golden QRIS payloads
   covering: valid QRIS with CRC, tampered CRC (must return
   `crcValid: false`), nested tag 26 sub-tag extraction, non-QRIS
   EMVCo (different country code — must not route to QRIS provider).

## Rules (non-negotiable)

- **Pure module.** No network, no React. Lives alongside
  `services/paymentIntent/` imports.
- **Filter-at-source** (memory `feedback_filter_at_source.md`) —
  `extractQrisFields` returns the canonical shape; callers do not
  re-parse tag strings.
- **CRC invalid → detector returns `null`.** Never surface a broken
  QR to downstream code.
- **Don't lowercase tag 59.** Merchant edits casing on the signup
  form (§1.1.1); preserve QRIS ALL CAPS verbatim.

## Acceptance

- [ ] `services/emvco/{index,parse,parse.test}.ts` exist.
- [ ] `services/paymentIntent/detectors/emvco.ts` registered.
- [ ] Golden payload tests pass (valid + tampered + non-ID).
- [ ] `pnpm check:syntax` passes.
- [ ] `pnpm biome:check` passes.

## Out of scope

- PromptPay / PayNow / DuitNow / VietQR variants — §12 Q3, post-v1.
- Server-side PAN → merchant lookup — backend task.
- Sticker photo capture + upload — task 14.
