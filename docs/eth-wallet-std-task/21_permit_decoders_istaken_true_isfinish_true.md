# Task 21 — Permit2 + ERC-2612 decoders + unlimited-approval warn

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** `dapp-bridge-spec.md` §5 `decoders/`, §6 Phase 1b
bullet 10, §10.2 Permit2 / ERC-2612, §10.4 invariant 3.

## Why this matters

Today `eth_signTypedData_v4` renders raw JSON. The most common
payload a user signs is a token permit — Permit2 (Uniswap) or
ERC-2612 (USDC, DAI). Users approve unlimited spending every day
because the sheet doesn't say "this grants spender X unlimited access
to token Y". This is the #1 drain vector on wallets with
blind-signing UX.

## Scope

- `services/decoders/erc2612.ts`:
  - `tryDecodeErc2612(typedData): {token, spender, amount, deadline, nonce, isUnlimited} | null`.
  - Identify by domain `(name: "USD Coin" | ...)` + type `Permit(owner,
    spender, value, nonce, deadline)`.
- `services/decoders/permit2.ts`:
  - `tryDecodePermit2(typedData): {tokens: {address, amount,
    expiration}[], spender, sigDeadline, nonce, isUnlimited} | null`.
  - Identify by domain `Permit2` + types `PermitSingle` /
    `PermitBatch` / `PermitTransferFrom`.
- `services/decoders/index.ts` exports `decodeTypedData(typedData)`
  that walks known decoders; first match wins.
- `EvmSignMessageSheet` for `signTypedData` intents:
  - Run decoder at mount. On hit, render structured view:
    `Spender: {name or address} | Token: {symbol} | Amount: {formatted
    or "Unlimited ⚠️"} | Deadline: {relative time}`.
  - On miss, fall back to today's raw JSON (collapsible).
- Built-in `ApprovalHeuristicInspector` (new file under
  `services/bridge/inspectors/`):
  - `mode: "auto"`, `priority: 10`.
  - Adds `warn` annotation `{code: "approval.unlimited"}` if the
    decoder reports `isUnlimited: true`.
  - Renderer requires hold-to-confirm when any annotation has
    `code: "approval.unlimited"`.

## Rules (non-negotiable)

- **Decoders are pure.** Input: typed data. Output: decoded shape or
  null. No I/O, no React.
- **Decoders never guess.** If any field of the recognized schema is
  missing, return null. False positives erode user trust.
- **Amount formatting uses token decimals.** Look up via the existing
  token-list store; fall back to 18 on unknown tokens.
- **Unlimited threshold is `2^256 - 1 - (2^10)`.** Using strict
  equality misses "almost max" values protocols use to dodge the
  warning.
- **Hold-to-confirm is 1.5s**, with a visible progress ring.

## Acceptance

- [ ] Signing a USDC `Permit` produces the decoded structured view.
- [ ] Signing a Uniswap Permit2 `PermitSingle` produces the decoded
      view with the spender resolved to "Universal Router" via a
      local address book (small JSON, ships with the app).
- [ ] Unlimited amount triggers `approval.unlimited` annotation and
      hold-to-confirm.
- [ ] Unknown typed data still renders the raw JSON fallback and
      signs after approval.
- [ ] Unit tests for the two decoders across: valid, almost-max,
      zero-amount, malformed.
- [ ] `pnpm check:syntax` passes.

## Out of scope

- Seaport / Universal Router decoders (§8 open question 6 — defer to
  Phase 5 simulator).
- Live price lookup on the approved amount.
