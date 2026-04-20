# Task 48 — Testnet → mainnet migration runbook

**Status:** Not taken
**Owner:** Ops + Backend (takumipay-api) + Mobile (EAS OTA only)
**Spec reference:** umkm-usdc-payout-spec.md §10.1, §4.4, §7, §13,
cross-cutting (gates prod cutover — runs once after M6)

## Why this matters

§10.1 is explicit: zero mobile store release. All chain coordinates
live in `blockchains` + `tokens` rows; only `EXPO_PUBLIC_TAKUMIPAY_
QR_PUBKEY_JWK` rotates, and that ships via EAS OTA. The chain-
agnostic JWS design (§4.4) means merchants do **not** reprint
stickers. This task captures the exact order of operations, the
rollback step per change, and the cutover verification gate. Without
this runbook, migration becomes an ad-hoc edit-in-prod exercise.

## Scope

1. **Mobile (EAS OTA only, 48 h before go-live)** — rotate
   `EXPO_PUBLIC_TAKUMIPAY_QR_PUBKEY_JWK` to the new prod public JWK.
   Same OTA channel as `EIP7702_ALLOWLIST` per task 47. Rollback:
   revert the OTA.
2. **Generate prod treasury keys** — fresh EOA for
   `PLATFORM_TREASURY_ADDRESS_EVM`, fresh Solana keypair for
   `PLATFORM_TREASURY_ADDRESS_SVM` (M6). Pin private keys in
   `takumipay-api/.env` as `ARC_SETTLER_PRIVATE_KEY` /
   `SVM_SETTLER_PRIVATE_KEY`. Rollback: retain the old keys for 30 d;
   do not rotate-delete until reconciliation is complete.
3. **Fund prod relayer** — send mainnet USDC on each Gateway source
   chain we support. Rollback: drain back to ops cold wallet if
   cutover aborts.
4. **Flip Xendit** — `XENDIT_SECRET_KEY=xnd_production_…`,
   `XENDIT_ENV=production`. Do this **last**; it's what triggers real
   IDR disbursements. Rollback: flip back to
   `xnd_development_` + `sandbox`; in-flight payouts complete.
5. **Flip Circle Gateway** — `CIRCLE_GATEWAY_API=https://gateway-api.
   circle.com`. Rollback: revert to testnet URL.
6. **Flip bundler URLs** — `BUNDLER_URL_<mainnet_chainId>=<prod
   Pimlico/Alchemy>`. Server-only per §10 and task 47. Rollback:
   retain testnet entries commented for 7 d.
7. **DB update on `blockchains` + `tokens`** — run the SQL block
   from §10.1 per supported mainnet chain (Arc mainnet when launched,
   Base mainnet, Arbitrum mainnet). Mobile picks up on next
   `useBlockchains()` refresh. Rollback: point rows back to testnet
   IDs/addresses.
8. **Re-issue merchant JWS QRs** — server-side script iterates
   `merchants`, re-signs `jws_qr` with the new prod private key,
   writes back. No merchant action needed (§4.4 chain-agnostic).
   Rollback: script is idempotent — rerun against the old key re-
   signs backward.
9. **Cutover verification** — run one real IDR intent end-to-end,
   staff-only, before broad rollout. Gate on success.

## Rules (non-negotiable)

- **Three-role separation** — every credential rotation happens in
  `takumipay-api/.env` on the server; mobile only receives the
  public JWK over EAS OTA. No private key ever touches mobile.
- **Chain-extension discipline** — new mainnet chain rows land via
  SQL inserts, not by editing mobile code. `WalletKitAdapter` carries
  no mainnet-specific logic.
- **Filter at source** — mobile reads the mainnet flag from
  `blockchains.is_testnet`; never hard-code testnet vs prod on
  mobile.

## Acceptance

- [ ] Runbook document lists all 9 steps with rollback per step.
- [ ] Re-issue script is tested against staging merchants.
- [ ] Cutover checklist signed off by ops + backend lead.
- [ ] Staff-only first intent completes: USDC settles, Xendit
      webhook arrives, IDR lands in merchant account.
- [ ] `EXPO_PUBLIC_TAKUMIPAY_QR_PUBKEY_JWK` rotation pushed 48 h
      before go-live.

## Out of scope

- `PlatformTreasury.sol` deploy — not in v1 per §7.
- Refund path if cutover first intent fails (task 49).
- Credential provisioning itself (task 50).
