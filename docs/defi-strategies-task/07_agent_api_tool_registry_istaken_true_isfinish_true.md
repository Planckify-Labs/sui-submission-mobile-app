# `agent-api/` tool-registry update

**Phase 1 — MVP**

Refer to `../defi-strategies-spec.md` §12.
Update `agent-api/src/tools/registry.ts` adding `defi_*` entries with `executor: "mobile"`.
Add the system prompt fragment guiding the LLM on tier, whitelist constraints, and calling `defi_list_opportunities`.