# Task 12 — `PermissionStore` (EIP-2255) + `eth_accounts` privacy fix

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** `dapp-bridge-spec.md` §5 `permissions/` layout,
§10.1 (eth_accounts, wallet_getPermissions, wallet_requestPermissions,
wallet_revokePermissions rows), §10.4 invariant 1.

## Why this matters

Today `eth_accounts` always returns the active wallet address
regardless of origin — a privacy leak (any page the WebView visits can
read the user's address without consent). EIP-2255 formalizes
per-origin grants. Landing this also underpins `ConnectSheet` writing
a durable grant (user doesn't re-approve every visit).

## Scope

Create `services/permissions/store.ts`:

- Keyed by `(originHash, walletAddress, chainId)`.
- `SecureStore`-backed with a JSON blob under
  `dapp-bridge/permissions`.
- API:
  - `grant({origin, wallet, chainId, caveats[]}): Promise<void>`
  - `revoke({origin, wallet?}): Promise<void>` (omit wallet to revoke
    all wallets for this origin).
  - `list(origin): PermissionGrant[]`
  - `isGranted(origin, wallet, chainId): boolean`
- Grant schema (§4.5 CAIP-2):
  ```ts
  type PermissionGrant = {
    origin: string;             // normalized host+path
    walletAddress: string;
    chainId: number;
    caveats: Array<{type: "restrictReturnedAccounts"; value: string[]}>;
    grantedAt: number;
  };
  ```

Create `services/permissions/caip.ts`:

- `hashOrigin(url): string` — sha256 of lowercased
  `protocol//host:port`, hex.
- `originKey(url): string` — normalized host key for grant lookup.
- CAIP-2 / CAIP-10 helpers — stubs today, used by Phase 3 / P1c.

Wire into `EvmAdapter`:

- `eth_accounts` → returns `[]` unless
  `isGranted(origin, activeWallet.address, chainId)`. §10.4 invariant 1.
- `wallet_getPermissions` → returns the grant list for this origin in
  EIP-2255 shape.
- `wallet_requestPermissions` → builds a `ConnectSheet` intent; on
  approve, calls `store.grant(...)`. Same code path `eth_requestAccounts`
  uses.
- `wallet_revokePermissions` → calls `store.revoke(...)`; no approval
  required (destructive but user-initiated from the dApp side).
- `ConnectSheet` (task 10's renderer) calls `store.grant` on approve.

Build `app/settings/dapp-permissions.tsx`:

- Lists all origins with grants.
- Tap an origin → list its wallets/chains + revoke buttons.
- Bulk "revoke all" per origin.

## Rules (non-negotiable)

- **Default deny.** Any method that discloses accounts returns `[]`
  when no grant exists (not the active wallet, not null — empty
  array to match MetaMask).
- **Grants are per `(origin, wallet, chainId)`.** Changing any of the
  three needs a new grant.
- **Origin normalization is strict.** `http://foo` and `https://foo`
  are different origins. `foo.xyz` and `Foo.Xyz` are the same.
- **Revoke is synchronous from the dApp's view.** Next `eth_accounts`
  call returns `[]` immediately.

## Acceptance

- [ ] `services/permissions/store.ts` + `caip.ts` exist.
- [ ] `eth_accounts` for a never-connected origin returns `[]`.
- [ ] Connecting via `eth_requestAccounts` persists a grant;
      relaunching the app and reloading the dApp reconnects
      automatically.
- [ ] `wallet_getPermissions` / `wallet_requestPermissions` /
      `wallet_revokePermissions` all return EIP-2255-shaped values.
- [ ] Settings screen lists and revokes.
- [ ] Unit tests: grant round-trip through SecureStore; revoke ends
      disclosure; `hashOrigin` stable across runs.
- [ ] `pnpm check:syntax` passes.

## Out of scope

- ERC-7715 session keys (deferred past Phase 1 per §10.1).
- Cross-device grant sync.
