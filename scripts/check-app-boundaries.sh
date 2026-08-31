#!/usr/bin/env bash
#
# apps/web and apps/api must never compile each other's source. Shared contracts
# live in packages/shared (@ft/shared), which is a leaf and imports from neither.
#
# The presets differ: nest.json sets experimentalDecorators, nextjs.json does
# not, so the same file compiles differently depending on which project pulled
# it in. Worst case is Turbopack bundling @prisma/client into the browser.
#
# tsc --listFiles reports the final program, so this catches an import, a
# tsconfig `include` and a `paths` entry alike.
#
#   ./scripts/check-app-boundaries.sh
#
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

failures=0

check() {
  local pkg="$1" own="$2" forbidden="$3" listing leaked

  # Exit code ignored: a type error still prints the full listing, and typecheck
  # runs separately.
  listing="$(pnpm --filter "$pkg" exec tsc -p tsconfig.json --noEmit --listFiles 2>/dev/null || true)"

  # No own sources means nothing compiled, and grep would then report a clean
  # boundary it never checked. An unknown package name prints to stdout and
  # exits zero, so only this catches it.
  #
  # Here-string, not a pipe: grep -q exits early, the writer gets SIGPIPE, and
  # pipefail turns that into a false failure.
  if ! grep -qF "/$own/" <<<"$listing"; then
    printf 'FAIL  %s: no %s sources in the file listing, so nothing was verified\n' \
      "$pkg" "$own" >&2
    failures=$((failures + 1))
    return
  fi

  # tsc emits forward slashes on every platform.
  leaked="$(grep -F "/$forbidden/" <<<"$listing" || true)"

  if [ -n "$leaked" ]; then
    printf 'FAIL  %s compiles source from %s:\n' "$pkg" "$forbidden" >&2
    printf '%s\n' "$leaked" | sed 's/^/        /' >&2
    failures=$((failures + 1))
  else
    printf 'ok    %s does not reach into %s\n' "$pkg" "$forbidden"
  fi
}

printf 'Asserting apps/web and apps/api compile separately\n\n'

check @ft/web apps/web apps/api
check @ft/api apps/api apps/web

printf '\n'
if [ "$failures" -ne 0 ]; then
  cat >&2 <<'MSG'
Shared types belong in packages/shared (@ft/shared), which both apps may import.

To see why a file was pulled in, --explainFiles names the reason:
  pnpm --filter @ft/web exec tsc --noEmit --explainFiles | grep -B3 apps/api
MSG
  exit 1
fi

printf 'apps/web and apps/api share nothing but packages/shared.\n'
