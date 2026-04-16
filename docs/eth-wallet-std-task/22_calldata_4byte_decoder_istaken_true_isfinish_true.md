# Task 22 — Calldata 4byte selector decoder

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** `dapp-bridge-spec.md` §5 `decoders/calldata.ts`,
§6 Phase 1b bullet 11.

## Why this matters

Today `EvmTransactionSheet` shows raw `data` hex, which is useless to
humans. Matching the leading 4 bytes (function selector) against a
local database gets us from `0xa9059cbb` to `transfer(address,uint256)`
for the top N functions — covers ~90% of real tx volume without any
network.

## Scope

- `services/decoders/calldata.ts`:
  - Bundle a gzipped JSON (or binary) asset: selector → signature.
    Target top ~10k selectors by usage (`transfer`, `approve`,
    `transferFrom`, `swap*`, `multicall`, Seaport `fulfill*`, etc.).
    Size budget: ≤50KB gzipped on-disk (spec §6 says ~30KB for top N;
    pick the biggest N that fits 50KB).
  - `decodeCalldata(data: 0x-hex): {selector, signature, args:
    DecodedArg[]} | {selector, signature: null}`.
  - `DecodedArg` = `{name, type, value}` where `value` is the
    human-readable formatted form (addresses truncated with full on
    tap, uint decimal-formatted per type).
  - Uses the signature string to ABI-decode the tail via `viem`'s
    `decodeFunctionData` or a hand-rolled parser.
- `EvmTransactionSheet` body:
  - If `data` present:
    - Show decoded view by default: `Function: transfer | to: 0x… |
      amount: 1.5 USDC` (token symbol pulled from token store when
      the tx `to` is a known ERC-20).
    - Raw hex collapsible below.
  - If selector unknown: `Unknown function · selector: 0xabcd1234`
    + raw hex + `info` annotation.
  - If `data` empty / only `value`: simple "Transfer N ETH to X" view.

## Rules (non-negotiable)

- **Local only.** No network calls. No 4byte.directory fetch at
  decode time. (We may periodically rebuild the asset from a network
  source in a build step — out of scope here.)
- **Selector collisions exist.** If two signatures share a selector,
  rank by heuristic (prefer standard interfaces like
  `IERC20.transfer`). Annotate `info` on ambiguous matches so the
  user is aware.
- **Bundle is lazy-loaded.** Don't blow up bundle size. Use Metro's
  `require(<path>)` + `useMemo` to load on first sheet mount.
- **Never fail-open into signing.** If decode throws, fall back to
  raw-hex display; never block the sheet.

## Acceptance

- [ ] A raw tx that calls USDC `transfer` renders as `Function:
      transfer(address,uint256) · to: 0x… · amount: 1.5 USDC`.
- [ ] A raw tx with an unknown selector renders `Unknown function ·
      selector: 0x…` + raw hex.
- [ ] Decoder bundle ≤ 50KB gzipped.
- [ ] Unit tests for `transfer`, `approve`, `multicall`, unknown
      selector, malformed data.
- [ ] `pnpm check:syntax` passes.

## Out of scope

- Remote 4byte lookup fallback (Phase 5's `SimulationInspector` does
  this better via tracing).
- Protocol-specific decoders beyond the local signature map.
