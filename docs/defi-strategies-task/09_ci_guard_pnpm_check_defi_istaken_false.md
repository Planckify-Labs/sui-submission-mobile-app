# CI Guard: `pnpm check:defi`

**Phase 1 — MVP**

Refer to `../defi-strategies-spec.md` §7.6.
Implement the `scripts/check-defi-agnostic.sh` script to enforce the space-docking pattern.
The script should grep `components/`, `hooks/`, and `app/` for `protocolSlug` or specific protocol slug strings (e.g., `aave-v3-`) and fail the build if found outside an allowlist.
Add the `check:defi` entry to `package.json` and append it to the `prepush` chain.
Also add a registry-parity CI test ensuring `EXPECTED_MOBILE_TOOLS` on mobile matches the server's mobile-executor tool names (§24.5).
