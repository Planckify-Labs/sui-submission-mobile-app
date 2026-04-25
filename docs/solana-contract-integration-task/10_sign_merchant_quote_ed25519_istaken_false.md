# Task 10 — `signMerchantQuote` — Ed25519 signing of MerchantQuoteParams

**Status:** Not taken
**Owner:** API (takumipay-api)
**Spec reference:** `solana-contract-integration-spec.md` §5.1
(quote signing section), §5.3, §8.1, §5.7.

## Why this matters

The Solana TakumiPay program verifies merchant payment authorization
via Ed25519 signatures — the backend signs a borsh-serialized
`MerchantQuoteParams` struct, and the on-chain program validates this
signature via the Ed25519 precompile instruction. This is the Solana
counterpart to the EVM ECDSA quote signing in `pay/quote-signer.service.ts`.

## Scope

Add to `SolanaVerificationService` (Task 06):

```typescript
signMerchantQuote(params: MerchantQuoteParams): Uint8Array;
```

### Implementation

1. **Load Ed25519 keypair** from `SOLANA_QUOTE_SIGNER_PRIVATE_KEY`
   env var. Base58-encoded 64-byte keypair (same format as Solana CLI
   keypair files). Load once at service construction.
2. **Borsh-serialize** `MerchantQuoteParams`:
   - `refId: string` → length-prefixed bytes
   - `refIdHash: [u8; 32]` → fixed 32 bytes
   - `merchantId: string` → length-prefixed bytes
   - `amount: u64` → 8 bytes LE
   - `platformFeeAmount: u64` → 8 bytes LE
   - `fiatAmountMinor: u64` → 8 bytes LE
   - `fiatCurrency: [u8; 3]` → fixed 3 bytes
   - `exchangeRateId: u64` → 8 bytes LE
   - `expiresAt: i64` → 8 bytes LE
3. **Sign** the serialized bytes with the Ed25519 keypair using
   `nacl.sign.detached(message, secretKey)` or `@solana/web3.js`
   `Keypair.fromSecretKey(...).sign(...)`.
4. **Return** the 64-byte Ed25519 signature.

### Environment variable

```env
SOLANA_QUOTE_SIGNER_PRIVATE_KEY=...
```

- Validate at boot: keypair must load successfully. Fail-fast if
  malformed or missing (when Solana blockchain rows exist in DB).
- The public key of this keypair must match `Config.backendSigner`
  on-chain. Log a warning at boot if it can't be checked (no RPC),
  but Task 13 verifies this at intent creation time.

## Rules (non-negotiable)

- **This is the ONLY method that needs the keypair.** Verification
  reads (Tasks 07–09) are pure RPC calls — no keypair. Keep the
  keypair isolated to this method and its constructor loading.
- **Borsh serialization must match the on-chain program's expected
  format exactly.** Field order, encoding, and alignment must match
  the Rust `MerchantQuote` struct layout. Test against a known
  contract-generated expected signature.
- **Never expose the private key in logs or error messages.**

## Acceptance

- [ ] Method added to `SolanaVerificationService`.
- [ ] Keypair loads from env var at construction.
- [ ] Unit test: sign a known `MerchantQuoteParams` → signature matches
      expected value (computed from the contract's test suite).
- [ ] Unit test: borsh serialization byte output matches expected bytes.
- [ ] Boot fails gracefully when env var is missing/malformed.

## Out of scope

- Using the signature in intent creation (Task 13).
- Ed25519 verify instruction on mobile (Task 19).
- Keypair rotation handling (future — see spec §10 item 1).
