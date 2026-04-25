# Task 25 — Devnet deployment + Solana blockchain seed row

**Status:** Not taken
**Owner:** Shared / CI
**Spec reference:** `solana-contract-integration-spec.md` §9 Phase 4.

## Why this matters

E2E integration tests (Tasks 26–28) need a deployed TakumiPay program
on Solana devnet and a corresponding blockchain row in the API's
database. This task provisions both.

## Scope

### Devnet deployment

1. Deploy `takumi_pay` program to Solana devnet using `anchor deploy`.
2. Record the program ID (should match the declared ID in
   `lib.rs` — `6CCTEtYrk8unNhjYQ7npiLUf1iKQQJU88JSYn8EJLNYy`).
3. Initialize the program's `Config` account:
   - `owner` → deployer keypair
   - `backendSigner` → devnet Ed25519 signer pubkey
   - `paused: false`
   - `withdrawalDelay` → reasonable devnet value (e.g., 60 seconds)
4. Set up at least one SPL token mint for testing (or use devnet USDC).
5. Fund a test wallet with SOL + test tokens for E2E.

### API seed data

Add a Prisma seed script entry (or manual DB insert) for the Solana
devnet blockchain:

```typescript
{
  name: "Solana Devnet",
  isEVM: false,
  rpcUrl: "https://api.devnet.solana.com",
  solanaCluster: "devnet",
  takumiPayProgramId: "6CCTEtYrk8unNhjYQ7npiLUf1iKQQJU88JSYn8EJLNYy",
  // other fields as needed
}
```

### Environment variables (devnet)

```env
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_QUOTE_SIGNER_PRIVATE_KEY=<devnet-keypair-base58>
TAKUMI_PAY_PROGRAM_ID=6CCTEtYrk8unNhjYQ7npiLUf1iKQQJU88JSYn8EJLNYy
```

## Rules (non-negotiable)

- **Devnet keypairs only.** No mainnet keys anywhere in seed data,
  env files, or test code.
- **Config account `backendSigner` must match
  `SOLANA_QUOTE_SIGNER_PRIVATE_KEY`'s public key.** If they don't
  match, Ed25519 verification will fail on every merchant payment.
- **Program ID matches declared ID.** If it doesn't, redeploy or
  update the declared ID in `lib.rs` + rebuild.

## Acceptance

- [ ] Program deployed to devnet — `anchor deploy` succeeds.
- [ ] Config account initialized and readable.
- [ ] API seed data for Solana devnet blockchain row.
- [ ] Test wallet funded with SOL + test SPL token.
- [ ] Environment variables documented for devnet.

## Out of scope

- E2E test execution (Tasks 26–28).
- Mainnet deployment (Task 29).
