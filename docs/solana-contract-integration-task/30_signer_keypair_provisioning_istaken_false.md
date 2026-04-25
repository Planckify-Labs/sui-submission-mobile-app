# Task 30 — Backend Ed25519 signer keypair provisioning

**Status:** Not taken
**Owner:** Shared / Ops
**Spec reference:** `solana-contract-integration-spec.md` §5.7, §10
item 1.

## Why this matters

The backend Ed25519 signer keypair is used to sign merchant quote
commitments — if compromised, an attacker could forge payment
authorizations. This task ensures the keypair is generated securely,
stored in a secrets manager, and matches the on-chain
`Config.backendSigner`.

## Scope

### Keypair generation

1. Generate a new Ed25519 keypair for production using
   `solana-keygen new` or equivalent secure method.
2. **Never** store the private key in source control, env files
   checked into git, or unencrypted config.
3. Store in a secrets manager (AWS Secrets Manager, GCP Secret
   Manager, or equivalent).

### Secrets manager integration

- API reads `SOLANA_QUOTE_SIGNER_PRIVATE_KEY` from the secrets
  manager at boot (or via env injection from the deployment platform).
- Boot-time validation: load keypair, derive public key, log a hash
  of the pubkey (not the private key) for audit.

### On-chain registration

- The keypair's public key must be set as `Config.backendSigner` on
  the deployed mainnet program (Task 29).
- Verify: `fetchTakumiPayConfig().backendSigner.toBase58()` matches
  the provisioned keypair's public key.

### Rotation plan

Per spec §10 item 1, the program supports `rotateBackendSigner`:

1. Generate new keypair in secrets manager.
2. Deploy API with both old + new keypairs (sign with both during
   overlap window).
3. Call `rotateBackendSigner(newPubkey)` on-chain.
4. Remove old keypair from secrets manager.
5. Deploy API with new keypair only.

Document this rotation procedure — don't implement automated rotation
yet.

## Rules (non-negotiable)

- **Private key never in logs, error messages, or API responses.**
- **Private key never in source control.** Not even in `.env.example`
  placeholder values that look like real keys.
- **Boot-time validation required.** If the keypair can't load or
  doesn't match the on-chain signer, the service must refuse to
  start (fail-fast).

## Acceptance

- [ ] Keypair generated and stored in secrets manager.
- [ ] API boots successfully with keypair from secrets manager.
- [ ] Boot-time validation: pubkey matches on-chain `Config.backendSigner`.
- [ ] Rotation procedure documented.
- [ ] No private key material in any committed file.

## Out of scope

- Automated rotation (future).
- Program deployment (Task 29).
- Intent creation using the keypair (Task 13).
