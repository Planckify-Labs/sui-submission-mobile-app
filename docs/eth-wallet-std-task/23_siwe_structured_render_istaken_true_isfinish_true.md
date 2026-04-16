# Task 23 — SIWE (EIP-4361) structured rendering + domain check

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** `dapp-bridge-spec.md` §6 Phase 1b bullet 12,
§10.2 EIP-4361, §10.4 invariant 7.

## Why this matters

Our own backend already uses SIWE login. Rendering the raw SIWE
message as unformatted text is both ugly and dangerous — it's the
exact shape phishing sites abuse (swap `domain` for a typo). A
structured renderer with a domain-mismatch guard fixes both.

## Scope

- `services/decoders/siwe.ts`:
  - `tryParseSiwe(message: string): ParsedSiwe | null`.
  - Recognize the EIP-4361 text format:
    ```
    {domain} wants you to sign in with your Ethereum account:
    {address}

    {statement?}

    URI: {uri}
    Version: 1
    Chain ID: {chainId}
    Nonce: {nonce}
    Issued At: {issuedAt}
    Expiration Time: {expirationTime?}
    Not Before: {notBefore?}
    Request ID: {requestId?}
    Resources:
    - {uri1}
    - {uri2}
    ```
  - Return `null` for non-SIWE strings. Never false-positive.
- `EvmSignMessageSheet` for `personal_sign` intents:
  - Run `tryParseSiwe(payload.message)` (decoded UTF-8). On hit,
    render a structured block:
    - Domain badge (large, prominent).
    - Address (match active wallet → green check, else red warning).
    - Chain id → chain name lookup.
    - URI, Nonce, Issued At, Expiration (relative time).
    - Resources list.
  - On miss, fall back to plain-text rendering.
- Domain-mismatch inspector (extend the existing
  `ApprovalHeuristicInspector` from task 21):
  - If SIWE `domain` normalized host ≠ `intent.origin.host`,
    annotate `danger` `{code: "siwe.domain-mismatch"}`. Renderer
    shows the danger banner and requires hold-to-confirm.
  - If SIWE `address` ≠ `activeWallet.address`, annotate `warn`
    `{code: "siwe.address-mismatch"}`.

## Rules (non-negotiable)

- **Parser is strict about the EIP-4361 grammar.** Whitespace matters
  (most SIWE libraries emit the exact spec-shape). Don't accept
  near-misses.
- **Domain normalization.** Lowercase host, strip trailing dot,
  strip port if default. Same rules as `services/permissions/caip.ts`.
- **Chain id on the message vs chain id of the active wallet.**
  These must match. If not, annotate `warn` (this is not
  automatically dangerous — a dApp might ask for a SIWE bound to a
  specific L2 for downstream auth — but worth surfacing).
- **Never rewrite the message.** The signer signs the original text
  exactly. Structured view is display-only.

## Acceptance

- [ ] Our own backend SIWE flow renders as a structured block with
      green-check address match.
- [ ] A SIWE with `domain: "foo.xyz"` and `origin.host: "f00.xyz"`
      produces a `danger` banner and hold-to-confirm.
- [ ] A non-SIWE `personal_sign` (e.g. random app-specific message)
      renders as plain text unchanged.
- [ ] Unit tests for parser: valid, missing optional fields,
      malformed, not-SIWE.
- [ ] `pnpm check:syntax` passes.

## Out of scope

- Signing arbitrary EIP-4361 messages back into the WebView (that
  happens in `eth_signTypedData` flows if the message is embedded).
- SIWE over WalletConnect (future transport).
