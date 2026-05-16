# Phase 1 verification and End-to-end test

**Phase 1 — MVP**

Refer to `../defi-strategies-spec.md` §23.
Implement the testing strategy for Phase 1:
- Add `Arbitrum Sepolia` and `Ethereum Holesky` to the backend seed script (§23.2).
- Create `api/src/strategies/external/testnet-fixtures/opportunities.json` for testnet discovery (§23.5).
- Ensure `readPosition` contract calls work on testnet chains.
- Run an end-to-end test on Base testnet:
  - USDC → Aave deposit
  - Withdraw
  - Rebalance
- (Optional) Add the nightly mainnet-fork CI canary job (§23.9) if Anvil infra is available.
