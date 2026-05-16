# `services/agent-executors`

Flat `EXECUTORS` map keyed by tool name. Per-namespace executors live in
subfolders; the top-level `index.ts` composes them into one O(1) lookup
table — call-sites use `EXECUTORS[name]` unchanged.

## Manifest

`agentManifests.json` is **generated** from the server-authoritative
`agent-api/src/agents/manifests/agentManifests.json`. Do not edit it
here — change the source and run:

```bash
pnpm --filter takumi-agent-api manifests:sync
```

The build/dev scripts in `agent-api` invoke this automatically so the
mirror cannot go stale locally. CI (`pnpm check:agents`, Task 18)
fails if the two files drift.

## Spec

See `docs/multi-agent-architecture-spec.md` §5, §7.2, §10.4.
