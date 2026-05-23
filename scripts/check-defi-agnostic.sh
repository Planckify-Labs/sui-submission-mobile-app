#!/usr/bin/env bash
# check-defi-agnostic.sh
set -euo pipefail

SEARCH_ROOTS=(components hooks app)

PATTERN='protocolSlug === "(aave-v3-[a-z]+|lido-mainnet|curve-3pool)"|protocolSlug === '"'"'(aave-v3-[a-z]+|lido-mainnet|curve-3pool)'"'"''

ALLOWLIST=()

if ! command -v rg >/dev/null 2>&1; then
  echo "check-defi-agnostic: ripgrep (rg) not found; install it or skip this check." >&2
  exit 0
fi

EXCLUDES=()
for f in "${ALLOWLIST[@]}"; do
  EXCLUDES+=("--glob" "!$f")
done

HITS=$(rg --no-heading --line-number "$PATTERN" "${SEARCH_ROOTS[@]}" \
  --glob '!**/*.test.ts' \
  --glob '!**/*.test.tsx' \
  "${EXCLUDES[@]}" \
  || true)

if [ -z "$HITS" ]; then
  echo "defi-agnostic check: OK — no protocol-specific branches in shared code."
  exit 0
fi

echo "defi-agnostic check: FAIL"
echo "Found protocolSlug branching in shared code. Move logic to adapters."
echo "$HITS"
exit 1
