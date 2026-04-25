# Task 29 — Mainnet deployment + blockchain seed row

**Status:** Not taken
**Owner:** Shared / Ops
**Spec reference:** `solana-contract-integration-spec.md` §9 Phase 5.

## Why this matters

After devnet E2E validation (Tasks 25–28), the program must be
deployed to Solana mainnet with a corresponding production database
row so the API can verify real transactions.

## Scope

### Mainnet deployment

1. Deploy `takumi_pay` program to Solana mainnet-beta.
2. Verify program ID matches declared ID
   (`6CCTEtYrk8unNhjYQ7npiLUf1iKQQJU88JSYn8EJLNYy`).
3. Initialize `Config` account:
   - `owner` → production multisig or deploy authority
   - `backendSigner` → production Ed25519 signer pubkey (Task 30)
   - `paused: true` initially (enable after verification)
   - `withdrawalDelay` → production value (e.g., 24 hours)
4. Verify Config account on-chain matches expected values.

### API seed data

Production database entry for Solana mainnet blockchain:

```typescript
{
  name: "Solana",
  isEVM: false,
  rpcUrl: process.env.SOLANA_RPC_URL, // production RPC
  solanaCluster: "mainnet-beta",
  takumiPayProgramId: "6CCTEtYrk8unNhjYQ7npiLUf1iKQQJU88JSYn8EJLNYy",
}
```

### Environment variables (production)

```env
SOLANA_RPC_URL=<production-rpc-endpoint>
SOLANA_QUOTE_SIGNER_PRIVATE_KEY=<production-keypair>
TAKUMI_PAY_PROGRAM_ID=6CCTEtYrk8unNhjYQ7npiLUf1iKQQJU88JSYn8EJLNYy
```

### Post-deployment checks

- Read Config PDA → verify `owner`, `backendSigner`, `paused=true`.
- Attempt a test transaction with `paused=true` → should fail with
  `ContractPaused`.
- Unpause (`setPaused(false)`) only after all checks pass.

## Rules (non-negotiable)

- **Deploy authority key management.** Use hardware wallet or
  multisig for the program upgrade authority. Never store mainnet
  deploy keys in env files or repos.
- **`paused: true` at launch.** Only unpause after post-deployment
  verification. This prevents real money flowing through an unverified
  deployment.
- **RPC endpoint must be a paid/dedicated provider.** Not the public
  `api.mainnet-beta.solana.com` which has rate limits.

## Acceptance

- [ ] Program deployed to mainnet-beta.
- [ ] Config account initialized with production values.
- [ ] API database has Solana mainnet blockchain row.
- [ ] Post-deployment checks pass.
- [ ] Program is paused — no transactions possible until Task 31.

## Out of scope

- Keypair provisioning (Task 30).
- Feature flag + rollout (Task 31).
- Devnet setup (Task 25).
