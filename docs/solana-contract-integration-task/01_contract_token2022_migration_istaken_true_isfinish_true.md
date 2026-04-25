# Task 01 — Anchor program: `anchor_spl::token` → `token_interface`

**Status:** Not taken
**Owner:** Contract (Anchor)
**Spec reference:** `solana-contract-integration-spec.md` §11 Decision 1.

## Why this matters

The current program hardcodes `anchor_spl::token` (SPL Token only).
Any stablecoin launching as a Token-2022 mint (IDRX, PYUSD, etc.)
would be unusable. `anchor_spl::token_interface` is a drop-in
replacement that works with both SPL Token and Token-2022 mints
transparently. This is a mechanical change — no logic rewrite — but
it must land before the IDL is copied into mobile and API (Tasks 02/03)
because the IDL changes when account types change from `Account` to
`InterfaceAccount`.

## Scope

- **All 5 instruction files** (`transaction.rs`, `merchant.rs`,
  `point.rs`, `treasury.rs`, `withdraw.rs`):

  ```rust
  // Before:
  use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
  // After:
  use anchor_spl::token_interface::{self, Mint, TokenInterface, TokenAccount, TransferChecked};
  ```

  | Current type | Replace with |
  |---|---|
  | `Account<'info, Mint>` | `InterfaceAccount<'info, Mint>` |
  | `Account<'info, TokenAccount>` | `InterfaceAccount<'info, TokenAccount>` |
  | `Program<'info, Token>` | `Interface<'info, TokenInterface>` |
  | `token::transfer(ctx, amount)` | `token_interface::transfer_checked(ctx, amount, mint.decimals)` |

- **`Cargo.toml`**: Enable the `token-interface` feature:
  ```toml
  anchor-spl = { version = "0.31", features = ["token-interface"] }
  ```

- **`anchor build`** — regenerate `target/idl/takumi_pay.json` and
  `target/types/takumi_pay.ts`.
- Run existing Anchor test suite to confirm no regressions.

## Rules (non-negotiable)

- **Instruction signatures stay identical.** No new parameters, no
  renamed instructions. The only addition is passing `mint.decimals`
  to `transfer_checked`.
- **PDAs unchanged.** Seed derivation does not change — the same
  accounts are created with the same seeds.
- **`token_program` validation.** Anchor validates at runtime that the
  passed program is one of the two valid token programs
  (`TokenkegQ...` or `Tokenz...`).

## Acceptance

- [ ] All 5 instruction files use `token_interface` imports.
- [ ] `Cargo.toml` has `token-interface` feature enabled.
- [ ] `anchor build` succeeds — new IDL + types generated.
- [ ] All existing Anchor tests pass.
- [ ] Manual test: call `createTransactionToken` with an SPL Token
      mint on localnet.

## Out of scope

- Copying the IDL into mobile/API (Tasks 02/03).
- Testing Token-2022 mints end-to-end (Phase 4).
- New instructions or account structures.
