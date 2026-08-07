#!/usr/bin/env bash
#
# Guards docs/VERSIONS.md trap 1.
#
# TypeScript 7 is npm `latest` and breaks this stack twice over: the native
# compiler has no decorator support, so NestJS cannot compile, and
# typescript-eslint peers on `typescript <6.1.0`, so linting dies too. A single
# `pnpm up --latest` reintroduces it silently, which is why this runs in CI.
#
# Four independent surfaces are checked, because any one of them can drift on
# its own: the manifests, the pnpm override, the lockfile, and what is actually
# installed on disk.
#
#   ./scripts/assert-ts-version.sh
#
set -euo pipefail

EXPECTED="6.0.3"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

failures=0

fail() {
  printf 'FAIL  %s\n' "$1" >&2
  failures=$((failures + 1))
}

pass() {
  printf 'ok    %s\n' "$1"
}

printf 'Asserting typescript == %s\n\n' "$EXPECTED"

# --- 1. workspace manifests --------------------------------------------------
# A caret here is as bad as a wrong pin: `^6.0.3` resolves to 6.x today and to
# whatever 6.x ships tomorrow, and the lockfile is the only thing holding it.
manifests=(package.json)
while IFS= read -r manifest; do
  manifests+=("$manifest")
done < <(find apps packages e2e -mindepth 1 -maxdepth 2 -name package.json -not -path '*/node_modules/*' 2>/dev/null | sort)

for manifest in "${manifests[@]}"; do
  [ -f "$manifest" ] || continue
  while IFS= read -r declared; do
    if [ "$declared" != "$EXPECTED" ]; then
      fail "$manifest declares typescript \"$declared\", expected \"$EXPECTED\""
    fi
  done < <(grep -oE '"typescript": *"[^"]*"' "$manifest" | sed -E 's/.*"typescript": *"([^"]*)".*/\1/')
done
[ "$failures" -eq 0 ] && pass "every package.json pins typescript exactly"

# --- 2. pnpm override --------------------------------------------------------
# The override is what stops a transitive dependency dragging a second major
# into the store. Its absence is a silent regression, so assert it explicitly.
before=$failures
if ! grep -qE "^ +typescript: *['\"]?${EXPECTED}['\"]?$" pnpm-workspace.yaml; then
  fail "pnpm-workspace.yaml is missing 'typescript: ${EXPECTED}' under overrides"
fi
[ "$failures" -eq "$before" ] && pass "pnpm-workspace.yaml overrides typescript to ${EXPECTED}"

# --- 3. lockfile -------------------------------------------------------------
# Package keys in a v9 lockfile are 'name@version:' at two-space indent, under
# both `packages:` and `snapshots:`. Any key other than the expected one means a
# second copy is resolvable.
before=$failures
resolved_in_lock="$(grep -oE '^  typescript@[^:]+:' pnpm-lock.yaml | sed -E 's/^  typescript@(.*):$/\1/' | sort -u || true)"
if [ -z "$resolved_in_lock" ]; then
  fail "pnpm-lock.yaml contains no typescript entry at all"
else
  while IFS= read -r version; do
    [ -n "$version" ] || continue
    if [ "$version" != "$EXPECTED" ]; then
      fail "pnpm-lock.yaml resolves typescript@${version}"
    fi
  done <<<"$resolved_in_lock"
fi
[ "$failures" -eq "$before" ] && pass "pnpm-lock.yaml resolves typescript@${EXPECTED} and nothing else"

# --- 4. what is on disk ------------------------------------------------------
# Skipped rather than failed when node_modules is absent, so the script is also
# usable on a fresh clone before the first install.
before=$failures
if [ -d node_modules/.pnpm ]; then
  installed="$(find node_modules/.pnpm -maxdepth 1 -name 'typescript@*' -printf '%f\n' 2>/dev/null | sed -E 's/^typescript@([^_]+).*/\1/' | sort -u || true)"
  if [ -z "$installed" ]; then
    fail "node_modules/.pnpm has no typescript package"
  else
    while IFS= read -r version; do
      [ -n "$version" ] || continue
      if [ "$version" != "$EXPECTED" ]; then
        fail "node_modules/.pnpm contains typescript@${version}"
      fi
    done <<<"$installed"
  fi
  [ "$failures" -eq "$before" ] && pass "installed store holds typescript@${EXPECTED} only"
else
  printf 'skip  node_modules/.pnpm not present, on-disk check skipped\n'
fi

printf '\n'
if [ "$failures" -ne 0 ]; then
  cat >&2 <<EOF
${failures} check(s) failed.

typescript must be exactly ${EXPECTED} everywhere. See docs/VERSIONS.md trap 1.
Fix by pinning the exact version in the offending manifest and re-running
'pnpm install --lockfile-only', not by relaxing this script.
EOF
  exit 1
fi

printf 'typescript is pinned at %s across manifests, override, lockfile and disk.\n' "$EXPECTED"
