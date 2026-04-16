# Task 15 — `WatchAssetSheet` (EIP-747)

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** `dapp-bridge-spec.md` §10.1 `wallet_watchAsset`,
§10.2 EIP-747, ERC-20/721/1155.

## Why this matters

DApps expect to register their token/NFT with the user's wallet with
one call (`wallet_watchAsset`). Without support, users manually add
contract addresses to see their balances — friction that competitive
wallets fixed years ago.

## Scope

- New `ApprovalKind: "watchAsset"` + payload type supporting ERC-20,
  ERC-721, and ERC-1155:
  ```ts
  export type EvmWatchAssetPayload =
    | { standard: "ERC20"; address: `0x${string}`; symbol: string;
        decimals: number; image?: string; chainId: number }
    | { standard: "ERC721" | "ERC1155"; address: `0x${string}`;
        tokenId?: string; symbol?: string; image?: string; chainId: number };
  ```
- `EvmAdapter.handleRequest` branch for `wallet_watchAsset`:
  - Zod-validate + sanity-check (contract has the expected `symbol()`
    / `decimals()` for ERC-20 via on-chain read — mismatch → `warn`
    annotation).
  - Emit an `ApprovalIntent<EvmWatchAssetPayload>`.
- `WatchAssetSheet.tsx`:
  - `<ApprovalShell>` wrapper.
  - Token preview: image, symbol, chain badge, contract address (full
    on tap).
  - ERC-20: show decimals + user's current balance.
  - ERC-721/1155: show collection name + (if `tokenId`) the token
    preview.
  - Approve / reject.
- `executeApproval`: persist to the existing token list store
  (extend; don't fork).

## Rules (non-negotiable)

- **On-chain `symbol` / `decimals` must match the requested values**
  for ERC-20. If they don't, auto-annotate `warn` and show both
  values side by side. Malicious dApps have historically abused
  `watchAsset` to trick users into adding scam tokens that *look*
  like USDC.
- **Contract address displayed in full on tap** (§10.4 invariant 4).
- **Image is sanitized.** Only `https://` URLs (not `ipfs://` until
  we've picked a gateway; not `data:` to avoid XSS in token lists).
- **Adding the same asset twice is idempotent.**
- **Unknown chain id → `4901`.** Sheet is not shown.

## Acceptance

- [ ] `wallet_watchAsset` for an ERC-20 shows the sheet and, on
      approve, the token appears in the wallet's token list.
- [ ] Symbol/decimals mismatch produces a `warn` annotation and
      renders both sides.
- [ ] ERC-721 and ERC-1155 flows render a different preview and
      still persist.
- [ ] Image URLs outside `https://` are stripped.
- [ ] Unit tests per standard + mismatch + duplicate.
- [ ] `pnpm check:syntax` passes.

## Out of scope

- IPFS image resolution (pick a gateway in a later task).
- Custom price-feed resolution for added tokens.
