# Mobile `services/defi/` skeleton and adapters

**Phase 1 — MVP**

Refer to `../defi-strategies-spec.md` §6 and §7.
Implement:
- `services/defi/types.ts` (`DefiProtocolAdapter` interface)
- `services/defi/registry.ts`
- `services/defi/bootstrap.ts`
- Adapters in `services/defi/adapters/`:
  - `aaveV3.ts` (Ethereum, Base, Arbitrum)
  - `lido.ts` (Mainnet)
  - `curve3pool.ts`
- Tools and Executor Registrations (`services/defi/tools/*`, `services/agent-executors/defi/*`).