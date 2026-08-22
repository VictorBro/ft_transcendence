#!/usr/bin/env bash
#
# apps/web and apps/api must never compile each other's source. Shared contracts
# live in packages/shared (@ft/shared), which is a leaf and imports from neither.
#
# Why this is a gate and not a convention: the two tsconfig presets differ on
# purpose. packages/tsconfig/nest.json sets experimentalDecorators because Nest's
# injector reads design:paramtypes at runtime; nextjs.json does not, because Next
# has no injector. So the same file compiles differently depending on which
# project pulled it in. The friendly symptom is TS1241 on a Nest decorator, which
# cost an hour on 2026-08-15. The unfriendly one is Turbopack bundling
# @prisma/client and the argon2 native addon into the browser.
#
# tsc --listFiles reports the final program, so this catches every route in: a
# relative import, a tsconfig `include`, and a `paths` entry. An ESLint
# no-restricted-imports rule would only catch the first.
#
#   ./scripts/check-app-boundaries.sh
#
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

failures=0

check() {
  local pkg="$1" forbidden="$2" leaked
  # tsc always emits forward slashes, on every platform, so one pattern works.
  leaked="$(pnpm --filter "$pkg" exec tsc -p tsconfig.json --noEmit --listFiles 2>/dev/null \
    | grep -F "/$forbidden/" || true)"

  if [ -n "$leaked" ]; then
    printf 'FAIL  %s compiles source from %s:\n' "$pkg" "$forbidden" >&2
    printf '%s\n' "$leaked" | sed 's/^/        /' >&2
    failures=$((failures + 1))
  else
    printf 'ok    %s does not reach into %s\n' "$pkg" "$forbidden"
  fi
}

printf 'Asserting apps/web and apps/api compile separately\n\n'

check @ft/web apps/api
check @ft/api apps/web

printf '\n'
if [ "$failures" -ne 0 ]; then
  cat >&2 <<'MSG'
Shared types belong in packages/shared (@ft/shared), which both apps may import.

To see WHY a file was pulled in:
  pnpm --filter @ft/web exec tsc --noEmit --explainFiles | grep -B3 apps/api

It prints the reason each file entered the program: "Imported via '...' from
file '...'" for an import, "Matched by include pattern '...'" for a tsconfig
entry. That distinction is the whole diagnosis.
MSG
  exit 1
fi

printf 'apps/web and apps/api share nothing but packages/shared.\n'
